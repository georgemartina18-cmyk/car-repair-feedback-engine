-- =============================================================================
-- Reputation & Feedback Intelligence Engine - stored functions
-- All multi-step writes happen inside ONE function call = one transaction, so an
-- n8n node failing half-way can never leave a feedback without its case/alerts.
-- =============================================================================

-- ---------------------------------------------------------------- settings
CREATE OR REPLACE FUNCTION rfe_settings() RETURNS jsonb LANGUAGE sql STABLE AS $$
  -- 'runtime' holds deployment secrets; it is read explicitly where needed, never broadcast.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM app_settings WHERE key <> 'runtime';
$$;

CREATE OR REPLACE FUNCTION rfe_setting(p_key text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT value FROM app_settings WHERE key = p_key;
$$;

-- ---------------------------------------------------------------- helpers
-- Next moment outside the quiet-hours window, in the branch's local time.
CREATE OR REPLACE FUNCTION rfe_next_send_time(p_ts timestamptz, p_tz text, p_quiet jsonb)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
  st time; en time; lt time; loc timestamp; in_quiet boolean; target date;
BEGIN
  IF p_quiet IS NULL OR p_quiet->>'start' IS NULL OR p_quiet->>'end' IS NULL THEN RETURN p_ts; END IF;
  st := (p_quiet->>'start')::time; en := (p_quiet->>'end')::time;
  loc := p_ts AT TIME ZONE coalesce(p_tz, 'UTC');
  lt := loc::time;
  IF st > en THEN in_quiet := lt >= st OR lt < en; ELSE in_quiet := lt >= st AND lt < en; END IF;
  IF NOT in_quiet THEN RETURN p_ts; END IF;
  target := loc::date + CASE WHEN st > en AND lt >= st THEN 1 ELSE 0 END;
  RETURN (target + en) AT TIME ZONE coalesce(p_tz, 'UTC');
END $$;

CREATE OR REPLACE FUNCTION rfe_html_escape(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

CREATE OR REPLACE FUNCTION rfe_status_for_lane(p_lane text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_lane WHEN 'escalated' THEN 'escalated' WHEN 'in_queue' THEN 'in_queue'
                     WHEN 'ready_to_post' THEN 'ready_to_post' ELSE 'logged' END;
$$;

-- Every contact relevant to a branch: its own team/lead, its region's managers,
-- and group-wide roles (HQ, ops director, marketing).
CREATE OR REPLACE FUNCTION rfe_branch_contacts(p_branch_id int) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'role', c.role, 'whatsapp', c.whatsapp, 'email', c.email,
           'notify_whatsapp', c.notify_whatsapp, 'notify_email', c.notify_email, 'notify_sms', c.notify_sms,
           'active', c.active) ORDER BY c.id), '[]'::jsonb)
  FROM staff_contacts c
  JOIN branches b ON b.id = p_branch_id
  WHERE c.active AND (
        (c.role IN ('branch_team','branch_lead') AND c.branch_id = b.id)
     OR (c.role = 'regional_manager' AND c.region_id = b.region_id)
     OR (c.role IN ('hq','ops_director','marketing','admin') AND c.branch_id IS NULL AND c.region_id IS NULL));
$$;

-- Generic outbox insert. p: { audience, kind, priority, channels[], to_phone, to_email,
-- wa_template, text, email_subject, email_html, respect_quiet_hours, timezone,
-- request_id, feedback_id, case_id, contact_id, dedupe_key, send_at }
CREATE OR REPLACE FUNCTION rfe_enqueue(p jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_id bigint;
  v_at timestamptz := coalesce((p->>'send_at')::timestamptz, now());
BEGIN
  IF coalesce((p->>'respect_quiet_hours')::boolean, false) THEN
    v_at := rfe_next_send_time(v_at, p->>'timezone', rfe_setting('collection')->'quiet_hours');
  END IF;
  INSERT INTO outbox (audience, kind, priority, channels, to_phone, to_email, wa_template, text,
                      email_subject, email_html, next_attempt_at, request_id, feedback_id, case_id,
                      contact_id, dedupe_key)
  VALUES (p->>'audience', p->>'kind', coalesce((p->>'priority')::smallint, 5),
          ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'channels', '[]'::jsonb))),
          p->>'to_phone', p->>'to_email', CASE WHEN jsonb_typeof(p->'wa_template') = 'object' THEN p->'wa_template' END,
          p->>'text', p->>'email_subject', p->>'email_html', v_at,
          (p->>'request_id')::uuid, (p->>'feedback_id')::uuid, (p->>'case_id')::uuid,
          (p->>'contact_id')::int, p->>'dedupe_key')
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================================
-- 1. Job completed -> feedback request
-- ============================================================================
-- p = canonical job from inbound.normalizeJobEvent()
CREATE OR REPLACE FUNCTION rfe_register_job(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  coll jsonb := rfe_setting('collection');
  b branches%ROWTYPE;
  v_customer_id bigint; v_job_id bigint; v_req feedback_requests%ROWTYPE;
  v_cust customers%ROWTYPE;
  v_reason text;
  v_completed timestamptz := coalesce((p->>'completed_at')::timestamptz, now());
BEGIN
  SELECT * INTO b FROM branches WHERE code = p->>'branch_code';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'unknown_branch', 'branch_code', p->>'branch_code');
  END IF;
  IF NOT b.active THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'branch_inactive', 'branch_code', b.code);
  END IF;

  -- customer (phone is the identity; email-only customers matched by email)
  IF p->>'customer_phone' IS NOT NULL THEN
    INSERT INTO customers (phone, email, name, marketing_consent)
    VALUES (p->>'customer_phone', p->>'customer_email', p->>'customer_name', coalesce((p->>'marketing_consent')::boolean, false))
    ON CONFLICT (phone) DO UPDATE
      SET email = coalesce(excluded.email, customers.email),
          name = coalesce(excluded.name, customers.name),
          updated_at = now()
    RETURNING id INTO v_customer_id;
  ELSE
    SELECT id INTO v_customer_id FROM customers WHERE lower(email) = lower(p->>'customer_email') ORDER BY id LIMIT 1;
    IF v_customer_id IS NULL THEN
      INSERT INTO customers (email, name) VALUES (p->>'customer_email', p->>'customer_name') RETURNING id INTO v_customer_id;
    ELSE
      UPDATE customers SET name = coalesce(p->>'customer_name', name), updated_at = now() WHERE id = v_customer_id;
    END IF;
  END IF;
  SELECT * INTO v_cust FROM customers WHERE id = v_customer_id;

  -- job (idempotent on source_system + external id: a re-sent webhook is a no-op)
  INSERT INTO jobs (source_system, external_job_id, branch_id, customer_id, service_type, technician, advisor,
                    vehicle_reg, vehicle, invoice_total, completed_at, raw)
  VALUES (coalesce(p->>'source_system', 'dms'), p->>'external_job_id', b.id, v_customer_id, p->>'service_type',
          p->>'technician', p->>'advisor', p->>'vehicle_reg', p->>'vehicle', (p->>'invoice_total')::numeric,
          v_completed, p->'raw')
  ON CONFLICT (source_system, external_job_id) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT r.* INTO v_req FROM feedback_requests r JOIN jobs j ON j.id = r.job_id
     WHERE j.source_system = coalesce(p->>'source_system', 'dms') AND j.external_job_id = p->>'external_job_id';
    RETURN jsonb_build_object('status', 'duplicate', 'request_id', v_req.id, 'request_status', v_req.status);
  END IF;

  -- suppression rules
  IF v_cust.opted_out THEN
    v_reason := 'opted_out';
  ELSIF coll->'excluded_service_types' ? lower(coalesce(p->>'service_type', '')) THEN
    v_reason := 'excluded_service_type';
  ELSIF v_completed < now() - make_interval(hours => coalesce((coll->>'max_job_age_hours')::int, 72)) THEN
    v_reason := 'job_too_old';
  ELSIF EXISTS (SELECT 1 FROM feedback_requests r
                 WHERE r.customer_id = v_customer_id AND r.status <> 'suppressed'
                   AND r.created_at > now() - make_interval(days => coalesce((coll->>'survey_cooldown_days')::int, 14))) THEN
    v_reason := 'cooldown';
  END IF;

  INSERT INTO feedback_requests (job_id, customer_id, branch_id, status, suppressed_reason, expires_at)
  VALUES (v_job_id, v_customer_id, b.id, CASE WHEN v_reason IS NULL THEN 'queued' ELSE 'suppressed' END, v_reason,
          now() + make_interval(days => coalesce((coll->>'request_expiry_days')::int, 7)))
  RETURNING * INTO v_req;

  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'suppressed', 'reason', v_reason, 'request_id', v_req.id);
  END IF;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'request_id', v_req.id,
    'token', v_req.token,
    'send_at', rfe_next_send_time(now(), b.timezone, coll->'quiet_hours'),
    'branch', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'timezone', b.timezone, 'phone', b.phone),
    'customer', jsonb_build_object('id', v_cust.id, 'name', v_cust.name, 'phone', v_cust.phone, 'email', v_cust.email),
    'job', jsonb_build_object('id', p->>'external_job_id', 'service_type', p->>'service_type',
                              'vehicle', p->>'vehicle', 'vehicle_reg', p->>'vehicle_reg'),
    'settings', rfe_settings());
