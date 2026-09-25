/**
 * Outbox dispatcher helpers: choose the next channel for a queued message,
 * build the provider payload, and classify send errors so the database can
 * decide between "retry same channel" and "fall back to next channel".
 */

function nextChannel(row) {
  const tried = new Set(row.tried_channels || []);
  for (const ch of row.channels || []) {
    if (tried.has(ch)) continue;
    if ((ch === 'whatsapp' || ch === 'sms') && !row.to_phone) continue;
    if (ch === 'email' && !row.to_email) continue;
    if (ch === 'email' && !row.email_html && !row.text) continue;
    if (ch === 'sms' && !row.text) continue;
    if (ch === 'whatsapp' && !row.wa_template && !row.text) continue;
    return ch;
  }
  return null;
}

function waDigits(phone) { return String(phone || '').replace(/\D/g, ''); }

function buildWhatsAppBody(row, waCfg) {
  const t = row.wa_template;
  if (t && t.name) {
    const components = [];
    if (t.params && t.params.length) {
      components.push({ type: 'body', parameters: t.params.map((p) => ({ type: 'text', text: String(p) })) });
    }
    (t.button_payloads || []).forEach((payload, i) => {
      components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] });
    });
    return {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: waDigits(row.to_phone), type: 'template',
      template: { name: t.name, language: { code: t.language || (waCfg && waCfg.template_language) || 'en_GB' }, components },
    };
  }
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: waDigits(row.to_phone), type: 'text',
    text: { preview_url: true, body: String(row.text).slice(0, 4096) },
  };
}

/** Build everything the dispatcher workflow needs for one outbox row. */
function buildSend(row, settings) {
  const channel = nextChannel(row);
  const base = { outbox_id: row.id, channel, attempts: row.attempts || 0 };
  if (!channel) return { ...base, channel: 'none' };
  if (channel === 'whatsapp') {
    return { ...base, whatsapp_body: buildWhatsAppBody(row, settings.whatsapp) };
  }
  if (channel === 'sms') {
    // SMS gets the plain text version; strip characters that force UCS-2 where cheap to do so.
    const body = String(row.text || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").slice(0, 640);
    return { ...base, sms_to: row.to_phone, sms_body: body };
  }
  return {
    ...base,
    email_to: row.to_email,
    email_subject: row.email_subject || 'Message from ' + ((settings.general && settings.general.brand_name) || 'us'),
    email_html: row.email_html || '<p style="white-space:pre-wrap">' + String(row.text || '').replace(/</g, '&lt;') + '</p>',
  };
}

const WA_PERMANENT = new Set(['100', '131008', '131009', '131021', '131026', '131030', '131031', '131045',
  '131047', '131051', '131052', '131053', '132000', '132001', '132005', '132007', '132012', '132015',
  '132016', '133010', '190', '10', '200', '368', '470']);
const TWILIO_PERMANENT = new Set(['21211', '21214', '21408', '21606', '21610', '21612', '21614', '21617', '30003', '30004', '30005', '30006', '30007']);

/**
 * n8n puts node errors on item.json.error (message/description/httpCode) when
 * "On Error -> Continue (using error output)" is set. Providers bury their own
 * error code in the message text, so dig it out.
 */
function classifyError(channel, err) {
  const e = err || {};
  const blob = [e.message, e.description, typeof e.cause === 'object' ? JSON.stringify(e.cause) : e.cause,
    typeof e.context === 'object' ? JSON.stringify(e.context) : '', JSON.stringify(e.error || '')]
    .filter(Boolean).join(' ');
  const httpCode = String(e.httpCode || e.statusCode || (blob.match(/\b([45]\d\d)\b/) || [])[1] || '');
  const providerCode = (blob.match(/"code"\s*:\s*"?(\d{1,6})"?/) || blob.match(/\b(1[0-3]\d{4}|2\d{4}|3\d{4})\b/) || [])[1] || null;
  let permanent = false;
  if (channel === 'whatsapp') permanent = WA_PERMANENT.has(String(providerCode)) || ['400', '401', '403', '404'].includes(httpCode) && providerCode !== '130429';
  else if (channel === 'sms') permanent = TWILIO_PERMANENT.has(String(providerCode)) || ['400', '401', '403', '404'].includes(httpCode);
  else if (channel === 'email') permanent = /\b5\d\d\b/.test(blob) && !/\b(timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED)\b/i.test(blob);
  // n8n's own wording for 401/403 when the provider rejects the credentials: retrying
  // the same channel cannot help, so fall back to the next channel straight away.
  if (/Forbidden - perhaps check your credentials|Authorization failed - please check your credentials/i.test(blob)) permanent = true;
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|timeout/i.test(blob)) permanent = false;
  return {
    permanent,
    code: providerCode || httpCode || null,
    message: String(e.message || blob || 'unknown error').slice(0, 1000),
  };
}

/** Pull the provider message id out of a successful response. */
function providerMessageId(channel, response) {
  const r = response || {};
  if (channel === 'whatsapp') return (r.messages && r.messages[0] && r.messages[0].id) || null;
  if (channel === 'sms') return r.sid || r.messageSid || null;
  if (channel === 'email') return r.messageId || (r.info && r.info.messageId) || null;
  return null;
}

module.exports = { nextChannel, buildSend, buildWhatsAppBody, classifyError, providerMessageId };
