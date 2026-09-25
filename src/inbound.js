/**
 * Channel adapters + intake validation.
 *
 *  normalizeJobEvent()   job-completed payload from the DMS / garage system -> canonical job
 *  normalizeWhatsApp()   Meta WhatsApp Cloud API webhook -> messages[] + statuses[]
 *  normalizeTwilioSms()  Twilio inbound SMS webhook -> message
 *  normalizeWebForm()    our own feedback web form -> message
 *  classifyIntent()      opt-out / opt-in / testimonial consent / feedback
 *  verifyMetaSignature() X-Hub-Signature-256 check (needs node 'crypto')
 *
 * No requires at module level (crypto is passed in) so this inlines into n8n Code nodes.
 */

function normalizePhone(raw, defaultCountryCode) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const digits = s.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  }
  const cc = String(defaultCountryCode || '').replace(/\D/g, '');
  if (s.startsWith('0') && cc) s = cc + s.replace(/^0+/, '');
  else if (cc && s.length <= 10) s = cc + s; // national number without trunk 0
  return s.length >= 8 && s.length <= 15 ? '+' + s : null;
}

function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Accepts the flexible shape most garage/DMS systems can send and returns a
 * canonical job, or { errors: [...] }.
 * Required: job id, branch id, completion (status 'completed' or completed_at),
 * and at least one customer contact (phone or email).
 */
function normalizeJobEvent(body, defaultCountryCode) {
  const b = body || {};
  const c = b.customer || {};
  const v = b.vehicle || {};
  const errors = [];
  const pick = (...xs) => xs.find((x) => x !== undefined && x !== null && String(x).trim() !== '');

  const job = {
    source_system: String(pick(b.source_system, b.source, 'dms')).slice(0, 50),
    external_job_id: pick(b.job_id, b.jobId, b.id, b.work_order, b.ro_number),
    branch_code: pick(b.branch_id, b.branchId, b.branch_code, b.location_id, b.site_id),
    status: String(pick(b.status, b.job_status, 'completed')).toLowerCase(),
    completed_at: pick(b.completed_at, b.completedAt, b.closed_at, b.timestamp) || new Date().toISOString(),
    service_type: pick(b.service_type, b.serviceType, b.job_type, b.description) || 'service',
    technician: pick(b.technician, b.mechanic, b.technician_name) || null,
    advisor: pick(b.advisor, b.service_advisor, b.advisor_name) || null,
    invoice_total: Number.isFinite(Number(b.invoice_total ?? b.total)) ? Number(b.invoice_total ?? b.total) : null,
    customer_name: pick(c.name, [c.first_name, c.last_name].filter(Boolean).join(' '), b.customer_name) || null,
    customer_phone: normalizePhone(pick(c.phone, c.mobile, c.whatsapp, b.customer_phone, b.mobile), defaultCountryCode),
    customer_email: normalizeEmail(pick(c.email, b.customer_email)),
    marketing_consent: Boolean(c.marketing_consent ?? b.marketing_consent ?? false),
    vehicle_reg: pick(v.registration, v.reg, v.plate, b.vehicle_reg, b.registration) || null,
    vehicle: [pick(v.make, b.vehicle_make), pick(v.model, b.vehicle_model)].filter(Boolean).join(' ') || pick(b.vehicle_description) || null,
    raw: b,
  };
  if (job.vehicle_reg) job.vehicle_reg = String(job.vehicle_reg).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!job.external_job_id) errors.push('job_id is required');
  if (!job.branch_code) errors.push('branch_id is required');
  if (!['completed', 'complete', 'closed', 'invoiced', 'done', 'collected'].includes(job.status)) errors.push(`status '${job.status}' is not a completed status`);
  if (!job.customer_phone && !job.customer_email) errors.push('customer phone or email is required');
  if (Number.isNaN(Date.parse(job.completed_at))) errors.push('completed_at is not a valid date');
  if (job.external_job_id) job.external_job_id = String(job.external_job_id).slice(0, 100);
  if (job.branch_code) job.branch_code = String(job.branch_code).slice(0, 50);
  return errors.length ? { errors, job } : { job };
}

const BUTTON_MAP = {
  RATE_GREAT: 'great', RATE_OK: 'ok', RATE_POOR: 'poor',
  great: 'great', ok: 'ok', poor: 'poor', 'not good': 'poor', 'good': 'great',
};

function parseButtonPayload(payload, title) {
  // Payload is "RATE_GREAT:<request_id>" (set per message when sending the template).
  if (payload) {
    const [code, requestId] = String(payload).split(':');
    if (BUTTON_MAP[code]) return { rating: BUTTON_MAP[code], request_id: requestId || null };
  }
  if (title) {
    const t = String(title).toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (BUTTON_MAP[t]) return { rating: BUTTON_MAP[t], request_id: null };
  }
  return { rating: null, request_id: null };
}