END $$;

-- ============================================================================
-- 2. Inbound message -> context for scoring
-- ============================================================================
-- p = normalised message (inbound.js). Stores the raw message FIRST so nothing is
-- lost even if scoring fails later, then returns everything the scorer needs.
CREATE OR REPLACE FUNCTION rfe_lookup_inbound(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  coll jsonb := rfe_setting('collection');
  rep jsonb := rfe_setting('repeat_customer');
  v_req feedback_requests%ROWTYPE;
  v_cust customers%ROWTYPE;
  v_job jobs%ROWTYPE;
  b branches%ROWTYPE;
  f feedback%ROWTYPE;
  v_case cases%ROWTYPE;
  v_msg_id bigint;
  v_hint uuid;
  v_text text := nullif(btrim(coalesce(p->>'text', '')), '');
  v_hist jsonb;
BEGIN
  IF p->>'provider_message_id' IS NOT NULL AND EXISTS (
       SELECT 1 FROM feedback_messages WHERE channel = p->>'channel' AND provider_message_id = p->>'provider_message_id') THEN
    RETURN jsonb_build_object('action', 'duplicate');
  END IF;

  -- (a) our own form: token identifies the request
  IF p->>'request_token' IS NOT NULL THEN
    SELECT * INTO v_req FROM feedback_requests WHERE token = p->>'request_token';
  END IF;
  -- (b) WhatsApp button payload carries the request id; only trusted if the phone matches
  IF v_req.id IS NULL AND p->>'request_id_hint' ~* '^[0-9a-f-]{36}$' THEN
    v_hint := (p->>'request_id_hint')::uuid;
    SELECT r.* INTO v_req FROM feedback_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.id = v_hint AND c.phone = p->>'from_phone';
  END IF;
  -- (c) most recent open request for this phone number
  IF v_req.id IS NULL AND p->>'from_phone' IS NOT NULL THEN
    SELECT * INTO v_cust FROM customers WHERE phone = p->>'from_phone';
    IF FOUND THEN
      SELECT * INTO v_req FROM feedback_requests
       WHERE customer_id = v_cust.id AND status IN ('sent','delivered','read','responded')
         AND coalesce(sent_at, queued_at) > now() - make_interval(days => coalesce((coll->>'reply_window_days')::int, 7))
       ORDER BY coalesce(sent_at, queued_at) DESC LIMIT 1;
      -- (d) unsolicited message from a known customer: attach to their latest job (90 days)
      IF v_req.id IS NULL THEN
        SELECT * INTO v_job FROM jobs WHERE customer_id = v_cust.id AND completed_at > now() - interval '90 days'
         ORDER BY completed_at DESC LIMIT 1;
        IF FOUND THEN
          SELECT * INTO v_req FROM feedback_requests WHERE job_id = v_job.id;
          IF NOT FOUND THEN
            INSERT INTO feedback_requests (job_id, customer_id, branch_id, status, unsolicited, sent_at, channel_used)
            VALUES (v_job.id, v_cust.id, v_job.branch_id, 'responded', true, now(), p->>'channel')
            RETURNING * INTO v_req;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_req.id IS NULL THEN
    INSERT INTO unmatched_inbound (channel, from_address, provider_message_id, body, payload)
    VALUES (p->>'channel', coalesce(p->>'from_phone', p->>'request_token'), p->>'provider_message_id', p->>'text', p);
    RETURN jsonb_build_object('action', 'unmatched');
  END IF;

  SELECT * INTO v_cust FROM customers WHERE id = v_req.customer_id;
  SELECT * INTO v_job FROM jobs WHERE id = v_req.job_id;
  SELECT * INTO b FROM branches WHERE id = v_req.branch_id;
  SELECT * INTO f FROM feedback WHERE request_id = v_req.id;
  IF f.id IS NOT NULL THEN SELECT * INTO v_case FROM cases WHERE feedback_id = f.id; END IF;

  BEGIN
    INSERT INTO feedback_messages (request_id, feedback_id, customer_id, direction, channel, provider_message_id,
                                   body, rating, from_address, payload, received_at)
    VALUES (v_req.id, f.id, v_cust.id, 'in', p->>'channel', p->>'provider_message_id', v_text, p->>'rating',
            coalesce(p->>'from_phone', v_cust.email), p, coalesce((p->>'received_at')::timestamptz, now()))
    RETURNING id INTO v_msg_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('action', 'duplicate');
  END;

  -- Repeat-customer history: previous NEGATIVE feedback on OTHER visits, any branch.
  SELECT jsonb_build_object(
           'previous_negative_count', count(*),
           'previous_negatives', coalesce(jsonb_agg(jsonb_build_object(
               'created_at', x.created_at, 'branch_name', x.branch_name, 'tier', x.tier,
               'score', x.score, 'summary', x.summary, 'status', x.status) ORDER BY x.created_at DESC)
             FILTER (WHERE x.rn <= 3), '[]'::jsonb))
    INTO v_hist
    FROM (SELECT fb.created_at, br.name AS branch_name, fb.tier, fb.score, fb.summary, fb.status,
                 row_number() OVER (ORDER BY fb.created_at DESC) AS rn
            FROM feedback fb JOIN branches br ON br.id = fb.branch_id
           WHERE fb.customer_id = v_cust.id AND fb.request_id <> v_req.id
             AND (fb.score < 0 OR fb.tier IN ('P1_CRITICAL','P2_HIGH','P3_MEDIUM','P4_LOW'))
             AND fb.created_at > now() - make_interval(days => coalesce((rep->>'lookback_days')::int, 365))) x;

  RETURN jsonb_build_object(
    'action', 'process',
    'message_id', v_msg_id,
    'request_id', v_req.id,
    'channel', p->>'channel',
    'new_text', v_text,
    'rating', p->>'rating',
    'previous_text', f.customer_text,
    'previous_rating', f.rating,
    'customer', jsonb_build_object('id', v_cust.id, 'name', coalesce(v_cust.name, p->>'profile_name'),
                                   'phone', v_cust.phone, 'email', v_cust.email, 'opted_out', v_cust.opted_out,
                                   'channel', p->>'channel'),
    'job', jsonb_build_object('id', v_job.external_job_id, 'service_type', v_job.service_type, 'vehicle', v_job.vehicle,
                              'vehicle_reg', v_job.vehicle_reg, 'technician', v_job.technician,
                              'completed_at', v_job.completed_at),
    'branch', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'phone', b.phone, 'timezone', b.timezone,
                                 'google_review_url', b.google_review_url, 'region_id', b.region_id),
    'feedback', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object(
                  'id', f.id, 'tier', f.tier, 'lane', f.lane, 'status', f.status,
                  'consent_requested', f.consent_requested, 'testimonial_consent', f.testimonial_consent,
                  'auto_reply_keys', to_jsonb(f.auto_reply_keys)) END,
    'consent_pending', coalesce(f.consent_requested AND f.testimonial_consent IS NULL, false),
    'case_token', v_case.token,
    'contacts', rfe_branch_contacts(b.id),
    'history', v_hist,
    'settings', rfe_settings());
END $$;

