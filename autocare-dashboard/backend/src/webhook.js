/**
 * n8n integration: when a job is marked completed, POST its details to an
 * n8n Webhook node.
 *
 * The admin sets it up in Settings -> n8n integration:
 *   - Webhook URL (the "Production URL" from the n8n Webhook node)
 *   - optional header name + value (e.g. X-RFE-Key), if the webhook uses Header Auth
 *   - on/off switch
 *
 * Sending never slows down or blocks "Mark as Completed": it runs in the
 * background, retries a few times if n8n does not answer, and records each
 * delivery so the admin can see it (and resend it) in Settings.
 *
 * The body uses the field names the Reputation & Feedback engine's
 * "job completed" intake expects (job_id, branch_id, status, completed_at,
 * customer.{name,phone,email}), so it works with that workflow as-is.
 */
const db = require('./db');
const { BRANCH_CODES } = require('./options');

const SETTINGS_KEY = 'n8n_webhook';
const TIMEOUT_MS = 10_000;
const KEEP_DELIVERIES = 50;

// Wait this long before each retry. Tests shorten it with setRetryDelays().
let retryDelaysMs = [5_000, 30_000];

function setRetryDelays(delays) {
  retryDelaysMs = delays;
}

/** Saved settings: { enabled, url, headerName, headerValue } */
function getConfig() {
  const row = db.get('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
  const saved = row ? JSON.parse(row.value) : {};
  return { enabled: false, url: '', headerName: '', headerValue: '', ...saved };
}

/** Settings as shown in the admin panel: the header value (a secret) is never sent back. */
function getPublicConfig() {
  const { headerValue, ...rest } = getConfig();
  return { ...rest, headerValueSet: Boolean(headerValue) };
}

/**
 * Check and save new settings. `headerValue` left empty keeps the saved one,
 * unless `clearHeaderValue` is true. Returns { error } or { config }.
 */
function saveConfig(input) {
  const current = getConfig();
  const url = String(input.url ?? '').trim();
  const headerName = String(input.headerName ?? '').trim();
  const enabled = Boolean(input.enabled);

  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { error: 'The webhook URL is not valid. Copy it from the n8n Webhook node.' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: 'The webhook URL must start with https:// (or http://).' };
    }
  }
  if (enabled && !url) return { error: 'Paste the webhook URL before turning this on.' };
  if (headerName && !/^[A-Za-z0-9-]+$/.test(headerName)) {
    return { error: 'Header name can only contain letters, numbers and dashes (e.g. X-RFE-Key).' };
  }

  let headerValue = current.headerValue;
  if (input.clearHeaderValue || !headerName) headerValue = '';
  else if (input.headerValue) headerValue = String(input.headerValue);

  const config = { enabled, url, headerName, headerValue };
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    SETTINGS_KEY,
    JSON.stringify(config),
  ]);
  return { config: getPublicConfig() };
}

/** The JSON body sent to n8n for a completed booking. */
function buildJobCompletedPayload(booking, { test = false } = {}) {
  return {
    event: 'job.completed',
    test,
    source_system: 'autocare-dashboard',
    job_id: booking.booking_ref,
    booking_ref: booking.booking_ref,
    branch_id: BRANCH_CODES[booking.branch] || booking.branch,
    branch_name: booking.branch,
    status: 'completed',
    completed_at: booking.completed_at,
    scheduled_date: booking.scheduled_date,
    booked_at: booking.created_at,
    service_type: booking.service_type,
    notes: booking.other_details || null,
    amount_paid: booking.amount_paid,
    customer: {
      name: booking.customer_name,
      phone: booking.customer_phone,
      email: booking.customer_email,
    },
  };
}

/** A made-up completed booking for the "Send test" button. */
function sampleBooking() {
  const now = new Date().toISOString();
  return {
    booking_ref: 'AUTO-TEST-0001',
    customer_name: 'Test Customer',
    customer_email: 'test.customer@example.com',
    customer_phone: '+234 803 000 0000',
    service_type: 'Oil Change',
    other_details: 'This is a test event from the AutoCare dashboard.',
    branch: 'Ikeja Branch',
    amount_paid: 0,
    scheduled_date: now.slice(0, 10) + ' 10:00',
    created_at: now,
    completed_at: now,
  };
}