/** Meta WhatsApp Cloud API webhook body -> { messages: [...], statuses: [...] } */
function normalizeWhatsApp(body, defaultCountryCode) {
  const messages = [];
  const statuses = [];
  for (const entry of (body && body.entry) || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = {};
      for (const ct of value.contacts || []) names[ct.wa_id] = ct.profile && ct.profile.name;
      for (const m of value.messages || []) {
        let text = '';
        let button = { rating: null, request_id: null };
        switch (m.type) {
          case 'text': text = (m.text && m.text.body) || ''; break;
          case 'button': button = parseButtonPayload(m.button && m.button.payload, m.button && m.button.text); break;
          case 'interactive': {
            const r = m.interactive && (m.interactive.button_reply || m.interactive.list_reply);
            button = parseButtonPayload(r && r.id, r && r.title);
            if (!button.rating && r) text = r.title || '';
            break;
          }
          case 'reaction': text = (m.reaction && m.reaction.emoji) || ''; break;
          case 'audio': case 'voice': text = '[voice note received - please listen in WhatsApp]'; break;
          case 'image': case 'video': case 'document': text = (m[m.type] && m[m.type].caption) || `[${m.type} received - see WhatsApp]`; break;
          default: text = `[${m.type} message]`;
        }
        messages.push({
          channel: 'whatsapp',
          provider_message_id: m.id,
          from_phone: normalizePhone('+' + m.from, defaultCountryCode),
          profile_name: names[m.from] || null,
          text: String(text).slice(0, 4000),
          rating: button.rating,
          request_id_hint: button.request_id,
          context_message_id: (m.context && m.context.id) || null,
          received_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          message_type: m.type,
        });
      }
      for (const s of value.statuses || []) {
        statuses.push({
          provider_message_id: s.id,
          status: s.status, // sent | delivered | read | failed
          error_code: s.errors && s.errors[0] ? String(s.errors[0].code) : null,
          error_title: s.errors && s.errors[0] ? (s.errors[0].title || s.errors[0].message || null) : null,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  }
  return { messages, statuses };
}

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded, parsed by n8n). */
function normalizeTwilioSms(body, defaultCountryCode) {
  const b = body || {};
  const text = String(b.Body || '').trim();
  return {
    channel: 'sms',
    provider_message_id: b.MessageSid || b.SmsSid || null,
    from_phone: normalizePhone(b.From, defaultCountryCode),
    profile_name: null,
    text: text.slice(0, 4000),
    rating: null,
    request_id_hint: null,
    received_at: new Date().toISOString(),
    message_type: 'text',
  };
}

/** Our hosted feedback form (email / SMS link). token identifies the request. */
function normalizeWebForm(body) {
  const b = body || {};
  const rating = BUTTON_MAP[String(b.rating || b.r || '').toLowerCase()] || null;
  return {
    channel: 'web',
    provider_message_id: b.submission_id || null,
    from_phone: null,
    request_token: String(b.token || b.t || '').slice(0, 64) || null,
    profile_name: null,
    text: String(b.comment || b.text || '').trim().slice(0, 4000),
    rating,
    request_id_hint: null,
    received_at: new Date().toISOString(),
    message_type: 'web',
  };
}

const OPT_OUT = /^\s*(stop|stopall|unsubscribe|opt[\s-]?out|cancel|end|quit|remove me)\s*[.!]*\s*$/i;
const OPT_IN = /^\s*(start|unstop|opt[\s-]?in|subscribe)\s*[.!]*\s*$/i;
const YES = /^\s*(yes|y|yeah|yep|yup|sure|ok(ay)?|of course|go ahead|absolutely|happy to|no problem|👍)\b[\s\S]{0,40}$/i;
const NO = /^\s*(no|n|nope|no thanks|no thank you|rather not|please don'?t|don'?t)\b[\s.!]*$/i;

/**
 * @param msg normalised message
 * @param state { consent_pending: bool } from the DB lookup
 */
function classifyIntent(msg, state) {
  const text = String(msg.text || '').trim();
  if (OPT_OUT.test(text)) return 'opt_out';
  if (OPT_IN.test(text)) return 'opt_in';
  if (state && state.consent_pending && !msg.rating) {
    if (YES.test(text)) return 'consent_yes';
    if (NO.test(text)) return 'consent_no';
  }
  if (!text && !msg.rating) return 'ignore';
  return 'feedback';
}

/** Verify Meta's X-Hub-Signature-256 over the raw request body. */
function verifyMetaSignature(rawBody, signatureHeader, appSecret, crypto) {
  if (!appSecret) return true; // verification disabled (dev only - documented)
  if (!signatureHeader || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verify Twilio's X-Twilio-Signature (HMAC-SHA1 of URL + sorted POST params). */
function verifyTwilioSignature(url, params, signatureHeader, authToken, crypto) {
  if (!authToken) return true;
  if (!signatureHeader) return false;
  const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  normalizePhone, normalizeEmail, normalizeJobEvent, normalizeWhatsApp, normalizeTwilioSms,
  normalizeWebForm, classifyIntent, parseButtonPayload, verifyMetaSignature, verifyTwilioSignature,
};