-- ============================================================================
-- 3. Opt-out / opt-in / testimonial consent replies
-- ============================================================================
-- p: { intent, request_id, message_id, reply: {outbox fields} | null }
CREATE OR REPLACE FUNCTION rfe_apply_intent(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_req feedback_requests%ROWTYPE;
  v_fid uuid;
  v_out bigint;
BEGIN
  SELECT * INTO v_req FROM feedback_requests WHERE id = (p->>'request_id')::uuid;
  SELECT id INTO v_fid FROM feedback WHERE request_id = v_req.id;
  UPDATE feedback_messages SET intent = p->>'intent', feedback_id = coalesce(feedback_id, v_fid)
   WHERE id = (p->>'message_id')::bigint;

  CASE p->>'intent'
    WHEN 'opt_out' THEN
      UPDATE customers SET opted_out = true, opted_out_at = now(), updated_at = now() WHERE id = v_req.customer_id;
      -- stop anything still queued to this customer (except the confirmation below)
      UPDATE outbox o SET status = 'cancelled', last_error = 'customer opted out'
        FROM feedback_requests r
       WHERE o.request_id = r.id AND r.customer_id = v_req.customer_id AND o.status = 'pending' AND o.audience = 'customer';
    WHEN 'opt_in' THEN
      UPDATE customers SET opted_out = false, opted_out_at = NULL, updated_at = now() WHERE id = v_req.customer_id;
    WHEN 'consent_yes' THEN
      UPDATE feedback SET testimonial_consent = true, updated_at = now() WHERE id = v_fid;
      UPDATE ready_to_post SET customer_consent = true, updated_at = now() WHERE feedback_id = v_fid;
    WHEN 'consent_no' THEN
      UPDATE feedback SET testimonial_consent = false, updated_at = now() WHERE id = v_fid;
      UPDATE ready_to_post SET customer_consent = false, updated_at = now() WHERE feedback_id = v_fid;
    ELSE NULL;
  END CASE;

  IF jsonb_typeof(p->'reply') = 'object' THEN
    v_out := rfe_enqueue((p->'reply') || jsonb_build_object('request_id', v_req.id, 'feedback_id', v_fid));
  END IF;
  RETURN jsonb_build_object('ok', true, 'intent', p->>'intent', 'outbox_id', v_out);
END $$;

-- ============================================================================
-- 4. Save scored feedback + route (feedback, case, draft, ready-to-post, outbox)
-- ============================================================================
-- p: { request_id, message_id, channel, rating, customer_text, scored:{...}, routing:{...}, llm_raw }
CREATE OR REPLACE FUNCTION rfe_save_feedback(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  s jsonb := p->'scored';
  r jsonb := p->'routing';
  v_req feedback_requests%ROWTYPE;
  b branches%ROWTYPE;
  f feedback%ROWTYPE;
  v_case cases%ROWTYPE;
  v_is_new boolean;
  v_status text;
  v_lane text := r->>'lane';
  v_tier text := r->>'tier';
  v_prev_tier text;
  v_msg jsonb;
  v_out bigint;
  v_outs bigint[] := '{}';
  v_draft_id uuid;
  v_keys text[];
  tier_rank CONSTANT text[] := ARRAY['POSITIVE','NEUTRAL','P4_LOW','P3_MEDIUM','P2_HIGH','P1_CRITICAL'];
BEGIN
  SELECT * INTO v_req FROM feedback_requests WHERE id = (p->>'request_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown request %', p->>'request_id'; END IF;
  SELECT * INTO b FROM branches WHERE id = v_req.branch_id;
  SELECT * INTO f FROM feedback WHERE request_id = v_req.id FOR UPDATE;
  v_is_new := f.id IS NULL;
  v_prev_tier := f.tier;

  -- Status label. Manual outcomes (posted / not_posted / resolved) are kept unless
  -- the customer's new message moves the feedback into a worse lane.
  v_status := rfe_status_for_lane(v_lane);
  IF NOT v_is_new THEN
    IF f.status IN ('posted','not_posted') AND v_lane = 'ready_to_post' THEN v_status := f.status; END IF;
    IF f.status = 'resolved' AND array_position(tier_rank, v_tier) <= array_position(tier_rank, f.tier) THEN v_status := 'resolved'; END IF;
  END IF;

  IF v_is_new THEN
    INSERT INTO feedback (request_id, branch_id, job_id, customer_id, channel, rating, customer_text, score, score_100,
      intensity, severity_index, emotion, sentiment_label, severity_label, tier, initial_tier, lane, status,
      repeat_customer, previous_negative_count, categories, issues, positives, flags, reasons, staff_mentioned,
      summary, recommended_action, language, scoring_method, model, components, llm_raw, testimonial_candidate)
    VALUES (v_req.id, v_req.branch_id, v_req.job_id, v_req.customer_id, p->>'channel', p->>'rating', p->>'customer_text',
      (s->>'score')::numeric, (s->>'score_100')::smallint, (s->>'intensity')::numeric, (s->>'severity_index')::smallint,
      s->>'emotion', s->>'sentiment_label', s->>'severity_label', v_tier, v_tier, v_lane, v_status,
      coalesce((s->'flags'->>'repeat_customer')::boolean, false), coalesce((s->>'previous_negative_count')::int, 0),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'categories', '[]'))),
      coalesce(s->'issues', '[]'), coalesce(s->'positives', '[]'), coalesce(s->'flags', '{}'),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'reasons', '[]'))),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'staff_mentioned', '[]'))),
      s->>'summary', s->>'recommended_action', s->>'language', coalesce(s->>'method', 'rules'), s->>'model',
      s->'components', p->'llm_raw', coalesce((s->>'testimonial_candidate')::boolean, false))
    RETURNING * INTO f;
  ELSE
    UPDATE feedback SET
      rating = coalesce(p->>'rating', rating), customer_text = p->>'customer_text',
      score = (s->>'score')::numeric, score_100 = (s->>'score_100')::smallint, intensity = (s->>'intensity')::numeric,
      severity_index = (s->>'severity_index')::smallint, emotion = s->>'emotion',
      sentiment_label = s->>'sentiment_label', severity_label = s->>'severity_label',
      tier = v_tier, lane = v_lane,
      status = v_status, status_changed_at = CASE WHEN status <> v_status THEN now() ELSE status_changed_at END,
      repeat_customer = coalesce((s->'flags'->>'repeat_customer')::boolean, false),
      previous_negative_count = coalesce((s->>'previous_negative_count')::int, 0),
      categories = ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'categories', '[]'))),
      issues = coalesce(s->'issues', '[]'), positives = coalesce(s->'positives', '[]'), flags = coalesce(s->'flags', '{}'),
      reasons = ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'reasons', '[]'))),
      staff_mentioned = ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'staff_mentioned', '[]'))),
      summary = s->>'summary', recommended_action = s->>'recommended_action', language = s->>'language',
      scoring_method = coalesce(s->>'method', scoring_method), model = s->>'model', components = s->'components',
      llm_raw = coalesce(p->'llm_raw', llm_raw),
      testimonial_candidate = coalesce((s->>'testimonial_candidate')::boolean, false),
      rescored_count = rescored_count + 1, updated_at = now()
    WHERE id = f.id RETURNING * INTO f;
  END IF;

  UPDATE feedback_messages SET feedback_id = f.id, intent = coalesce(intent, 'feedback')
   WHERE request_id = v_req.id AND feedback_id IS NULL;
  UPDATE feedback_requests SET status = 'responded', responded_at = coalesce(responded_at, now()) WHERE id = v_req.id;
  -- customer already answered: never send them the (queued) request or a reminder
  UPDATE outbox SET status = 'cancelled', last_error = 'customer already responded'
   WHERE request_id = v_req.id AND kind IN ('feedback_request', 'feedback_reminder') AND status = 'pending';

  -- ---------------------------------------------------------------- case
  IF coalesce((r->>'create_case')::boolean, false) THEN
    SELECT * INTO v_case FROM cases WHERE feedback_id = f.id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO cases (feedback_id, branch_id, tier, ack_due_at, contact_due_at, resolve_due_at)
      VALUES (f.id, f.branch_id, v_tier,
              now() + make_interval(mins => (r->'sla'->>'ack_minutes')::int),
              now() + make_interval(mins => (r->'sla'->>'contact_minutes')::int),
              now() + make_interval(mins => (r->'sla'->>'resolve_minutes')::int))
      RETURNING * INTO v_case;
      INSERT INTO case_events (case_id, event, actor, details)
      VALUES (v_case.id, 'opened', 'system', jsonb_build_object('tier', v_tier, 'lane', v_lane,
              'score', s->'score', 'severity', s->'severity_index', 'reasons', s->'reasons'));
      IF coalesce((s->'flags'->>'repeat_customer')::boolean, false) THEN
        INSERT INTO case_events (case_id, event, actor, details)
        VALUES (v_case.id, 'repeat_customer', 'system', jsonb_build_object('previous_negative_count', s->'previous_negative_count'));
      END IF;
    ELSIF array_position(tier_rank, v_tier) > array_position(tier_rank, v_case.tier) THEN
      UPDATE cases SET
        tier = v_tier,
        status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
        ack_due_at = CASE WHEN r->'sla'->>'ack_minutes' IS NULL THEN ack_due_at
                          ELSE least(coalesce(ack_due_at, 'infinity'), now() + make_interval(mins => (r->'sla'->>'ack_minutes')::int)) END,
        contact_due_at = CASE WHEN r->'sla'->>'contact_minutes' IS NULL THEN contact_due_at
                          ELSE least(coalesce(contact_due_at, 'infinity'), now() + make_interval(mins => (r->'sla'->>'contact_minutes')::int)) END,
        resolve_due_at = least(coalesce(resolve_due_at, 'infinity'), now() + make_interval(mins => coalesce((r->'sla'->>'resolve_minutes')::int, 4320))),
        escalation_level = 0, updated_at = now()
      WHERE id = v_case.id RETURNING * INTO v_case;
      INSERT INTO case_events (case_id, event, actor, details)
      VALUES (v_case.id, 'tier_upgraded', 'system', jsonb_build_object('from', v_prev_tier, 'to', v_tier, 'lane', v_lane));
    END IF;
  END IF;

  -- ---------------------------------------------------------------- draft reply (never auto-sent)
  IF jsonb_typeof(r->'draft') = 'object' THEN
    INSERT INTO response_drafts (feedback_id, source, quoted_text, draft_text)
    VALUES (f.id, r->'draft'->>'source', r->'draft'->>'quote', r->'draft'->>'text')
    ON CONFLICT (feedback_id) DO UPDATE
      SET draft_text = excluded.draft_text, source = excluded.source, quoted_text = excluded.quoted_text, updated_at = now()
      WHERE response_drafts.status = 'draft' AND NOT response_drafts.edited
    RETURNING id INTO v_draft_id;
    IF v_draft_id IS NULL THEN SELECT id INTO v_draft_id FROM response_drafts WHERE feedback_id = f.id; END IF;
  END IF;

  -- ---------------------------------------------------------------- ready to post (never auto-published)
  IF coalesce((r->>'ready_to_post')::boolean, false) THEN
    INSERT INTO ready_to_post (feedback_id, branch_id, original_text, display_name, highlighted)
    SELECT f.id, f.branch_id, f.customer_text,
           split_part(coalesce(c.name, 'Customer'), ' ', 1) || ', ' || b.name,
           coalesce((s->>'testimonial_candidate')::boolean, false)
      FROM customers c WHERE c.id = f.customer_id
    ON CONFLICT (feedback_id) DO UPDATE
      SET original_text = excluded.original_text, highlighted = excluded.highlighted, updated_at = now()
      WHERE ready_to_post.status = 'ready_to_post' AND ready_to_post.edited_text IS NULL;
  END IF;

  IF coalesce((r->>'ask_consent')::boolean, false) THEN
    UPDATE feedback SET consent_requested = true WHERE id = f.id;
  END IF;

  -- ---------------------------------------------------------------- outbox
  FOR v_msg IN SELECT * FROM jsonb_array_elements(coalesce(r->'staff_messages', '[]')) LOOP
    v_msg := (replace(v_msg::text, '__CASE_TOKEN__', coalesce(v_case.token, '')))::jsonb;
    v_out := rfe_enqueue(v_msg || jsonb_build_object('feedback_id', f.id, 'case_id', v_case.id,
                                                     'request_id', v_req.id, 'timezone', b.timezone));
    IF v_out IS NOT NULL THEN v_outs := v_outs || v_out; END IF;
  END LOOP;
  IF jsonb_typeof(r->'customer_message') = 'object' THEN
    v_out := rfe_enqueue((r->'customer_message') || jsonb_build_object('feedback_id', f.id, 'request_id', v_req.id,
                                                                       'timezone', b.timezone));
    IF v_out IS NOT NULL THEN
      v_outs := v_outs || v_out;
      v_keys := array_append(f.auto_reply_keys, r->'customer_message'->>'template_key');
      UPDATE feedback SET auto_reply_keys = v_keys WHERE id = f.id;
    END IF;
  END IF;

  IF v_case.id IS NOT NULL AND jsonb_array_length(coalesce(r->'notified_roles', '[]')) > 0 THEN
    UPDATE cases SET notified_roles = ARRAY(SELECT DISTINCT unnest(notified_roles || ARRAY(SELECT jsonb_array_elements_text(r->'notified_roles'))))
     WHERE id = v_case.id;
    INSERT INTO case_events (case_id, event, actor, details)
    VALUES (v_case.id, 'notified', 'system', jsonb_build_object('roles', r->'notified_roles', 'messages', cardinality(v_outs)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'feedback_id', f.id, 'is_new', v_is_new, 'tier', v_tier, 'lane', v_lane,
                            'status', v_status, 'case_id', v_case.id, 'draft_id', v_draft_id, 'outbox_ids', to_jsonb(v_outs));
END $$;

-- ============================================================================
-- 5. Outbox dispatch
-- ============================================================================
CREATE OR REPLACE FUNCTION rfe_claim_outbox(p_limit int DEFAULT 25) RETURNS SETOF outbox LANGUAGE plpgsql AS $$
BEGIN
  -- recover rows stuck in 'sending' (worker crashed mid-send)
  UPDATE outbox SET status = 'pending', locked_at = NULL
   WHERE status = 'sending' AND locked_at < now() - interval '10 minutes';
  RETURN QUERY
  WITH claimed AS (
    UPDATE outbox o SET status = 'sending', locked_at = now()
     WHERE o.id IN (SELECT id FROM outbox
                     WHERE status = 'pending' AND next_attempt_at <= now()
                     ORDER BY priority, next_attempt_at, id
                     FOR UPDATE SKIP LOCKED LIMIT p_limit)
    RETURNING o.*)
  SELECT * FROM claimed ORDER BY priority, id;
END $$;

-- p: { outbox_id, channel, ok, provider_message_id, error, error_code, permanent }
CREATE OR REPLACE FUNCTION rfe_record_send_result(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  o outbox%ROWTYPE;
  v_channel text := p->>'channel';
  v_max_channel_attempts int := 3;
  v_remaining text[];
BEGIN
  SELECT * INTO o FROM outbox WHERE id = (p->>'outbox_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown outbox id'); END IF;

  IF v_channel = 'none' THEN
    UPDATE outbox SET status = 'failed', last_error = coalesce(last_error, 'no usable channel/address'), locked_at = NULL WHERE id = o.id;
    IF o.kind IN ('feedback_request') THEN UPDATE feedback_requests SET status = 'failed' WHERE id = o.request_id AND status = 'queued'; END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF coalesce((p->>'ok')::boolean, false) THEN
    UPDATE outbox SET status = 'sent', sent_channel = v_channel, provider_message_id = p->>'provider_message_id',
           sent_at = now(), attempts = attempts + 1, locked_at = NULL, delivery_status = 'sent'
     WHERE id = o.id;
    IF o.kind IN ('feedback_request', 'feedback_reminder') THEN
      UPDATE feedback_requests SET status = CASE WHEN status IN ('queued','failed') THEN 'sent' ELSE status END,
             sent_at = coalesce(sent_at, now()), channel_used = coalesce(channel_used, v_channel)
       WHERE id = o.request_id;
    END IF;
    IF o.kind = 'draft_reply' THEN
      UPDATE response_drafts SET channel = v_channel, updated_at = now() WHERE outbox_id = o.id;
    END IF;
    IF o.audience = 'customer' THEN
      INSERT INTO feedback_messages (request_id, feedback_id, direction, channel, provider_message_id, body, intent)
      VALUES (o.request_id, o.feedback_id, 'out', v_channel, p->>'provider_message_id', o.text, o.kind);
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'sent');
  END IF;

  -- failure: permanent -> next channel now; transient -> retry same channel with backoff
  IF coalesce((p->>'permanent')::boolean, false) OR o.channel_attempts + 1 >= v_max_channel_attempts THEN
    v_remaining := ARRAY(SELECT c FROM unnest(o.channels) c WHERE c <> ALL (o.tried_channels || v_channel));
    UPDATE outbox SET
      tried_channels = tried_channels || v_channel, channel_attempts = 0, attempts = attempts + 1,
      status = CASE WHEN cardinality(v_remaining) > 0 THEN 'pending' ELSE 'failed' END,
      next_attempt_at = now(), locked_at = NULL, last_error = p->>'error',
      error_log = error_log || jsonb_build_object('at', now(), 'channel', v_channel, 'code', p->>'error_code', 'error', p->>'error', 'permanent', true)
     WHERE id = o.id;
    IF cardinality(v_remaining) = 0 AND o.kind = 'feedback_request' THEN
      UPDATE feedback_requests SET status = 'failed' WHERE id = o.request_id AND status = 'queued';
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', CASE WHEN cardinality(v_remaining) > 0 THEN 'fallback' ELSE 'failed' END,
                              'remaining_channels', to_jsonb(v_remaining));
  END IF;

  UPDATE outbox SET
    channel_attempts = channel_attempts + 1, attempts = attempts + 1, status = 'pending', locked_at = NULL,
    next_attempt_at = now() + make_interval(mins => (2 ^ (channel_attempts + 1))::int),  -- 2, 4 min
    last_error = p->>'error',
    error_log = error_log || jsonb_build_object('at', now(), 'channel', v_channel, 'code', p->>'error_code', 'error', p->>'error', 'permanent', false)
   WHERE id = o.id;
  RETURN jsonb_build_object('ok', true, 'status', 'retry');
