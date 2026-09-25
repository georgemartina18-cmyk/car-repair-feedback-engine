/**
 * Score-based routing. Input is the FINAL scored record (after the repeat-customer
 * check); the decision uses only tier/lane - which come from the numeric sentiment
 * and severity scores - never from individual words.
 *
 *   lane 'escalated'     (P1/P2, repeat negative customers) -> immediate alert to
 *                         branch lead + regional manager + HQ, case with SLA, draft reply
 *   lane 'in_queue'      (P3/P4) -> private branch queue, no push alerts, draft reply
 *   lane 'ready_to_post' (POSITIVE) -> Ready to Post queue (never auto-published)
 *   lane 'logged'        (NEUTRAL) -> stored, visible on dashboard, no action
 *
 * Output messages go to the `outbox` table via rfe_save_feedback(); the Outbox
 * Dispatcher delivers them. Customer replies to negative feedback are NEVER
 * produced here - they are drafts that a person sends from the dashboard.
 *
 * Depends on templates.js + drafts.js, passed in via `deps` so all files can be
 * inlined into the same n8n Code node without require().
 */

const ROLE_ORDER = ['branch_team', 'branch_lead', 'regional_manager', 'hq', 'ops_director', 'marketing'];

function rank(tier, TIER_RANK) { return TIER_RANK[tier] === undefined ? -1 : TIER_RANK[tier]; }