/** One POST to n8n. Returns { ok, httpStatus, error }. */
async function postOnce(config, payload) {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'AutoCare-Dashboard' };
  if (config.headerName && config.headerValue) headers[config.headerName] = config.headerValue;
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, httpStatus: res.status };
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, httpStatus: res.status, error: explainHttpError(res.status, config.url, text) };
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'n8n did not answer within 10 seconds.' : `Could not reach n8n (${err.cause?.code || err.message}).`;
    return { ok: false, httpStatus: null, error: reason };
  }
}

/** Turn n8n's error codes into plain advice. */
function explainHttpError(status, url, body) {
  const isTestUrl = url.includes('/webhook-test/');
  if (status === 404 && isTestUrl) {
    return 'n8n answered 404. Test URLs only work right after you click "Listen for test event" in n8n. Use the Production URL for real use.';
  }
  if (status === 404) return 'n8n answered 404: the workflow is not active, or the URL is wrong. Activate the workflow in n8n.';
  if (status === 401 || status === 403) return `n8n answered ${status}: the header name or value is wrong.`;
  return `n8n answered ${status}${body ? `: ${body}` : ''}`;
}

/** Record a delivery row, then send (with retries). Returns the final delivery row. */
async function deliver(event, bookingRef, payload, { retries = true } = {}) {
  const config = getConfig();
  const now = new Date().toISOString();
  const { lastId } = db.run(
    `INSERT INTO webhook_deliveries (event, booking_ref, status, attempts, payload, created_at, updated_at)
     VALUES (?, ?, 'sending', 0, ?, ?, ?)`,
    [event, bookingRef, JSON.stringify(payload), now, now]
  );
  pruneDeliveries();

  const delays = retries ? [0, ...retryDelaysMs] : [0];
  let result;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
    result = await postOnce(config, payload);
    db.run(
      'UPDATE webhook_deliveries SET status = ?, http_status = ?, error = ?, attempts = ?, updated_at = ? WHERE id = ?',
      [result.ok ? 'success' : attempt === delays.length - 1 ? 'failed' : 'sending', result.httpStatus, result.error || null,
        attempt + 1, new Date().toISOString(), lastId]
    );
    // Retrying won't fix a wrong URL or a wrong key.
    if (result.ok || [400, 401, 403, 404].includes(result.httpStatus)) break;
  }
  if (!result.ok) {
    db.run("UPDATE webhook_deliveries SET status = 'failed' WHERE id = ?", [lastId]);
    console.warn(`n8n webhook failed for ${bookingRef || event}: ${result.error}`);
  }
  return getDelivery(lastId);
}

/**
 * Called after a job is marked completed. Returns straight away; the sending
 * happens in the background. Does nothing if the integration is off.
 */
function notifyJobCompleted(booking) {
  const config = getConfig();
  if (!config.enabled || !config.url) return null;
  return deliver('job.completed', booking.booking_ref, buildJobCompletedPayload(booking)).catch((err) =>
    console.error('n8n webhook error:', err)
  );
}

/** "Send test" button: one attempt, and the caller waits for the result. */
async function sendTest() {
  const config = getConfig();
  if (!config.url) return { error: 'Paste and save the webhook URL first.' };
  const delivery = await deliver('test', 'AUTO-TEST-0001', buildJobCompletedPayload(sampleBooking(), { test: true }), {
    retries: false,
  });
  return { delivery };
}

/** "Resend" button on a failed delivery: sends the same body again. */
async function resend(id) {
  const old = db.get('SELECT * FROM webhook_deliveries WHERE id = ?', [id]);
  if (!old) return { error: 'Delivery not found.' };
  if (!getConfig().url) return { error: 'Paste and save the webhook URL first.' };
  const delivery = await deliver(old.event, old.booking_ref, JSON.parse(old.payload), { retries: false });
  return { delivery };
}

function getDelivery(id) {
  const row = db.get('SELECT id, event, booking_ref, status, http_status, error, attempts, created_at, updated_at FROM webhook_deliveries WHERE id = ?', [id]);
  return row;
}

function recentDeliveries(limit = 15) {
  return db.all(
    'SELECT id, event, booking_ref, status, http_status, error, attempts, created_at, updated_at FROM webhook_deliveries ORDER BY id DESC LIMIT ?',
    [limit]
  );
}

function pruneDeliveries() {
  db.run('DELETE FROM webhook_deliveries WHERE id <= (SELECT MAX(id) FROM webhook_deliveries) - ?', [KEEP_DELIVERIES]);
}

module.exports = {
  getPublicConfig,
  saveConfig,
  buildJobCompletedPayload,
  notifyJobCompleted,
  sendTest,
  resend,
  recentDeliveries,
  setRetryDelays,
};