END $$;

-- WhatsApp delivery callbacks. A 'failed' status on a message we believed was sent
-- re-queues it on the next channel (e.g. number not on WhatsApp -> SMS).
-- p: { provider_message_id, status, error_code, error_title, at }
CREATE OR REPLACE FUNCTION rfe_whatsapp_status(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  o outbox%ROWTYPE;
  v_remaining text[];
BEGIN
  SELECT * INTO o FROM outbox WHERE provider_message_id = p->>'provider_message_id' AND sent_channel = 'whatsapp' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown message'); END IF;

  IF p->>'status' = 'failed' THEN
    v_remaining := ARRAY(SELECT c FROM unnest(o.channels) c WHERE c <> ALL (o.tried_channels || 'whatsapp'::text));
    UPDATE outbox SET delivery_status = 'failed', tried_channels = tried_channels || 'whatsapp'::text,
           status = CASE WHEN cardinality(v_remaining) > 0 THEN 'pending' ELSE 'failed' END,
           next_attempt_at = now(), sent_channel = NULL, provider_message_id = NULL, channel_attempts = 0,
           last_error = concat_ws(' ', p->>'error_code', p->>'error_title'),
           error_log = error_log || jsonb_build_object('at', now(), 'channel', 'whatsapp', 'code', p->>'error_code',
                                                       'error', p->>'error_title', 'async', true)
     WHERE id = o.id;
    IF o.kind = 'feedback_request' AND cardinality(v_remaining) = 0 THEN
      UPDATE feedback_requests SET status = 'failed' WHERE id = o.request_id AND status IN ('sent','queued');
    END IF;
    RETURN jsonb_build_object('ok', true, 'requeued', cardinality(v_remaining) > 0);
  END IF;

  UPDATE outbox SET delivery_status = p->>'status' WHERE id = o.id
     AND coalesce(delivery_status, '') <> 'read';
  IF o.kind IN ('feedback_request', 'feedback_reminder') THEN
    UPDATE feedback_requests SET
      status = CASE WHEN status IN ('sent','delivered') AND p->>'status' IN ('delivered','read') THEN p->>'status' ELSE status END,
      delivered_at = CASE WHEN p->>'status' IN ('delivered','read') THEN coalesce(delivered_at, (p->>'at')::timestamptz) ELSE delivered_at END,
      read_at = CASE WHEN p->>'status' = 'read' THEN coalesce(read_at, (p->>'at')::timestamptz) ELSE read_at END
     WHERE id = o.request_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================================
-- 6. Case page + actions (acknowledge, contacted, send draft, resolve, notes)
-- ============================================================================
CREATE OR REPLACE FUNCTION rfe_case_view(p_token text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'case', to_jsonb(c) - 'token',
    'token', c.token,
    'feedback', jsonb_build_object('id', f.id, 'created_at', f.created_at, 'customer_text', f.customer_text,
        'rating', f.rating, 'score', f.score, 'score_100', f.score_100, 'sentiment_label', f.sentiment_label,
        'severity_index', f.severity_index, 'severity_label', f.severity_label, 'tier', f.tier, 'lane', f.lane,
        'status', f.status, 'summary', f.summary, 'reasons', f.reasons, 'categories', f.categories,
        'recommended_action', f.recommended_action, 'repeat_customer', f.repeat_customer,
        'previous_negative_count', f.previous_negative_count, 'channel', f.channel),
    'customer', jsonb_build_object('name', cu.name, 'phone', cu.phone, 'email', cu.email),
    'job', jsonb_build_object('id', j.external_job_id, 'service_type', j.service_type, 'vehicle', j.vehicle,
        'vehicle_reg', j.vehicle_reg, 'technician', j.technician, 'completed_at', j.completed_at),
    'branch', jsonb_build_object('name', b.name, 'phone', b.phone, 'google_review_url', b.google_review_url),
    'draft', (SELECT to_jsonb(d) FROM response_drafts d WHERE d.feedback_id = f.id),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]') FROM case_events e WHERE e.case_id = c.id),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('created_at', f2.created_at, 'branch', b2.name, 'tier', f2.tier,
                  'score_100', f2.score_100, 'summary', f2.summary, 'status', f2.status) ORDER BY f2.created_at DESC), '[]')
                  FROM feedback f2 JOIN branches b2 ON b2.id = f2.branch_id
                 WHERE f2.customer_id = f.customer_id AND f2.id <> f.id))
  FROM cases c
  JOIN feedback f ON f.id = c.feedback_id
  JOIN customers cu ON cu.id = f.customer_id
  JOIN jobs j ON j.id = f.job_id
  JOIN branches b ON b.id = c.branch_id
  WHERE c.token = p_token;