/** Contacts holding any of `roles`, de-duplicated (one person can hold two roles). */
function contactsForRoles(contacts, roles) {
  const out = [];
  const seen = new Set();
  for (const role of roles || []) {
    for (const c of contacts || []) {
      if (c.role !== role || c.active === false || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

function staffChannels(contact, tierChannels) {
  const ch = [];
  for (const c of tierChannels || []) {
    if (c === 'whatsapp' && contact.whatsapp && contact.notify_whatsapp !== false) ch.push('whatsapp');
    if (c === 'email' && contact.email && contact.notify_email !== false) ch.push('email');
    if (c === 'sms' && contact.whatsapp && contact.notify_sms) ch.push('sms');
  }
  if (!ch.length) {
    if (contact.email) ch.push('email');
    else if (contact.whatsapp) ch.push('whatsapp');
  }
  return ch;
}

function clip(text, max) {
  const t = String(text || '');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * @param {object} scored   final scored record
 * @param {object} ctx      { feedback_id, is_new, previous_tier, previous_lane, auto_reply_keys,
 *                            customer: {name, phone, email, channel}, customer_text,
 *                            branch: {id, name, phone, google_review_url},
 *                            job: {id, service_type, vehicle, vehicle_reg, technician},
 *                            contacts: [...], case_token, consent_requested, received_at,
 *                            history: {previous_negative_count, previous_negatives} }
 * @param {object} settings full app settings
 * @param {object} deps     { T, D, TIER_RANK, overrides }
 */
function routeFeedback(scored, ctx, settings, deps) {
  const { T, D, TIER_RANK } = deps;
  const overrides = deps.overrides || {};
  const tier = scored.tier;
  const rule = settings.routing[tier] || { notify_roles: [], channels: [], create_case: false, lane: 'logged' };
  const lane = scored.lane || rule.lane;
  const general = settings.general || {};
  const autoReplies = settings.customer_auto_replies || {};
  const base = String(general.public_base_url || '').replace(/\/$/, '');
  const meta = T.TIER_META[tier];

  const tierUp = !ctx.is_new && rank(tier, TIER_RANK) > rank(ctx.previous_tier, TIER_RANK);
  const laneUp = tierUp && lane === 'escalated' && (ctx.previous_lane || '') !== 'escalated';
  const caseLinkFor = (contactId) => `${base}/webhook/rfe/case?t=${encodeURIComponent(ctx.case_token || '__CASE_TOKEN__')}` +
    (contactId ? `&c=${encodeURIComponent(contactId)}` : '');

  const branchLead = contactsForRoles(ctx.contacts, ['branch_lead'])[0];
  const draft = D.buildDraft(scored, {
    customer_first_name: T.firstName(ctx.customer.name),
    customer_text: ctx.customer_text,
    branch_name: ctx.branch.name,
    branch_lead_name: branchLead ? branchLead.name.split(' ')[0] : null,
    lane,
  }, settings.drafts);

  const prev = (ctx.history && ctx.history.previous_negatives) || [];
  const repeatNote = scored.flags && scored.flags.repeat_customer
    ? `Repeat customer - ${scored.previous_negative_count} earlier negative feedback` +
      (prev[0] ? ` (last ${String(prev[0].created_at).slice(0, 10)}, ${prev[0].branch_name}: "${clip(prev[0].summary || '', 80)}")` : '')
    : '';

  const vars = {
    brand_name: general.brand_name,
    branch_name: ctx.branch.name,
    branch_phone: ctx.branch.phone || general.support_phone,
    customer_name: ctx.customer.name || 'Unknown',
    customer_first_name: T.firstName(ctx.customer.name),
    customer_phone: ctx.customer.phone || '-',
    customer_email: ctx.customer.email || '-',
    customer_text: ctx.customer_text || '(no written comment)',
    customer_quote: clip(ctx.customer_text || scored.summary || '', 280),
    job_id: ctx.job.id,
    service_type: ctx.job.service_type || 'service',
    vehicle: [ctx.job.vehicle, ctx.job.vehicle_reg].filter(Boolean).join(' ') || '-',
    technician: ctx.job.technician || '-',
    tier_icon: meta.icon,
    tier_label: meta.label,
    score: scored.score,
    score_100: scored.score_100,
    intensity: scored.intensity,
    emotion: scored.emotion ? scored.emotion.replace(/_/g, ' ') : '',
    summary: scored.summary,
    reasons: (scored.reasons || []).join('; ') || '-',
    recommended_action: scored.recommended_action,
    issues_list: (scored.issues || []).map((i) => `${String(i.category).replace(/_/g, ' ')} (${i.severity})${i.detail ? ': ' + i.detail : ''}`).join('; ') || '-',
    ack_minutes: rule.ack_sla_minutes,
    received_at: ctx.received_at || '',
    staff_mentioned: (scored.staff_mentioned || []).join(' & '),
    repeat_note: repeatNote,
    draft_text: draft ? draft.text : '',
  };

  // ------------------------------------------------------------ staff alerts
  // Only the escalated lane pushes to phones - immediately, no queue, no quiet hours.
  const staff = [];
  const shouldAlert = lane === 'escalated' && (ctx.is_new || laneUp || tierUp);
  if (shouldAlert) {
    for (const c of contactsForRoles(ctx.contacts, rule.notify_roles)) {
      const channels = staffChannels(c, rule.channels);
      if (!channels.length) continue;
      const v = { ...vars, case_link: caseLinkFor(c.id) };
      staff.push({
        audience: 'staff',
        kind: ctx.is_new ? 'staff_alert' : 'staff_alert_upgrade',
        priority: tier === 'P1_CRITICAL' ? 1 : 2,
        contact_id: c.id,
        role: c.role,
        channels,
        to_phone: c.whatsapp || null,
        to_email: c.email || null,
        wa_template: {
          name: settings.whatsapp.staff_alert_template,
          params: [
            `${v.tier_icon} ${v.tier_label}${repeatNote ? ' - REPEAT CUSTOMER' : ''}`, v.branch_name,
            `${v.customer_name} (${v.customer_phone})`, String(v.score_100), v.customer_quote, v.reasons, v.case_link,
          ].map((p) => T.waParam(p, 500)),
        },
        text: T.render(T.getTemplate('staff_alert_text', overrides), v),
        email_subject: T.render(T.getTemplate('staff_alert_email_subject', overrides), v),
        email_html: T.render(T.getTemplate('staff_alert_email_html', overrides), v, { html: true }),
        respect_quiet_hours: false,
        dedupe_key: `fb:${ctx.feedback_id}:${tier}:${c.id}`,
      });
    }
  }

  // ------------------------------------------------------------ customer auto-reply
  // Only non-negative / collection messages are automatic. Negative feedback gets a draft.
  let customer = null;
  let askConsent = false;
  const hasText = Boolean(ctx.customer_text && ctx.customer_text.trim());
  const reviewLink = settings.reviews && settings.reviews.invite_mode === 'all' ? ctx.branch.google_review_url : null;
  let key = null;
  const cv = { ...vars, review_link: null };
  const sent = ctx.auto_reply_keys || [];
  const sentFinal = sent.some((k) => k.startsWith('reply_'));
  if (ctx.customer.channel !== 'web' && !sentFinal) {
    if (!hasText && sent.length === 0 && autoReplies.ask_for_details_after_tap !== false) {
      key = tier === 'POSITIVE' ? 'ask_details_great_text' : (lane === 'logged' || tier === 'P4_LOW' ? 'ask_details_ok_text' : 'ask_details_poor_text');
      if (tier === 'POSITIVE') cv.review_link = reviewLink;
    } else if (hasText && tier === 'POSITIVE' && autoReplies.positive_thank_you !== false) {
      key = 'reply_positive_text';
      cv.review_link = reviewLink;
      if (scored.testimonial_candidate && !ctx.consent_requested) { cv.ask_consent = true; askConsent = true; }
    } else if (hasText && tier === 'NEUTRAL' && autoReplies.positive_thank_you !== false) {
      key = 'reply_neutral_text';
      cv.review_link = reviewLink;
    } else if (hasText && draft && autoReplies.negative_acknowledgement) {
      key = 'reply_received_text';
    }
  }
  if (key) {
    const text = T.render(T.getTemplate(key, overrides), cv);
    customer = {
      audience: 'customer',
      kind: 'customer_reply',
      template_key: key,
      priority: 3,
      channels: [ctx.customer.channel || 'whatsapp'],
      to_phone: ctx.customer.phone || null,
      to_email: ctx.customer.email || null,
      text,
      email_subject: `Re: your visit to ${ctx.branch.name}`,
      email_html: '<p style="font-family:system-ui,Arial,sans-serif;white-space:pre-wrap">' + T.escapeHtml(text) + '</p>',
      respect_quiet_hours: false,
      dedupe_key: `fb:${ctx.feedback_id}:auto:${key}`,
    };
  }

  return {
    tier,
    lane,
    tier_label: rule.label || tier,
    create_case: Boolean(rule.create_case) || lane === 'escalated',
    sla: {
      ack_minutes: rule.ack_sla_minutes || null,
      contact_minutes: rule.contact_sla_minutes || null,
      resolve_minutes: rule.resolve_sla_minutes || null,
    },
    tier_upgraded: tierUp,
    staff_messages: staff,
    customer_message: customer,
    draft,
    ready_to_post: lane === 'ready_to_post' && hasText,
    ask_consent: askConsent,
    notified_roles: [...new Set(staff.map((s) => s.role))].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
  };
}

module.exports = { routeFeedback, contactsForRoles, staffChannels, ROLE_ORDER };
