-- =============================================================================
-- Reputation & Feedback Intelligence Engine - schema
-- PostgreSQL 14+.  Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regions (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id                 serial PRIMARY KEY,
  code               text NOT NULL UNIQUE,          -- id used by the garage system (DMS)
  name               text NOT NULL,
  region_id          int REFERENCES regions(id),
  timezone           text NOT NULL DEFAULT 'Europe/London',
  phone              text,
  google_review_url  text,
  active             boolean NOT NULL DEFAULT true,
  opened_on          date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Everyone who can receive alerts. branch_id for branch roles, region_id for
-- regional managers, both NULL for HQ / ops director / marketing.
CREATE TABLE IF NOT EXISTS staff_contacts (
  id               serial PRIMARY KEY,
  name             text NOT NULL,
  role             text NOT NULL CHECK (role IN ('branch_team','branch_lead','regional_manager','hq','ops_director','marketing','admin')),
  branch_id        int REFERENCES branches(id),
  region_id        int REFERENCES regions(id),
  whatsapp         text,               -- E.164
  email            text,
  notify_whatsapp  boolean NOT NULL DEFAULT true,
  notify_email     boolean NOT NULL DEFAULT true,
  notify_sms       boolean NOT NULL DEFAULT false,
  receives_digest  boolean NOT NULL DEFAULT true,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (whatsapp IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS staff_contacts_branch_idx ON staff_contacts(branch_id) WHERE active;
CREATE INDEX IF NOT EXISTS staff_contacts_region_idx ON staff_contacts(region_id) WHERE active;

CREATE TABLE IF NOT EXISTS customers (
  id                 bigserial PRIMARY KEY,
  phone              text UNIQUE,
  email              text,
  name               text,
  opted_out          boolean NOT NULL DEFAULT false,
  opted_out_at       timestamptz,
  marketing_consent  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(lower(email));

CREATE TABLE IF NOT EXISTS jobs (
  id               bigserial PRIMARY KEY,
  source_system    text NOT NULL DEFAULT 'dms',
  external_job_id  text NOT NULL,
  branch_id        int NOT NULL REFERENCES branches(id),
  customer_id      bigint REFERENCES customers(id),
  service_type     text,
  technician       text,
  advisor          text,
  vehicle_reg      text,
  vehicle          text,
  invoice_total    numeric(12,2),
  completed_at     timestamptz NOT NULL,
  raw              jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_job_id)
);
CREATE INDEX IF NOT EXISTS jobs_branch_completed_idx ON jobs(branch_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS jobs_customer_idx ON jobs(customer_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS feedback_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  job_id          bigint NOT NULL REFERENCES jobs(id),
  customer_id     bigint NOT NULL REFERENCES customers(id),
  branch_id       int NOT NULL REFERENCES branches(id),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','sent','delivered','read','responded','failed','expired','suppressed')),
  suppressed_reason text,
  channel_used    text,
  unsolicited     boolean NOT NULL DEFAULT false,   -- customer messaged us without a matching request
  reminders_sent  int NOT NULL DEFAULT 0,
  queued_at       timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  responded_at    timestamptz,
  last_reminder_at timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_requests_job_uidx ON feedback_requests(job_id);
CREATE INDEX IF NOT EXISTS feedback_requests_customer_idx ON feedback_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_requests_branch_idx ON feedback_requests(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_requests_status_idx ON feedback_requests(status, sent_at);

CREATE TABLE IF NOT EXISTS feedback (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL UNIQUE REFERENCES feedback_requests(id),
  branch_id              int NOT NULL REFERENCES branches(id),
  job_id                 bigint NOT NULL REFERENCES jobs(id),
  customer_id            bigint NOT NULL REFERENCES customers(id),
  channel                text NOT NULL,
  rating                 text,               -- great / ok / poor / 1..5
  customer_text          text,               -- every customer message, verbatim, in order
  score                  numeric(4,3) NOT NULL,       -- -1.000 .. +1.000
  score_100              smallint NOT NULL,            -- 0 .. 100 (display)
  intensity              numeric(4,3) NOT NULL,
  severity_index         smallint NOT NULL,
  emotion                text,
  sentiment_label        text,
  severity_label         text,
  tier                   text NOT NULL CHECK (tier IN ('P1_CRITICAL','P2_HIGH','P3_MEDIUM','P4_LOW','NEUTRAL','POSITIVE')),
  initial_tier           text NOT NULL,
  lane                   text NOT NULL CHECK (lane IN ('escalated','in_queue','ready_to_post','logged')),
  -- Status label shown to staff:
  --   ready_to_post / posted / not_posted   (positive)
  --   in_queue / escalated / resolved       (negative)
  --   logged                                (neutral)
  status                 text NOT NULL CHECK (status IN ('ready_to_post','posted','not_posted','in_queue','escalated','resolved','logged')),
  status_changed_at      timestamptz NOT NULL DEFAULT now(),
  repeat_customer        boolean NOT NULL DEFAULT false,
  previous_negative_count int NOT NULL DEFAULT 0,
  categories             text[] NOT NULL DEFAULT '{}',
  issues                 jsonb NOT NULL DEFAULT '[]',
  positives              jsonb NOT NULL DEFAULT '[]',
  flags                  jsonb NOT NULL DEFAULT '{}',
  reasons                text[] NOT NULL DEFAULT '{}',
  staff_mentioned        text[] NOT NULL DEFAULT '{}',
  summary                text,
  recommended_action     text,
  language               text,
  scoring_method         text NOT NULL,      -- hybrid | rules | rating
  model                  text,
  components             jsonb,
  llm_raw                jsonb,
  testimonial_candidate  boolean NOT NULL DEFAULT false,
  consent_requested      boolean NOT NULL DEFAULT false,
  testimonial_consent    boolean,            -- NULL = not answered
  auto_reply_keys        text[] NOT NULL DEFAULT '{}',   -- automatic customer messages already sent
  rescored_count         int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_branch_created_idx ON feedback(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_tier_idx ON feedback(tier, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_customer_idx ON feedback(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_categories_idx ON feedback USING gin(categories);
CREATE INDEX IF NOT EXISTS feedback_text_search_idx ON feedback USING gin(to_tsvector('simple', coalesce(customer_text, '')));

CREATE TABLE IF NOT EXISTS feedback_messages (
  id                   bigserial PRIMARY KEY,
  request_id           uuid REFERENCES feedback_requests(id),
  feedback_id          uuid REFERENCES feedback(id),
  customer_id          bigint REFERENCES customers(id),
  direction            text NOT NULL CHECK (direction IN ('in','out')),
  channel              text NOT NULL,
  provider_message_id  text,
  intent               text,
  body                 text,
  rating               text,
  from_address         text,
  payload              jsonb,
  received_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_messages_provider_uidx ON feedback_messages(channel, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feedback_messages_request_idx ON feedback_messages(request_id);

CREATE TABLE IF NOT EXISTS cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       uuid NOT NULL UNIQUE REFERENCES feedback(id),
  branch_id         int NOT NULL REFERENCES branches(id),
  tier              text NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','contacted','resolved')),
  token             text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  opened_at         timestamptz NOT NULL DEFAULT now(),
  ack_due_at        timestamptz,
  contact_due_at    timestamptz,
  resolve_due_at    timestamptz,
  acknowledged_at   timestamptz,
  acknowledged_by   int REFERENCES staff_contacts(id),
  contacted_at      timestamptz,
  resolved_at       timestamptz,
  resolved_by       int REFERENCES staff_contacts(id),
  resolution_notes  text,
  root_cause        text,
  escalation_level  int NOT NULL DEFAULT 0,
  last_escalated_at timestamptz,
  notified_roles    text[] NOT NULL DEFAULT '{}',
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_open_idx ON cases(status, ack_due_at) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS cases_branch_idx ON cases(branch_id, opened_at DESC);

-- Audit trail: every action taken on a case, by whom.
CREATE TABLE IF NOT EXISTS case_events (
  id          bigserial PRIMARY KEY,
  case_id     uuid NOT NULL REFERENCES cases(id),
  event       text NOT NULL,        -- opened | notified | tier_upgraded | acknowledged | contacted | resolved | escalated | note | reopened
  actor       text,                 -- 'system' or staff name
  contact_id  int REFERENCES staff_contacts(id),
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events(case_id, created_at);

-- Draft replies to negative feedback. NEVER sent automatically: a person edits
-- and presses Send (dashboard / case page), which queues it in the outbox.
CREATE TABLE IF NOT EXISTS response_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id    uuid NOT NULL UNIQUE REFERENCES feedback(id),
  source         text NOT NULL CHECK (source IN ('ai','template')),
  quoted_text    text,
  draft_text     text NOT NULL,            -- as generated (kept for audit)
  final_text     text,                     -- as sent, after human edits
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','discarded','handled_offline')),
  edited         boolean NOT NULL DEFAULT false,
  channel        text,
  sent_by        text,
  sent_at        timestamptz,
  outbox_id      bigint,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS response_drafts_status_idx ON response_drafts(status, created_at DESC);

-- "Ready to Post" queue: positive feedback the team may edit and share manually.
-- Nothing here is ever published automatically.
CREATE TABLE IF NOT EXISTS ready_to_post (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       uuid NOT NULL UNIQUE REFERENCES feedback(id),
  branch_id         int NOT NULL REFERENCES branches(id),
  original_text     text NOT NULL,          -- customer's exact words
  edited_text       text,                   -- team's edit for posting
  display_name      text,                   -- e.g. "Sarah J., Leeds"
  status            text NOT NULL DEFAULT 'ready_to_post' CHECK (status IN ('ready_to_post','posted','not_posted')),
  customer_consent  boolean,                -- NULL = not asked / no answer yet
  platforms         text[] NOT NULL DEFAULT '{}',   -- where the team posted it
  post_url          text,
  highlighted       boolean NOT NULL DEFAULT false, -- testimonial-quality
  reviewed_by       text,
  posted_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ready_to_post_status_idx ON ready_to_post(status, created_at DESC);

-- Transactional outbox: every outbound message (customer or staff) is a row
-- here first and is delivered by the Outbox Dispatcher with retry + fallback.
CREATE TABLE IF NOT EXISTS outbox (
  id                  bigserial PRIMARY KEY,
  audience            text NOT NULL CHECK (audience IN ('customer','staff','admin')),
  kind                text NOT NULL,
  priority            smallint NOT NULL DEFAULT 5,        -- 1 = most urgent
  channels            text[] NOT NULL,                    -- preference order
  tried_channels      text[] NOT NULL DEFAULT '{}',
  to_phone            text,
  to_email            text,
  wa_template         jsonb,
  text                text,
  email_subject       text,
  email_html          text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  attempts            int NOT NULL DEFAULT 0,
  channel_attempts    int NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  locked_at           timestamptz,
  sent_channel        text,
  provider_message_id text,
  delivery_status     text,                               -- sent / delivered / read / failed (WhatsApp callbacks)
  last_error          text,
  error_log           jsonb NOT NULL DEFAULT '[]',
  request_id          uuid REFERENCES feedback_requests(id),
  feedback_id         uuid REFERENCES feedback(id),
  case_id             uuid REFERENCES cases(id),
  contact_id          int REFERENCES staff_contacts(id),
  dedupe_key          text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox(priority, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS outbox_provider_idx ON outbox(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_request_idx ON outbox(request_id);

-- Inbound messages we could not tie to any customer/job (shown on dashboard).
CREATE TABLE IF NOT EXISTS unmatched_inbound (
  id                   bigserial PRIMARY KEY,
  channel              text NOT NULL,
  from_address         text,
  provider_message_id  text,
  body                 text,
  payload              jsonb,
  handled              boolean NOT NULL DEFAULT false,
  received_at          timestamptz NOT NULL DEFAULT now()
);