$$;

-- p: { token | case_id, action, contact_id, actor, notes, draft_text, root_cause, followup_text }
-- actions: acknowledge | contacted | send_draft | discard_draft | handled_offline | resolve | reopen | note
CREATE OR REPLACE FUNCTION rfe_case_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  c cases%ROWTYPE;
  f feedback%ROWTYPE;
  cu customers%ROWTYPE;
  d response_drafts%ROWTYPE;
  v_actor text;
  v_contact int := nullif(p->>'contact_id', '')::int;
  v_text text;
  v_out bigint;
  v_channels jsonb;
  v_action text := p->>'action';
BEGIN
  IF p->>'token' IS NOT NULL THEN
    SELECT * INTO c FROM cases WHERE token = p->>'token' FOR UPDATE;
  ELSE
    SELECT * INTO c FROM cases WHERE id = (p->>'case_id')::uuid FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'case not found'); END IF;
  SELECT * INTO f FROM feedback WHERE id = c.feedback_id FOR UPDATE;
  SELECT * INTO cu FROM customers WHERE id = f.customer_id;
  IF v_contact IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_contacts WHERE id = v_contact) THEN v_contact := NULL; END IF;
  v_actor := coalesce(nullif(p->>'actor', ''), (SELECT name FROM staff_contacts WHERE id = v_contact), 'staff');

  IF v_action IN ('acknowledge', 'contacted', 'send_draft', 'handled_offline', 'resolve') THEN
    UPDATE cases SET acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, v_contact),
           status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END, updated_at = now()
     WHERE id = c.id;
  END IF;

  IF v_action = 'send_draft' THEN
    SELECT * INTO d FROM response_drafts WHERE feedback_id = f.id FOR UPDATE;
    v_text := btrim(coalesce(p->>'draft_text', d.draft_text));
    IF v_text IS NULL OR v_text = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'empty reply'); END IF;
    IF d.status = 'sent' THEN RETURN jsonb_build_object('ok', false, 'error', 'reply already sent'); END IF;
    IF cu.opted_out THEN RETURN jsonb_build_object('ok', false, 'error', 'customer has opted out of messages - please phone them'); END IF;
    v_channels := CASE f.channel WHEN 'whatsapp' THEN '["whatsapp","sms","email"]'::jsonb
                                 WHEN 'sms' THEN '["sms","email"]'::jsonb
                                 ELSE '["email","sms"]'::jsonb END;
    v_out := rfe_enqueue(jsonb_build_object(
      'audience', 'customer', 'kind', 'draft_reply', 'priority', 2, 'channels', v_channels,
      'to_phone', cu.phone, 'to_email', cu.email, 'text', v_text,
      'email_subject', 'Re: your visit to ' || (SELECT name FROM branches WHERE id = f.branch_id),
      'email_html', '<p style="font-family:system-ui,Arial,sans-serif;white-space:pre-wrap">' || rfe_html_escape(v_text) || '</p>',
      'request_id', f.request_id, 'feedback_id', f.id, 'case_id', c.id,
      'dedupe_key', 'draft:' || f.id));
    IF d.id IS NULL THEN
      INSERT INTO response_drafts (feedback_id, source, draft_text, final_text, status, edited, sent_by, sent_at, outbox_id)
      VALUES (f.id, 'template', v_text, v_text, 'sent', true, v_actor, now(), v_out);
    ELSE
      UPDATE response_drafts SET final_text = v_text, edited = (v_text <> btrim(draft_text)), status = 'sent',
             sent_by = v_actor, sent_at = now(), outbox_id = v_out, updated_at = now()
       WHERE id = d.id;
    END IF;
    UPDATE cases SET contacted_at = coalesce(contacted_at, now()),
           status = CASE WHEN status IN ('open','acknowledged') THEN 'contacted' ELSE status END, updated_at = now()
     WHERE id = c.id;
  ELSIF v_action = 'save_draft' THEN
    UPDATE response_drafts SET draft_text = coalesce(p->>'draft_text', draft_text), edited = true, updated_at = now()
     WHERE feedback_id = f.id AND status = 'draft';
  ELSIF v_action = 'discard_draft' THEN
    UPDATE response_drafts SET status = 'discarded', updated_at = now() WHERE feedback_id = f.id AND status = 'draft';
  ELSIF v_action = 'handled_offline' THEN
    UPDATE response_drafts SET status = 'handled_offline', sent_by = v_actor, sent_at = now(), updated_at = now()
     WHERE feedback_id = f.id AND status = 'draft';
    UPDATE cases SET contacted_at = coalesce(contacted_at, now()),
           status = CASE WHEN status IN ('open','acknowledged') THEN 'contacted' ELSE status END, updated_at = now()
     WHERE id = c.id;
  ELSIF v_action = 'contacted' THEN
    UPDATE cases SET contacted_at = coalesce(contacted_at, now()),
           status = CASE WHEN status IN ('open','acknowledged') THEN 'contacted' ELSE status END, updated_at = now()
     WHERE id = c.id;
  ELSIF v_action = 'resolve' THEN
    UPDATE cases SET status = 'resolved', resolved_at = now(), resolved_by = v_contact,
           resolution_notes = coalesce(p->>'notes', resolution_notes), root_cause = coalesce(p->>'root_cause', root_cause),
           contacted_at = coalesce(contacted_at, now()), updated_at = now()
     WHERE id = c.id;
    UPDATE feedback SET status = 'resolved', status_changed_at = now(), updated_at = now() WHERE id = f.id;
    -- optional human-written follow-up (e.g. "all sorted, here's our review link")
    IF nullif(btrim(coalesce(p->>'followup_text', '')), '') IS NOT NULL AND NOT cu.opted_out THEN
      v_out := rfe_enqueue(jsonb_build_object(
        'audience', 'customer', 'kind', 'resolution_followup', 'priority', 3,
        'channels', CASE f.channel WHEN 'whatsapp' THEN '["whatsapp","sms","email"]'::jsonb ELSE '["sms","email"]'::jsonb END,
        'to_phone', cu.phone, 'to_email', cu.email, 'text', p->>'followup_text',
        'email_subject', 'Following up on your visit',
        'email_html', '<p style="font-family:system-ui,Arial,sans-serif;white-space:pre-wrap">' || rfe_html_escape(p->>'followup_text') || '</p>',
        'request_id', f.request_id, 'feedback_id', f.id, 'case_id', c.id, 'dedupe_key', 'resolved:' || c.id));
    END IF;
  ELSIF v_action = 'reopen' THEN
    UPDATE cases SET status = 'acknowledged', resolved_at = NULL, updated_at = now() WHERE id = c.id;
    UPDATE feedback SET status = rfe_status_for_lane(lane), status_changed_at = now(), updated_at = now() WHERE id = f.id;
  ELSIF v_action NOT IN ('acknowledge', 'note') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown action ' || v_action);
  END IF;

  INSERT INTO case_events (case_id, event, actor, contact_id, details)
  VALUES (c.id, CASE v_action WHEN 'acknowledge' THEN 'acknowledged' WHEN 'resolve' THEN 'resolved'
                              WHEN 'send_draft' THEN 'reply_sent' ELSE v_action END,
          v_actor, v_contact,
          jsonb_strip_nulls(jsonb_build_object('notes', p->>'notes', 'root_cause', p->>'root_cause', 'outbox_id', v_out,
                                               'reply_text', CASE WHEN v_action = 'send_draft' THEN v_text END)));
  RETURN jsonb_build_object('ok', true, 'action', v_action, 'case_id', c.id, 'outbox_id', v_out);
END $$;

-- Ready-to-Post queue actions. p: { id, action: save|posted|not_posted|reopen, edited_text,
-- display_name, platforms[], post_url, actor }
CREATE OR REPLACE FUNCTION rfe_rtp_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  t ready_to_post%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO t FROM ready_to_post WHERE id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not found'); END IF;
  v_status := CASE p->>'action' WHEN 'posted' THEN 'posted' WHEN 'not_posted' THEN 'not_posted'
                                WHEN 'reopen' THEN 'ready_to_post' ELSE t.status END;
  UPDATE ready_to_post SET
    edited_text = coalesce(nullif(p->>'edited_text', ''), edited_text),
    display_name = coalesce(nullif(p->>'display_name', ''), display_name),
    platforms = CASE WHEN jsonb_typeof(p->'platforms') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p->'platforms')) ELSE platforms END,
    post_url = coalesce(nullif(p->>'post_url', ''), post_url),
    status = v_status, reviewed_by = coalesce(nullif(p->>'actor', ''), reviewed_by),
    posted_at = CASE WHEN v_status = 'posted' THEN coalesce(posted_at, now()) ELSE posted_at END,
    updated_at = now()
  WHERE id = t.id;
  UPDATE feedback SET status = v_status, status_changed_at = now(), updated_at = now()
   WHERE id = t.feedback_id AND status <> v_status;
  RETURN jsonb_build_object('ok', true, 'status', v_status);
END $$;

-- ============================================================================
-- 7. SLA escalations, reminders, expiry
-- ============================================================================
-- Escalated-lane cases whose acknowledge (or customer-contact) SLA has passed and
-- that have a next escalation level configured.
CREATE OR REPLACE FUNCTION rfe_due_escalations() RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH cfg AS (SELECT rfe_setting('routing') AS routing),
  due AS (
    SELECT c.*, f.customer_text, f.summary, f.score_100, f.tier AS f_tier, f.repeat_customer,
           cu.name AS customer_name, cu.phone AS customer_phone, b.name AS branch_name, b.id AS b_id,
           CASE WHEN c.status = 'open' THEN 'acknowledged' ELSE 'contacted' END AS overdue_what,
           floor(extract(epoch FROM now() - CASE WHEN c.status = 'open' THEN c.ack_due_at ELSE c.contact_due_at END) / 60)::int AS overdue_minutes,
           (SELECT routing FROM cfg)->c.tier AS rule
      FROM cases c
      JOIN feedback f ON f.id = c.feedback_id
      JOIN customers cu ON cu.id = f.customer_id
      JOIN branches b ON b.id = c.branch_id
     WHERE (c.status = 'open' AND c.ack_due_at < now())
        OR (c.status = 'acknowledged' AND c.contact_due_at < now()))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'case_id', d.id, 'token', d.token, 'tier', d.tier, 'branch_name', d.branch_name,
           'customer_name', d.customer_name, 'customer_phone', d.customer_phone,
           'customer_text', d.customer_text, 'summary', d.summary, 'score_100', d.score_100,
           'repeat_customer', d.repeat_customer, 'overdue_what', d.overdue_what, 'overdue_minutes', d.overdue_minutes,
           'next_level', d.escalation_level + 1,
           'roles', d.rule->'escalation_chain'->d.escalation_level,
           'notified_names', (SELECT string_agg(DISTINCT sc.name, ', ') FROM staff_contacts sc
                               JOIN outbox o ON o.contact_id = sc.id WHERE o.case_id = d.id),
           'contacts', rfe_branch_contacts(d.b_id))), '[]'::jsonb)
    FROM due d
   WHERE jsonb_typeof(d.rule->'escalation_chain') = 'array'
     AND d.escalation_level < jsonb_array_length(d.rule->'escalation_chain')
     AND (d.last_escalated_at IS NULL
          OR d.last_escalated_at < now() - make_interval(mins => coalesce((d.rule->>'escalation_repeat_minutes')::int, 60)));
$$;

-- p: { case_id, level, roles[], messages[] }
CREATE OR REPLACE FUNCTION rfe_record_escalation(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_msg jsonb; v_n int := 0; v_out bigint;
BEGIN
  UPDATE cases SET escalation_level = (p->>'level')::int, last_escalated_at = now(), updated_at = now()
   WHERE id = (p->>'case_id')::uuid AND escalation_level < (p->>'level')::int;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'already escalated'); END IF;
  FOR v_msg IN SELECT * FROM jsonb_array_elements(coalesce(p->'messages', '[]')) LOOP
    v_out := rfe_enqueue(v_msg || jsonb_build_object('case_id', p->>'case_id'));
    IF v_out IS NOT NULL THEN v_n := v_n + 1; END IF;
  END LOOP;
  UPDATE cases SET notified_roles = ARRAY(SELECT DISTINCT unnest(notified_roles || ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'roles', '[]')))))
   WHERE id = (p->>'case_id')::uuid;
  INSERT INTO case_events (case_id, event, actor, details)
  VALUES ((p->>'case_id')::uuid, 'escalated', 'system', jsonb_build_object('level', p->'level', 'roles', p->'roles', 'messages', v_n));
  RETURN jsonb_build_object('ok', true, 'messages', v_n);
END $$;

CREATE OR REPLACE FUNCTION rfe_due_reminders() RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH coll AS (SELECT rfe_setting('collection') AS c)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id, 'token', r.token, 'channel_used', r.channel_used, 'reminder_no', r.reminders_sent + 1,
           'customer', jsonb_build_object('name', cu.name, 'phone', cu.phone, 'email', cu.email),
           'branch', jsonb_build_object('name', b.name, 'timezone', b.timezone),
           'job', jsonb_build_object('service_type', j.service_type, 'vehicle_reg', j.vehicle_reg))), '[]'::jsonb)
    FROM feedback_requests r
    JOIN customers cu ON cu.id = r.customer_id
    JOIN branches b ON b.id = r.branch_id
    JOIN jobs j ON j.id = r.job_id, coll
   WHERE r.status IN ('sent','delivered','read')
     AND NOT cu.opted_out
     AND r.reminders_sent < coalesce((coll.c->>'max_reminders')::int, 1)
     AND coalesce(r.last_reminder_at, r.sent_at) < now() - make_interval(hours => coalesce((coll.c->>'reminder_after_hours')::int, 24))
     AND r.expires_at > now()
     AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.request_id = r.id);
$$;

CREATE OR REPLACE FUNCTION rfe_mark_reminded(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_out bigint;
BEGIN
  UPDATE feedback_requests SET reminders_sent = reminders_sent + 1, last_reminder_at = now()
   WHERE id = (p->>'request_id')::uuid;
  v_out := rfe_enqueue(p->'message');
  RETURN jsonb_build_object('ok', true, 'outbox_id', v_out);
END $$;

CREATE OR REPLACE FUNCTION rfe_expire_requests() RETURNS int LANGUAGE sql AS $$
  WITH x AS (
    UPDATE feedback_requests SET status = 'expired'
     WHERE status IN ('queued','sent','delivered','read') AND expires_at < now()
       AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.request_id = feedback_requests.id)
    RETURNING 1)
  SELECT count(*)::int FROM x;
$$;

-- ============================================================================
-- 8. Analytics: declining branches, dashboard, digest
-- ============================================================================
CREATE OR REPLACE FUNCTION rfe_branch_trends(p_as_of timestamptz DEFAULT now())
RETURNS TABLE (branch_id int, branch_name text, n_recent int, avg_recent numeric, n_base int, avg_base numeric,
               delta numeric, neg_share_recent numeric, declining boolean, reason text)
LANGUAGE sql STABLE AS $$
  WITH a AS (SELECT rfe_setting('analytics') AS c),
  w AS (
    SELECT b.id, b.name,
      count(f.id) FILTER (WHERE f.created_at >  p_as_of - make_interval(days => (a.c->>'decline_window_days')::int)) AS n_recent,
      avg(f.score) FILTER (WHERE f.created_at >  p_as_of - make_interval(days => (a.c->>'decline_window_days')::int)) AS avg_recent,
      count(f.id) FILTER (WHERE f.created_at <= p_as_of - make_interval(days => (a.c->>'decline_window_days')::int)) AS n_base,
      avg(f.score) FILTER (WHERE f.created_at <= p_as_of - make_interval(days => (a.c->>'decline_window_days')::int)) AS avg_base,
      avg((f.score < 0)::int) FILTER (WHERE f.created_at > p_as_of - make_interval(days => (a.c->>'decline_window_days')::int)) AS neg_share,
      a.c AS c
    FROM branches b CROSS JOIN a
    LEFT JOIN feedback f ON f.branch_id = b.id AND f.created_at <= p_as_of
         AND f.created_at > p_as_of - make_interval(days => (a.c->>'decline_window_days')::int + (a.c->>'baseline_window_days')::int)
    WHERE b.active
    GROUP BY b.id, b.name, a.c)
  SELECT id, name, n_recent::int, round(avg_recent, 3), n_base::int, round(avg_base, 3),
         round(avg_recent - avg_base, 3), round(neg_share, 3),
         (n_recent >= (c->>'decline_min_responses')::int AND (
            (n_base >= (c->>'decline_min_responses')::int AND avg_recent - avg_base <= (c->>'decline_delta')::numeric)
            OR neg_share >= (c->>'negative_share_alert')::numeric)) AS declining,
         CASE
           WHEN n_recent < (c->>'decline_min_responses')::int THEN NULL
           WHEN n_base >= (c->>'decline_min_responses')::int AND avg_recent - avg_base <= (c->>'decline_delta')::numeric
             THEN format('Sentiment down %s pts vs previous %s days', round((avg_base - avg_recent) * 50)::int, c->>'baseline_window_days')
           WHEN neg_share >= (c->>'negative_share_alert')::numeric
             THEN format('%s%% of recent feedback is negative', round(neg_share * 100)::int)
         END
    FROM w;
$$;

-- One call returns everything the dashboard renders.
-- p: { from, to, branch_ids[], region_id, statuses[], min_score, max_score, q, limit, offset }
CREATE OR REPLACE FUNCTION rfe_dashboard(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_from timestamptz := coalesce(nullif(p->>'from', '')::timestamptz, now() - interval '30 days');
  v_to   timestamptz := coalesce(nullif(p->>'to', '')::timestamptz, now());
  v_branches int[] := CASE WHEN jsonb_typeof(p->'branch_ids') = 'array' AND jsonb_array_length(p->'branch_ids') > 0
                           THEN ARRAY(SELECT jsonb_array_elements_text(p->'branch_ids')::int) END;
  v_region int := nullif(p->>'region_id', '')::int;
  v_statuses text[] := CASE WHEN jsonb_typeof(p->'statuses') = 'array' AND jsonb_array_length(p->'statuses') > 0
                            THEN ARRAY(SELECT jsonb_array_elements_text(p->'statuses')) END;
  v_min int := coalesce(nullif(p->>'min_score', '')::int, 0);
  v_max int := coalesce(nullif(p->>'max_score', '')::int, 100);
  v_q text := nullif(btrim(coalesce(p->>'q', '')), '');
  v_limit int := least(coalesce(nullif(p->>'limit', '')::int, 100), 500);
  v_offset int := coalesce(nullif(p->>'offset', '')::int, 0);
  result jsonb;
BEGIN
  WITH bsel AS (
    SELECT b.* FROM branches b
     WHERE (v_branches IS NULL OR b.id = ANY(v_branches)) AND (v_region IS NULL OR b.region_id = v_region)),
  fb AS (
    SELECT f.* FROM feedback f JOIN bsel ON bsel.id = f.branch_id
     WHERE f.created_at >= v_from AND f.created_at < v_to),
  req AS (
    SELECT r.* FROM feedback_requests r JOIN bsel ON bsel.id = r.branch_id
     WHERE r.created_at >= v_from AND r.created_at < v_to AND r.status <> 'suppressed'),
  cs AS (SELECT c.* FROM cases c JOIN fb ON fb.id = c.feedback_id),
  feed AS (
    SELECT f.*, b.name AS branch_name, cu.name AS customer_name, cu.phone AS customer_phone,
           j.external_job_id, j.service_type, j.vehicle, j.vehicle_reg, j.technician,
           c.token AS case_token, c.status AS case_status, c.ack_due_at, c.acknowledged_at, c.resolve_due_at,
           d.id AS draft_id, d.status AS draft_status, coalesce(d.final_text, d.draft_text) AS draft_text, d.source AS draft_source,
           t.id AS rtp_id, t.status AS rtp_status, t.edited_text AS rtp_edited_text, t.display_name AS rtp_display_name,
           t.customer_consent AS rtp_consent, t.platforms AS rtp_platforms, t.highlighted AS rtp_highlighted
      FROM fb f
      JOIN branches b ON b.id = f.branch_id
      JOIN customers cu ON cu.id = f.customer_id
      JOIN jobs j ON j.id = f.job_id
      LEFT JOIN cases c ON c.feedback_id = f.id
      LEFT JOIN response_drafts d ON d.feedback_id = f.id
      LEFT JOIN ready_to_post t ON t.feedback_id = f.id
     WHERE (v_statuses IS NULL OR f.status = ANY(v_statuses))
       AND f.score_100 BETWEEN v_min AND v_max
       AND (v_q IS NULL OR f.customer_text ILIKE '%' || v_q || '%' OR cu.name ILIKE '%' || v_q || '%'
            OR j.vehicle_reg ILIKE '%' || v_q || '%' OR j.external_job_id ILIKE '%' || v_q || '%'))
  SELECT jsonb_build_object(
    'generated_at', now(),
    'filters', jsonb_build_object('from', v_from, 'to', v_to),
    'kpis', (SELECT jsonb_build_object(
        'requests_sent', (SELECT count(*) FROM req WHERE status NOT IN ('queued','failed')),
        'responses', count(*),
        'response_rate', round(count(*)::numeric / nullif((SELECT count(*) FROM req WHERE status NOT IN ('queued','failed')), 0), 3),
        'avg_score_100', round(avg(score_100), 1),
        'ready_to_post', count(*) FILTER (WHERE status = 'ready_to_post'),
        'posted', count(*) FILTER (WHERE status = 'posted'),
        'in_queue', count(*) FILTER (WHERE status = 'in_queue'),
        'escalated_open', count(*) FILTER (WHERE status = 'escalated'),
        'escalated_total', count(*) FILTER (WHERE lane = 'escalated'),
        'escalation_rate', round(avg((lane = 'escalated')::int), 3),
        'resolved', count(*) FILTER (WHERE status = 'resolved'),
        'repeat_customers', count(*) FILTER (WHERE repeat_customer),
        'drafts_waiting', (SELECT count(*) FROM response_drafts d JOIN fb ON fb.id = d.feedback_id WHERE d.status = 'draft'),
        'median_ack_minutes', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acknowledged_at - opened_at) / 60))::numeric, 1)
                                 FROM cs JOIN fb ON fb.id = cs.feedback_id WHERE fb.lane = 'escalated' AND acknowledged_at IS NOT NULL),
        'ack_within_sla', (SELECT round(avg((acknowledged_at <= ack_due_at)::int), 3)
                             FROM cs WHERE ack_due_at IS NOT NULL AND (acknowledged_at IS NOT NULL OR ack_due_at < now())),
        'overdue_escalations', (SELECT count(*) FROM cs WHERE status = 'open' AND ack_due_at < now()),
        'unmatched_inbound', (SELECT count(*) FROM unmatched_inbound WHERE NOT handled))
      FROM fb),
    'branches', (SELECT coalesce(jsonb_agg(x ORDER BY x.avg_score_100 NULLS LAST), '[]') FROM (
        SELECT b.id, b.name, b.code, rg.name AS region,
          (SELECT count(*) FROM req WHERE req.branch_id = b.id AND status NOT IN ('queued','failed')) AS requests_sent,
          count(f.id) AS responses,
          round(count(f.id)::numeric / nullif((SELECT count(*) FROM req WHERE req.branch_id = b.id AND status NOT IN ('queued','failed')), 0), 3) AS response_rate,
          round(avg(f.score_100), 1) AS avg_score_100,
          count(*) FILTER (WHERE f.lane = 'ready_to_post') AS positive,
          count(*) FILTER (WHERE f.lane = 'logged') AS neutral,
          count(*) FILTER (WHERE f.lane = 'in_queue') AS mild,
          count(*) FILTER (WHERE f.lane = 'escalated') AS escalated,
          round(avg((f.lane = 'escalated')::int), 3) AS escalation_rate,
          count(*) FILTER (WHERE f.status IN ('in_queue','escalated')) AS open_items,
          (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.acknowledged_at - c.opened_at) / 60))::numeric, 1)
             FROM cs c WHERE c.branch_id = b.id AND c.acknowledged_at IS NOT NULL AND c.ack_due_at IS NOT NULL) AS median_ack_minutes,
          (SELECT count(*) FROM cs c WHERE c.branch_id = b.id AND c.status = 'open' AND c.ack_due_at < now()) AS overdue,
          t.delta AS trend_delta, coalesce(t.declining, false) AS declining, t.reason AS declining_reason
        FROM bsel b
        LEFT JOIN regions rg ON rg.id = b.region_id
        LEFT JOIN fb f ON f.branch_id = b.id
        LEFT JOIN rfe_branch_trends(now()) t ON t.branch_id = b.id
        GROUP BY b.id, b.name, b.code, rg.name, t.delta, t.declining, t.reason) x),
    'trend', (SELECT coalesce(jsonb_agg(x ORDER BY x.week), '[]') FROM (
        SELECT date_trunc('week', f.created_at)::date AS week, count(*) AS responses,
               round(avg(f.score_100), 1) AS avg_score_100,
               count(*) FILTER (WHERE f.lane = 'escalated') AS escalated,
               count(*) FILTER (WHERE f.lane = 'in_queue') AS mild,
               count(*) FILTER (WHERE f.lane = 'ready_to_post') AS positive
          FROM fb f GROUP BY 1) x),
    'trend_by_branch', (SELECT coalesce(jsonb_agg(x ORDER BY x.branch_id, x.week), '[]') FROM (
        SELECT f.branch_id, date_trunc('week', f.created_at)::date AS week, count(*) AS responses,
               round(avg(f.score_100), 1) AS avg_score_100, count(*) FILTER (WHERE f.lane = 'escalated') AS escalated
          FROM fb f GROUP BY 1, 2) x),
    'categories', (SELECT coalesce(jsonb_agg(x ORDER BY x.n DESC), '[]') FROM (
        SELECT cat, count(*) AS n FROM fb, unnest(fb.categories) cat WHERE fb.score < 0.4 GROUP BY cat) x),
    'feed_total', (SELECT count(*) FROM feed),
    'feed', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'created_at', x.created_at, 'branch_id', x.branch_id, 'branch', x.branch_name,
        'customer', x.customer_name, 'customer_phone', x.customer_phone, 'channel', x.channel, 'rating', x.rating,
        'text', x.customer_text, 'score_100', x.score_100, 'score', x.score, 'sentiment_label', x.sentiment_label,
        'severity_index', x.severity_index, 'severity_label', x.severity_label, 'intensity', x.intensity,
        'tier', x.tier, 'lane', x.lane, 'status', x.status, 'repeat_customer', x.repeat_customer,
        'previous_negative_count', x.previous_negative_count,
        'summary', x.summary, 'reasons', x.reasons, 'categories', x.categories, 'recommended_action', x.recommended_action,
        'job', x.external_job_id, 'service_type', x.service_type, 'vehicle', concat_ws(' ', x.vehicle, x.vehicle_reg),
        'technician', x.technician, 'method', x.scoring_method,
        'case_token', x.case_token, 'case_status', x.case_status, 'ack_due_at', x.ack_due_at,
        'acknowledged_at', x.acknowledged_at, 'resolve_due_at', x.resolve_due_at,
        'draft', CASE WHEN x.draft_id IS NULL THEN NULL ELSE jsonb_build_object('id', x.draft_id, 'status', x.draft_status,
                  'text', x.draft_text, 'source', x.draft_source) END,
        'rtp', CASE WHEN x.rtp_id IS NULL THEN NULL ELSE jsonb_build_object('id', x.rtp_id, 'status', x.rtp_status,
                  'edited_text', x.rtp_edited_text, 'display_name', x.rtp_display_name, 'consent', x.rtp_consent,
                  'platforms', x.rtp_platforms, 'highlighted', x.rtp_highlighted) END
      ) ORDER BY x.created_at DESC), '[]')
      FROM (SELECT * FROM feed ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) x),
    'branch_list', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'region_id', b.region_id) ORDER BY b.name), '[]')
                      FROM branches b WHERE b.active),
    'region_list', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) ORDER BY r.name), '[]') FROM regions r)
  ) INTO result;
  RETURN result;
END $$;

-- Data for the daily digest e-mails (yesterday in the group's default timezone).
CREATE OR REPLACE FUNCTION rfe_digest_data() RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH g AS (SELECT coalesce(rfe_setting('general')->>'default_timezone', 'UTC') AS tz),
  win AS (SELECT (date_trunc('day', now() AT TIME ZONE g.tz) - interval '1 day') AT TIME ZONE g.tz AS d_from,
                 date_trunc('day', now() AT TIME ZONE g.tz) AT TIME ZONE g.tz AS d_to FROM g),
  y AS (SELECT f.* FROM feedback f, win WHERE f.created_at >= win.d_from AND f.created_at < win.d_to)
  SELECT jsonb_build_object(
    'date', (SELECT (d_from AT TIME ZONE (SELECT tz FROM g))::date FROM win),
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'region_id', b.region_id,
        'responses', (SELECT count(*) FROM y WHERE y.branch_id = b.id),
        'avg_score_100', (SELECT round(avg(score_100), 1) FROM y WHERE y.branch_id = b.id),
        'escalated', (SELECT count(*) FROM y WHERE y.branch_id = b.id AND lane = 'escalated'),
        'mild', (SELECT count(*) FROM y WHERE y.branch_id = b.id AND lane = 'in_queue'),
        'positive', (SELECT count(*) FROM y WHERE y.branch_id = b.id AND lane = 'ready_to_post'),
        'open_queue', (SELECT count(*) FROM feedback f WHERE f.branch_id = b.id AND f.status = 'in_queue'),
        'overdue_queue', (SELECT count(*) FROM cases c JOIN feedback f ON f.id = c.feedback_id
                           WHERE c.branch_id = b.id AND f.status = 'in_queue' AND c.resolve_due_at < now()),
        'open_escalations', (SELECT count(*) FROM feedback f WHERE f.branch_id = b.id AND f.status = 'escalated'),
        'ready_to_post', (SELECT count(*) FROM ready_to_post t WHERE t.branch_id = b.id AND t.status = 'ready_to_post'),
        'drafts_waiting', (SELECT count(*) FROM response_drafts d JOIN feedback f ON f.id = d.feedback_id
                            WHERE f.branch_id = b.id AND d.status = 'draft'),
        'declining', coalesce(t.declining, false), 'declining_reason', t.reason,
        'kudos', (SELECT coalesce(jsonb_agg(jsonb_build_object('text', y.customer_text, 'staff', y.staff_mentioned)), '[]')
                    FROM (SELECT * FROM y WHERE y.branch_id = b.id AND lane = 'ready_to_post' AND customer_text IS NOT NULL
                          ORDER BY score DESC LIMIT 3) y),
        'mild_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('summary', y.summary, 'text', y.customer_text, 'score_100', y.score_100)), '[]')
                    FROM (SELECT * FROM y WHERE y.branch_id = b.id AND lane = 'in_queue' ORDER BY score LIMIT 10) y)
      ) ORDER BY b.name), '[]')
      FROM branches b LEFT JOIN rfe_branch_trends(now()) t ON t.branch_id = b.id WHERE b.active),
    'recipients', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', c.role, 'email', c.email,
                    'branch_id', c.branch_id, 'region_id', c.region_id)), '[]')
                     FROM staff_contacts c WHERE c.active AND c.receives_digest AND c.email IS NOT NULL),
    'settings', rfe_settings());
$$;

-- ============================================================================
-- 9. Hosted feedback form (email / SMS link) + dashboard API entry point
-- ============================================================================
CREATE OR REPLACE FUNCTION rfe_form_context(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_req feedback_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM feedback_requests WHERE token = p->>'token';
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false, 'settings', rfe_settings()); END IF;
  IF coalesce((p->>'optout')::boolean, false) THEN
    UPDATE customers SET opted_out = true, opted_out_at = now(), updated_at = now() WHERE id = v_req.customer_id;
  END IF;
  RETURN (SELECT jsonb_build_object(
    'found', true, 'token', v_req.token, 'opted_out', cu.opted_out,
    'already_responded', EXISTS (SELECT 1 FROM feedback f WHERE f.request_id = v_req.id),
    'expired', v_req.status = 'expired',
    'customer_name', cu.name, 'branch_name', b.name, 'service_type', j.service_type, 'vehicle_reg', j.vehicle_reg,
    'settings', rfe_settings())
    FROM customers cu, branches b, jobs j
   WHERE cu.id = v_req.customer_id AND b.id = v_req.branch_id AND j.id = v_req.job_id);
END $$;

-- Single entry point for the dashboard's API calls.
-- p: { op: 'data' | 'case' | 'case_action' | 'rtp_action' | 'unmatched' | 'unmatched_handled', ... }
CREATE OR REPLACE FUNCTION rfe_api(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  CASE p->>'op'
    WHEN 'data' THEN RETURN rfe_dashboard(coalesce(p->'filters', '{}'));
    WHEN 'case' THEN RETURN rfe_case_view(p->>'token');
    WHEN 'case_action' THEN RETURN rfe_case_action(p);
    WHEN 'rtp_action' THEN RETURN rfe_rtp_action(p);
    WHEN 'unmatched' THEN
      RETURN (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.received_at DESC), '[]') FROM
              (SELECT id, channel, from_address, body, received_at FROM unmatched_inbound WHERE NOT handled ORDER BY received_at DESC LIMIT 100) u);
    WHEN 'unmatched_handled' THEN
      UPDATE unmatched_inbound SET handled = true WHERE id = (p->>'id')::bigint;
      RETURN jsonb_build_object('ok', true);
    ELSE RETURN jsonb_build_object('ok', false, 'error', 'unknown op');
  END CASE;
END $$;
