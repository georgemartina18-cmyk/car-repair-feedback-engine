#!/usr/bin/env node
/**
 * Generates importable n8n workflow files (workflows/*.json) and
 * database/003_settings.sql from src/ + config/ + dashboard/.
 *
 *   npm run build           write files
 *   npm run check           fail if committed files are out of date (CI)
 *
 * The business logic lives in src/*.js (unit + integration tested). Each Code
 * node gets the modules it needs inlined, so the workflows need no external
 * npm packages and always match the tested code.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { codeNode } = require('./lib/inline');
const { settingsSql } = require('./lib/settings-sql');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------- credentials
// Create credentials with EXACTLY these names in n8n before importing
// (docs/02-n8n-setup.md). scripts/deploy-n8n.js maps them to real ids.
const CRED = {
  postgres: { postgres: { id: 'RFE_POSTGRES', name: 'RFE Postgres' } },
  intake: { httpHeaderAuth: { id: 'RFE_INTAKE_KEY', name: 'RFE Intake Key' } },
  internal: { httpHeaderAuth: { id: 'RFE_INTERNAL_KEY', name: 'RFE Internal Key' } },
  whatsapp: { httpHeaderAuth: { id: 'RFE_WHATSAPP_TOKEN', name: 'RFE WhatsApp Token' } },
  anthropic: { httpHeaderAuth: { id: 'RFE_ANTHROPIC_KEY', name: 'RFE Anthropic Key' } },
  twilio: { twilioApi: { id: 'RFE_TWILIO', name: 'RFE Twilio' } },
  smtp: { smtp: { id: 'RFE_SMTP', name: 'RFE SMTP' } },
  dashboard: { httpBasicAuth: { id: 'RFE_DASHBOARD_LOGIN', name: 'RFE Dashboard Login' } },
};

// ---------------------------------------------------------------- helpers
function uuid(seed) {
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const M = { S: ['scoring.js', 'S'], T: ['templates.js', 'T'], D: ['drafts.js', 'D'], R: ['routing.js', 'R'],
  I: ['inbound.js', 'I'], X: ['dispatch.js', 'X'], P: ['pipeline.js', 'P'] };
const mods = (letters) => letters.split('').map((l) => M[l]);
// Only the modules each node needs are inlined; deps holds whichever are present.
const PRELUDE = `const deps = { S: typeof S === 'undefined' ? null : S, T: typeof T === 'undefined' ? null : T,
  D: typeof D === 'undefined' ? null : D, R: typeof R === 'undefined' ? null : R,
  I: typeof I === 'undefined' ? null : I, X: typeof X === 'undefined' ? null : X };
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');`;

function wf(name, build) {
  const nodes = [];
  const connections = {};
  const api = {
    node(nodeName, type, typeVersion, parameters, pos, extra) {
      const n = { parameters, id: uuid(name + '/' + nodeName), name: nodeName, type, typeVersion, position: pos, ...(extra || {}) };
      nodes.push(n);
      return nodeName;
    },
    connect(from, to, fromOutput = 0) {
      connections[from] = connections[from] || { main: [] };
      while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
      connections[from].main[fromOutput].push({ node: to, type: 'main', index: 0 });
    },
  };
  build(api, name);
  return {
    name,
    nodes,
    connections,
    active: false,
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner', timezone: 'Europe/London' },
    pinData: {},
    meta: { templateCredsSetupCompleted: false, rfe_generated: true },
  };
}

// ---- node factories ---------------------------------------------------------
const pg = (a, name, query, pos, extra) => a.node(name, 'n8n-nodes-base.postgres', 2.5,
  { operation: 'executeQuery', query, options: {} }, pos, { credentials: CRED.postgres, ...(extra || {}) });
// every JSON payload goes to Postgres base64-encoded: injection-proof and immune to
// the node's comma-splitting of query parameters.
const PAYLOAD = "convert_from(decode('{{ $json.b64 }}', 'base64'), 'UTF8')::jsonb";
const code = (a, name, modules, body, pos, mode = 'runOnceForEachItem', extra) => a.node(name, 'n8n-nodes-base.code', 2,
  { mode, jsCode: codeNode(modules, (modules.length ? PRELUDE + '\n' : '') + body) }, pos, extra);
const webhook = (a, name, method, p, pos, { auth, cred, responseMode = 'onReceived', options = {} } = {}) => a.node(name, 'n8n-nodes-base.webhook', 2,
  { httpMethod: method, path: p, authentication: auth || 'none', responseMode, options }, pos,
  { webhookId: uuid('webhook/' + method + '/' + p), ...(cred ? { credentials: cred } : {}) });
const respond = (a, name, pos, { withType = 'text', body, code: rc = 200, headers = [] }) => a.node(name, 'n8n-nodes-base.respondToWebhook', 1.1,
  { respondWith: withType, ...(body !== undefined ? { responseBody: body } : {}),
    options: { responseCode: rc, ...(headers.length ? { responseHeaders: { entries: headers } } : {}) } }, pos);
const cond = (left, op) => ({
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ id: uuid(left + op), leftValue: left, rightValue: '', operator: { type: 'boolean', operation: op, singleValue: true } }],
    combinator: 'and' },
  options: {},
});
const ifTrue = (a, name, left, pos) => a.node(name, 'n8n-nodes-base.if', 2, cond(left, 'true'), pos);
const switchOn = (a, name, left, values, pos) => a.node(name, 'n8n-nodes-base.switch', 3, {
  rules: { values: values.map((v) => ({
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ id: uuid(name + v), leftValue: left, rightValue: v, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and' },
    renameOutput: true, outputKey: v })) },
  options: {},
}, pos);
const kick = (a, name, pos) => a.node(name, 'n8n-nodes-base.httpRequest', 4.2, {
  method: 'POST',
  url: "={{ ($vars.RFE_INTERNAL_URL || 'http://localhost:5678') + '/webhook/rfe/dispatch' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '{"reason":"new messages queued"}',
  options: { timeout: 5000 },
}, pos, { credentials: CRED.internal, executeOnce: true, onError: 'continueRegularOutput',
  notes: 'Wakes the Outbox Dispatcher so alerts go out now instead of on the next 1-minute tick. Failure is harmless (the 1-minute schedule still runs). On n8n Cloud, set the Variable RFE_INTERNAL_URL to your instance URL if your plan has Variables.' });
// Runtime config: n8n Variables ($vars) > environment variables (self-hosted) > app_settings.runtime
// (database - the only option on n8n Cloud, which has no custom environment variables).
const RTV = `function rtv(runtime, key, name) {
  let v;
  try { v = $vars[name]; } catch (e) { v = undefined; }
  if (!v) { try { v = $env[name]; } catch (e) { v = undefined; } }
  if (!v && runtime) v = runtime[key];
  return v === undefined || v === null ? '' : String(v);
}`;
const loadRuntime = (a, name, pos, extra) => pg(a, name,
  "SELECT coalesce(rfe_setting('runtime'), '{}'::jsonb) AS runtime, rfe_setting('general') AS general", pos, extra);
const HTML = [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' },
  { name: 'X-Frame-Options', value: 'DENY' }, { name: 'Referrer-Policy', value: 'no-referrer' }];

// =============================================================================
const workflows = {};

// ---------------------------------------------------------------------------- 00
workflows['00-error-alerts'] = wf('RFE 00 - Error Alerts', (a) => {
  a.node('On Workflow Error', 'n8n-nodes-base.errorTrigger', 1, {}, [0, 0]);
  loadRuntime(a, 'Load Runtime', [220, 0], { onError: 'continueRegularOutput', alwaysOutputData: true });
  code(a, 'Format Alert', [], `${RTV}
const runtime = ($json && $json.runtime) || {};
const src = $('On Workflow Error').first().json;
const e = src.execution || {};
const w = src.workflow || {};
const msg = (e.error && (e.error.message || e.error.description)) || 'Unknown error';
return { json: {
  from: rtv(runtime, 'email_from', 'RFE_EMAIL_FROM'),
  to: rtv(runtime, 'admin_email', 'RFE_ADMIN_EMAIL'),
  subject: '[RFE] Workflow failed: ' + (w.name || 'unknown'),
  html: '<p><b>' + (w.name || '') + '</b> failed at node <b>' + ((e.lastNodeExecuted) || '?') + '</b>.</p>' +
        '<pre style="white-space:pre-wrap">' + String(msg).replace(/</g, '&lt;') + '</pre>' +
        (e.url ? '<p><a href="' + e.url + '">Open execution</a></p>' : ''),
} };`, [440, 0], 'runOnceForAllItems');
  a.node('Email Admin', 'n8n-nodes-base.emailSend', 2.1, {
    fromEmail: '={{ $json.from }}', toEmail: '={{ $json.to }}', subject: '={{ $json.subject }}',
    emailFormat: 'html', html: '={{ $json.html }}', options: { appendAttribution: false },
  }, [660, 0], { credentials: CRED.smtp });
  a.connect('On Workflow Error', 'Load Runtime');
  a.connect('Load Runtime', 'Format Alert');
  a.connect('Format Alert', 'Email Admin');
});

// ---------------------------------------------------------------------------- 01
workflows['01-job-completed-intake'] = wf('RFE 01 - Job Completed Intake', (a) => {
  webhook(a, 'Job Completed', 'POST', 'rfe/job-completed', [0, 0], { auth: 'headerAuth', cred: CRED.intake, responseMode: 'responseNode' });
  pg(a, 'Load Settings', 'SELECT rfe_settings() AS settings', [220, 0]);
  code(a, 'Validate Job', mods('I'), `
const body = $('Job Completed').item.json.body || {};
const settings = $json.settings;
const n = I.normalizeJobEvent(body, settings.general.default_country_code);
if (n.errors) return { json: { valid: false, response: { status: 'invalid', errors: n.errors } } };
return { json: { valid: true, b64: b64(n.job) } };`, [440, 0]);
  ifTrue(a, 'Valid?', '={{ $json.valid }}', [660, 0]);
  pg(a, 'Register Job', `=SELECT rfe_register_job(${PAYLOAD}) AS result`, [880, -100]);
  code(a, 'Build Request Message', mods('TP'), `
const reg = $json.result;
if (reg.status !== 'accepted') {
  return { json: { accepted: false, response: { status: reg.status, reason: reg.reason || null, request_id: reg.request_id || null } } };
}
const msg = P.buildFeedbackRequestMessage(reg, deps);
return { json: { accepted: true, b64: b64(msg), response: { status: 'queued', request_id: reg.request_id, send_at: reg.send_at } } };`, [1100, -100]);
  ifTrue(a, 'Accepted?', '={{ $json.accepted }}', [1320, -100]);
  pg(a, 'Queue Feedback Request', `=SELECT rfe_enqueue(${PAYLOAD}) AS outbox_id`, [1540, -200]);
  kick(a, 'Wake Dispatcher', [1760, -200]);
  respond(a, 'Respond Queued', [1980, -200], { withType: 'json', code: 202, body: "={{ JSON.stringify($('Build Request Message').item.json.response) }}" });
  respond(a, 'Respond Not Queued', [1540, 0], { withType: 'json', code: 200, body: '={{ JSON.stringify($json.response) }}' });
  respond(a, 'Respond Invalid', [880, 120], { withType: 'json', code: 422, body: '={{ JSON.stringify($json.response) }}' });
  a.connect('Job Completed', 'Load Settings');
  a.connect('Load Settings', 'Validate Job');
  a.connect('Validate Job', 'Valid?');
  a.connect('Valid?', 'Register Job', 0);
  a.connect('Valid?', 'Respond Invalid', 1);
  a.connect('Register Job', 'Build Request Message');
  a.connect('Build Request Message', 'Accepted?');
  a.connect('Accepted?', 'Queue Feedback Request', 0);
  a.connect('Accepted?', 'Respond Not Queued', 1);
  a.connect('Queue Feedback Request', 'Wake Dispatcher');
  a.connect('Wake Dispatcher', 'Respond Queued');
});

// ---------------------------------------------------------------------------- 02
workflows['02-outbox-dispatcher'] = wf('RFE 02 - Outbox Dispatcher', (a) => {
  a.node('Every Minute', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }, [0, 0]);
  webhook(a, 'Wake Up', 'POST', 'rfe/dispatch', [0, 180], { auth: 'headerAuth', cred: CRED.internal });
  pg(a, 'Load Settings', "SELECT rfe_settings() AS settings, coalesce(rfe_setting('runtime'), '{}'::jsonb) AS runtime", [220, 80]);
  pg(a, 'Claim Due Messages', 'SELECT * FROM rfe_claim_outbox(25)', [440, 80],
    { notes: 'FOR UPDATE SKIP LOCKED: overlapping runs never send the same message twice.' });
  code(a, 'Build Send', mods('X'), `${RTV}
const { settings, runtime } = $('Load Settings').first().json;
const s = X.buildSend($json, settings);
s.wa_url = (rtv(runtime, 'wa_api_base', 'RFE_WA_API_BASE') || 'https://graph.facebook.com') + '/' + settings.whatsapp.graph_version +
  '/' + rtv(runtime, 'wa_phone_number_id', 'RFE_WA_PHONE_NUMBER_ID') + '/messages';
s.sms_from = rtv(runtime, 'twilio_from', 'RFE_TWILIO_FROM');
s.email_from = rtv(runtime, 'email_from', 'RFE_EMAIL_FROM');
return { json: s };`, [660, 80]);
  switchOn(a, 'Channel', '={{ $json.channel }}', ['whatsapp', 'sms', 'email', 'none'], [880, 80]);
  a.node('Send WhatsApp', 'n8n-nodes-base.httpRequest', 4.2, {
    method: 'POST', url: '={{ $json.wa_url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.whatsapp_body) }}', options: { timeout: 20000 },
  }, [1100, -120], { credentials: CRED.whatsapp, onError: 'continueErrorOutput' });
  a.node('Send SMS', 'n8n-nodes-base.twilio', 1, {
    from: '={{ $json.sms_from }}', to: '={{ $json.sms_to }}', message: '={{ $json.sms_body }}', options: {},
  }, [1100, 60], { credentials: CRED.twilio, onError: 'continueErrorOutput' });
  a.node('Send Email', 'n8n-nodes-base.emailSend', 2.1, {
    fromEmail: '={{ $json.email_from }}', toEmail: '={{ $json.email_to }}', subject: '={{ $json.email_subject }}',
    emailFormat: 'html', html: '={{ $json.email_html }}', options: { appendAttribution: false },
  }, [1100, 240], { credentials: CRED.smtp, onError: 'continueErrorOutput' });
  code(a, 'Collect Result', mods('X'), `
const src = $('Build Send').item.json;
let out;
if (src.channel === 'none') {
  out = { outbox_id: src.outbox_id, channel: 'none', ok: false };
} else if ($json.error) {
  const err = typeof $json.error === 'object' ? $json.error : { message: String($json.error) };
  const c = X.classifyError(src.channel, err);
  out = { outbox_id: src.outbox_id, channel: src.channel, ok: false, error: c.message, error_code: c.code, permanent: c.permanent };
} else {
  out = { outbox_id: src.outbox_id, channel: src.channel, ok: true, provider_message_id: X.providerMessageId(src.channel, $json) };
}
return { json: { ...out, b64: b64(out) } };`, [1320, 80]);
  pg(a, 'Record Result', `=SELECT rfe_record_send_result(${PAYLOAD}) AS result`, [1540, 80]);
  a.connect('Every Minute', 'Load Settings');
  a.connect('Wake Up', 'Load Settings');
  a.connect('Load Settings', 'Claim Due Messages');
  a.connect('Claim Due Messages', 'Build Send');
  a.connect('Build Send', 'Channel');
  a.connect('Channel', 'Send WhatsApp', 0);
  a.connect('Channel', 'Send SMS', 1);
  a.connect('Channel', 'Send Email', 2);
  a.connect('Channel', 'Collect Result', 3);
  for (const n of ['Send WhatsApp', 'Send SMS', 'Send Email']) { a.connect(n, 'Collect Result', 0); a.connect(n, 'Collect Result', 1); }
  a.connect('Collect Result', 'Record Result');
});

// ---------------------------------------------------------------------------- 03
const { renderThanks } = require('../src/pages.js');
workflows['03-inbound-feedback-processor'] = wf('RFE 03 - Inbound Feedback Processor', (a) => {
  // --- WhatsApp webhook verification (Meta calls GET once when you register the URL)
  webhook(a, 'WhatsApp Verify (GET)', 'GET', 'rfe/whatsapp', [0, -360], { responseMode: 'responseNode' });
  loadRuntime(a, 'Runtime (verify)', [220, -360]);
  code(a, 'Check Verify Token', [], `${RTV}
const q = $('WhatsApp Verify (GET)').first().json.query || {};
const expected = rtv($json.runtime, 'wa_verify_token', 'RFE_WA_VERIFY_TOKEN');
const ok = q['hub.mode'] === 'subscribe' && expected && q['hub.verify_token'] === expected;
return { json: { code: ok ? 200 : 403, body: ok ? String(q['hub.challenge']) : 'forbidden' } };`, [440, -360]);
  respond(a, 'Respond Verify', [660, -360], { body: '={{ $json.body }}', code: '={{ $json.code }}' });

  // --- WhatsApp messages + delivery statuses
  webhook(a, 'WhatsApp Inbound', 'POST', 'rfe/whatsapp', [0, -160], { options: { rawBody: true } });
  code(a, 'Capture Raw Body', [], `
const item = $input.first();
let raw = null;
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = null; }
return [{ json: { raw, signature: (item.json.headers || {})['x-hub-signature-256'] || null, body: item.json.body || {} } }];`, [220, -160], 'runOnceForAllItems');
  loadRuntime(a, 'Runtime (WhatsApp)', [440, -160]);
  code(a, 'Parse WhatsApp', mods('I'), `${RTV}
const { runtime, general } = $json;
const src = $('Capture Raw Body').first().json;
const secret = rtv(runtime, 'wa_app_secret', 'RFE_WA_APP_SECRET');
if (secret && !I.verifyMetaSignature(src.raw, src.signature, secret, require('crypto'))) {
  console.log('RFE: rejected WhatsApp webhook with invalid signature');
  return [];
}
const n = I.normalizeWhatsApp(src.body, (general && general.default_country_code) || '44');
return [
  ...n.statuses.map((s) => ({ json: { kind: 'status', b64: b64(s) } })),
  ...n.messages.map((m) => ({ json: { kind: 'message', b64: b64(m) } })),
];`, [660, -160], 'runOnceForAllItems');
  switchOn(a, 'Status or Message', '={{ $json.kind }}', ['status', 'message'], [880, -160]);
  pg(a, 'Record Delivery Status', `=SELECT rfe_whatsapp_status(${PAYLOAD}) AS result`, [1100, -260]);

  // --- SMS replies (Twilio)
  webhook(a, 'SMS Inbound', 'POST', 'rfe/sms', [0, 40], { responseMode: 'responseNode' });
  respond(a, 'Respond TwiML', [220, 40], { body: '<Response></Response>', headers: [{ name: 'Content-Type', value: 'text/xml' }] });
  loadRuntime(a, 'Runtime (SMS)', [440, 40]);
  code(a, 'Parse SMS', mods('I'), `${RTV}
const { runtime, general } = $json;
const src = $('SMS Inbound').first().json;
const body = src.body || {};
const token = rtv(runtime, 'twilio_auth_token', 'RFE_TWILIO_AUTH_TOKEN');
const publicUrl = String((general && general.public_base_url) || '').replace(/\\/$/, '');
if (token && publicUrl) {
  if (!I.verifyTwilioSignature(publicUrl + '/webhook/rfe/sms', body, (src.headers || {})['x-twilio-signature'], token, require('crypto'))) {
    console.log('RFE: rejected SMS webhook with invalid Twilio signature');
    return [];
  }
}
const m = I.normalizeTwilioSms(body, (general && general.default_country_code) || '44');
return [{ json: { kind: 'message', b64: b64(m) } }];`, [660, 40], 'runOnceForAllItems');

  // --- Hosted form (email / SMS link)
  webhook(a, 'Web Form Submit', 'POST', 'rfe/f/submit', [0, 220], { responseMode: 'responseNode' });
  respond(a, 'Respond Thank You', [220, 220], { body: renderThanks(null), headers: HTML });
  code(a, 'Parse Web Form', mods('I'), `
const m = I.normalizeWebForm($json.body || {});
if (!m.request_token || (!m.rating && !m.text)) return [];
m.provider_message_id = 'web-' + m.request_token + '-' + Date.now();
return [{ json: { kind: 'message', b64: b64(m) } }];`, [440, 220], 'runOnceForAllItems');

  // --- Already-normalised messages (other channels, tests, simulator)
  webhook(a, 'Normalised Inbound', 'POST', 'rfe/inbound', [0, 400], { auth: 'headerAuth', cred: CRED.internal });
  code(a, 'Parse Normalised', [], `
const b = $json.body || {};
const list = Array.isArray(b.messages) ? b.messages : [b.message || b];
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
return list.filter((m) => m && m.channel).map((m) => ({ json: { kind: 'message', b64: b64(m) } }));`, [220, 400], 'runOnceForAllItems');

  // --- shared pipeline
  pg(a, 'Lookup Context', `=SELECT rfe_lookup_inbound(${PAYLOAD}) AS result`, [880, 40],
    { notes: 'Stores the raw message first (nothing is lost if later steps fail), dedupes webhook retries, finds the job/customer and repeat-customer history.' });
  code(a, 'Prepare', mods('STIP'), `
const lookup = $json.result;
if (!lookup || lookup.action !== 'process') return { json: { mode: 'skip', action: lookup && lookup.action } };
const prep = P.prepareInbound(lookup, deps);
if (prep.mode === 'intent') return { json: { mode: 'intent', b64: b64(prep.payload) } };
if (prep.mode !== 'score') return { json: { mode: 'skip' } };
const llmUrl = String(lookup.settings.llm.api_base || 'https://api.anthropic.com').replace(/\\/$/, '') + '/v1/messages';
return { json: { mode: 'score', use_llm: prep.use_llm, llm_request: prep.llm_request, llm_url: llmUrl, lookup, prep } };`, [1100, 40]);
  switchOn(a, 'Feedback or Command', '={{ $json.mode }}', ['score', 'intent'], [1320, 40]);
  ifTrue(a, 'AI Scoring On?', '={{ $json.use_llm }}', [1540, -60]);
  a.node('Claude: Score & Draft', 'n8n-nodes-base.httpRequest', 4.2, {
    method: 'POST', url: '={{ $json.llm_url }}',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'anthropic-version', value: '2023-06-01' },
      { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
    ] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.llm_request) }}',
    options: { timeout: 60000 },
  }, [1760, -160], { credentials: CRED.anthropic, onError: 'continueErrorOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    notes: 'Structured JSON output (sentiment, severity, issues, draft reply). If this fails the rules engine scores alone - feedback is never dropped.' });
  code(a, 'Score, Check History & Route', mods('STDRP'), `
const src = $('Prepare').item.json;
let resp = null;
if (src.use_llm) resp = $json.error ? { error: $json.error } : $json;
const payload = P.finalizeInbound(src.lookup, src.prep, resp, deps);
return { json: { b64: b64(payload), lane: payload.routing.lane, tier: payload.routing.tier } };`, [1980, -60]);
  pg(a, 'Save Feedback, Case & Alerts', `=SELECT rfe_save_feedback(${PAYLOAD}) AS result`, [2200, -60],
    { notes: 'One transaction: feedback + status label, case with SLA, draft reply (never auto-sent), Ready-to-Post entry, outbox messages.' });
  pg(a, 'Apply Opt-out / Consent', `=SELECT rfe_apply_intent(${PAYLOAD}) AS result`, [1540, 160]);
  kick(a, 'Wake Dispatcher', [2420, 40]);

  a.connect('WhatsApp Verify (GET)', 'Runtime (verify)');
  a.connect('Runtime (verify)', 'Check Verify Token');
  a.connect('Check Verify Token', 'Respond Verify');
  a.connect('WhatsApp Inbound', 'Capture Raw Body');
  a.connect('Capture Raw Body', 'Runtime (WhatsApp)');
  a.connect('Runtime (WhatsApp)', 'Parse WhatsApp');
  a.connect('Parse WhatsApp', 'Status or Message');
  a.connect('Status or Message', 'Record Delivery Status', 0);
  a.connect('Status or Message', 'Lookup Context', 1);
  a.connect('Record Delivery Status', 'Wake Dispatcher');
  a.connect('SMS Inbound', 'Respond TwiML');
  a.connect('Respond TwiML', 'Runtime (SMS)');
  a.connect('Runtime (SMS)', 'Parse SMS');
  a.connect('Parse SMS', 'Lookup Context');
  a.connect('Web Form Submit', 'Respond Thank You');
  a.connect('Respond Thank You', 'Parse Web Form');
  a.connect('Parse Web Form', 'Lookup Context');
  a.connect('Normalised Inbound', 'Parse Normalised');
  a.connect('Parse Normalised', 'Lookup Context');
  a.connect('Lookup Context', 'Prepare');
  a.connect('Prepare', 'Feedback or Command');
  a.connect('Feedback or Command', 'AI Scoring On?', 0);
  a.connect('Feedback or Command', 'Apply Opt-out / Consent', 1);
  a.connect('AI Scoring On?', 'Claude: Score & Draft', 0);
  a.connect('AI Scoring On?', 'Score, Check History & Route', 1);
  a.connect('Claude: Score & Draft', 'Score, Check History & Route', 0);
  a.connect('Claude: Score & Draft', 'Score, Check History & Route', 1);
  a.connect('Score, Check History & Route', 'Save Feedback, Case & Alerts');
  a.connect('Save Feedback, Case & Alerts', 'Wake Dispatcher');
  a.connect('Apply Opt-out / Consent', 'Wake Dispatcher');
});

// ---------------------------------------------------------------------------- 04
const PAGES = [['pages.js', 'PAGES']];
workflows['04-customer-feedback-form'] = wf('RFE 04 - Customer Feedback Form', (a) => {
  webhook(a, 'Feedback Link', 'GET', 'rfe/f', [0, 0], { responseMode: 'responseNode' });
  code(a, 'Read Link', [], `
const q = $json.query || {};
const p = { token: String(q.t || '').replace(/[^a-f0-9]/gi, '').slice(0, 64), optout: q.optout === '1' };
return { json: { r: ['great', 'ok', 'poor'].includes(q.r) ? q.r : null, b64: Buffer.from(JSON.stringify(p)).toString('base64') } };`, [220, 0]);
  pg(a, 'Form Context', `=SELECT rfe_form_context(${PAYLOAD}) AS result`, [440, 0]);
  code(a, 'Render Form', PAGES, `
const ctx = $json.result;
const base = String((ctx.settings.general || {}).public_base_url || '').replace(/\\/$/, '');
return { json: { html: PAGES.renderFeedbackForm(ctx, $('Read Link').item.json.r, base + '/webhook/rfe/f/submit') } };`, [660, 0]);
  respond(a, 'Respond Page', [880, 0], { body: '={{ $json.html }}', headers: HTML });
  a.connect('Feedback Link', 'Read Link');
  a.connect('Read Link', 'Form Context');
  a.connect('Form Context', 'Render Form');
  a.connect('Render Form', 'Respond Page');
});

// ---------------------------------------------------------------------------- 05
workflows['05-sla-monitor-reminders'] = wf('RFE 05 - SLA Monitor & Reminders', (a) => {
  a.node('Every 5 Minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, [0, 0]);
  pg(a, 'Find Due Work', 'SELECT rfe_settings() AS settings, rfe_due_escalations() AS escalations, rfe_due_reminders() AS reminders, rfe_expire_requests() AS expired', [220, 0]);
  code(a, 'Build Escalations & Reminders', mods('TRP'), `
const { settings, escalations, reminders } = $input.first().json;
const out = [];
for (const e of P.buildEscalations(escalations, settings, deps)) out.push({ json: { fn: 'rfe_record_escalation', b64: b64(e) } });
for (const r of reminders) out.push({ json: { fn: 'rfe_mark_reminded', b64: b64(P.buildReminderMessage(r, settings, deps)) } });
return out;`, [440, 0], 'runOnceForAllItems');
  pg(a, 'Apply', `=SELECT {{ $json.fn === 'rfe_mark_reminded' ? 'rfe_mark_reminded' : 'rfe_record_escalation' }}(${PAYLOAD}) AS result`, [660, 0]);
  kick(a, 'Wake Dispatcher', [880, 0]);
  a.connect('Every 5 Minutes', 'Find Due Work');
  a.connect('Find Due Work', 'Build Escalations & Reminders');
  a.connect('Build Escalations & Reminders', 'Apply');
  a.connect('Apply', 'Wake Dispatcher');
});

// ---------------------------------------------------------------------------- 06
const CASE_ACTIONS = ['acknowledge', 'contacted', 'send_draft', 'save_draft', 'discard_draft', 'handled_offline', 'resolve', 'reopen', 'note'];
workflows['06-case-page'] = wf('RFE 06 - Case Page', (a) => {
  webhook(a, 'Open Case', 'GET', 'rfe/case', [0, 0], { responseMode: 'responseNode' });
  code(a, 'Read Case Link', [], `
const q = $json.query || {};
const p = { op: 'case', token: String(q.t || '').replace(/[^a-f0-9]/gi, '').slice(0, 64) };
return { json: { contact_id: String(q.c || '').replace(/\\D/g, ''), done: String(q.done || ''), b64: Buffer.from(JSON.stringify(p)).toString('base64') } };`, [220, 0]);
  pg(a, 'Load Case', `=SELECT rfe_api(${PAYLOAD}) AS result, rfe_setting('general') AS general`, [440, 0]);
  code(a, 'Render Case', PAGES, `
const link = $('Read Case Link').item.json;
const base = String(($json.general || {}).public_base_url || '').replace(/\\/$/, '');
const FLASH = { acknowledge: 'Acknowledged - escalation stopped.', send_draft: 'Reply queued and sending to the customer.', save_draft: 'Draft saved.',
  discard_draft: 'Draft discarded.', handled_offline: 'Marked as handled by phone / in person.', resolve: 'Case resolved. Thank you!',
  reopen: 'Case reopened.', note: 'Note added.', error: 'That did not work - please try again.' };
return { json: { html: PAGES.renderCasePage($json.result, { contact_id: link.contact_id, action_url: base + '/webhook/rfe/case/action',
  timezone: ($json.general || {}).default_timezone, flash: FLASH[link.done] || '' }) } };`, [660, 0]);
  respond(a, 'Respond Case Page', [880, 0], { body: '={{ $json.html }}', headers: HTML });

  webhook(a, 'Case Action', 'POST', 'rfe/case/action', [0, 220], { responseMode: 'responseNode' });
  code(a, 'Read Action', [], `
const b = $json.body || {};
const ACTIONS = ${JSON.stringify(CASE_ACTIONS)};
const token = String(b.t || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
const action = ACTIONS.includes(b.action) ? b.action : 'invalid';
const p = { op: 'case_action', token, action, contact_id: String(b.c || '').replace(/\\D/g, '') || null,
  draft_text: b.draft_text, notes: b.notes, root_cause: b.root_cause, followup_text: b.followup_text };
return { json: { token, action, contact_id: p.contact_id, b64: Buffer.from(JSON.stringify(p)).toString('base64') } };`, [220, 220]);
  pg(a, 'Apply Case Action', `=SELECT rfe_api(${PAYLOAD}) AS result, rfe_setting('general')->>'public_base_url' AS base`, [440, 220]);
  code(a, 'Redirect Back', [], `
const r = $('Read Action').item.json;
const base = String($json.base || '').replace(/\\/$/, '');
const done = $json.result && $json.result.ok ? r.action : 'error';
return { json: { location: base + '/webhook/rfe/case?t=' + r.token + (r.contact_id ? '&c=' + r.contact_id : '') + '&done=' + done } };`, [660, 220]);
  kick(a, 'Wake Dispatcher', [880, 220]);
  respond(a, 'Respond Redirect', [1100, 220], { withType: 'noData', code: 303,
    headers: [{ name: 'Location', value: "={{ $('Redirect Back').item.json.location }}" }] });
  a.connect('Open Case', 'Read Case Link');
  a.connect('Read Case Link', 'Load Case');
  a.connect('Load Case', 'Render Case');
  a.connect('Render Case', 'Respond Case Page');
  a.connect('Case Action', 'Read Action');
  a.connect('Read Action', 'Apply Case Action');
  a.connect('Apply Case Action', 'Redirect Back');
  a.connect('Redirect Back', 'Wake Dispatcher');
  a.connect('Wake Dispatcher', 'Respond Redirect');
});

// ---------------------------------------------------------------------------- 07
const DASHBOARD_HTML = fs.readFileSync(path.join(ROOT, 'dashboard', 'index.html'), 'utf8');
if (DASHBOARD_HTML.startsWith('=')) throw new Error('dashboard html must not start with "="');
workflows['07-management-dashboard'] = wf('RFE 07 - Management Dashboard', (a) => {
  // Page: Basic-auth login, then a signed 12h session token is embedded for the API calls
  // (n8n sandboxes webhook HTML, so the browser won't reuse the Basic-auth login for fetch()).
  webhook(a, 'Dashboard Page', 'GET', 'rfe/dashboard', [0, 0], { auth: 'basicAuth', cred: CRED.dashboard, responseMode: 'responseNode' });
  loadRuntime(a, 'Runtime (page)', [220, 0]);
  code(a, 'Issue Session', [['session.js', 'SESSION']], `${RTV}
const token = SESSION.issueToken(rtv($json.runtime, 'dashboard_secret', 'RFE_DASHBOARD_SECRET'), 12 * 3600, Date.now(), require('crypto'));
const html = ${JSON.stringify(DASHBOARD_HTML)};
return { json: { html: html.replace('__RFE_SESSION__', token) } };`, [440, 0]);
  respond(a, 'Serve Dashboard', [660, 0], { body: '={{ $json.html }}', headers: HTML });

  webhook(a, 'Dashboard API', 'POST', 'rfe/dashboard/api', [0, 220], { responseMode: 'responseNode' });
  loadRuntime(a, 'Runtime (API)', [220, 220]);
  code(a, 'Validate Request', [['session.js', 'SESSION']], `${RTV}
const src = $('Dashboard API').first().json;
const headers = src.headers || {};
if (!SESSION.verifyToken(headers['x-rfe-session'], rtv($json.runtime, 'dashboard_secret', 'RFE_DASHBOARD_SECRET'), Date.now(), require('crypto'))) {
  return { json: { authorised: false } };
}
const b = src.body || {};
const OPS = ['data', 'case', 'case_action', 'rtp_action', 'unmatched', 'unmatched_handled'];
const ACTIONS = ${JSON.stringify(CASE_ACTIONS)};
const RTP = ['save', 'posted', 'not_posted', 'reopen'];
const p = { ...b };
if (!OPS.includes(p.op)) p.op = 'invalid';
if (p.op === 'case_action' && !ACTIONS.includes(p.action)) p.op = 'invalid';
if (p.op === 'rtp_action' && !RTP.includes(p.action)) p.op = 'invalid';
if (typeof p.actor === 'string') p.actor = p.actor.slice(0, 80);
return { json: { authorised: true, op: p.op, sends: p.op === 'case_action' && ['send_draft', 'resolve'].includes(p.action), b64: Buffer.from(JSON.stringify(p)).toString('base64') } };`, [440, 220]);
  ifTrue(a, 'Session Valid?', '={{ $json.authorised }}', [660, 220]);
  pg(a, 'Run Query', `=SELECT rfe_api(${PAYLOAD}) AS result`, [880, 160]);
  respond(a, 'Respond JSON', [1100, 160], { withType: 'json', body: '={{ JSON.stringify({ result: $json.result }) }}',
    headers: [{ name: 'Cache-Control', value: 'no-store' }] });
  respond(a, 'Respond Unauthorised', [880, 320], { withType: 'json', code: 401, body: '{"error":"session expired - reload the dashboard"}' });
  ifTrue(a, 'Message Queued?', "={{ $('Validate Request').item.json.sends }}", [1320, 160]);
  kick(a, 'Wake Dispatcher', [1540, 120]);
  a.connect('Dashboard Page', 'Runtime (page)');
  a.connect('Runtime (page)', 'Issue Session');
  a.connect('Issue Session', 'Serve Dashboard');
  a.connect('Dashboard API', 'Runtime (API)');
  a.connect('Runtime (API)', 'Validate Request');
  a.connect('Validate Request', 'Session Valid?');
  a.connect('Session Valid?', 'Run Query', 0);
  a.connect('Session Valid?', 'Respond Unauthorised', 1);
  a.connect('Run Query', 'Respond JSON');
  a.connect('Respond JSON', 'Message Queued?');
  a.connect('Message Queued?', 'Wake Dispatcher', 0);
});

// ---------------------------------------------------------------------------- 08
workflows['08-daily-digest'] = wf('RFE 08 - Daily Digest', (a) => {
  a.node('Every Morning 07:45', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '45 7 * * *' }] } }, [0, 0]);
  pg(a, 'Digest Data', 'SELECT rfe_digest_data() AS data', [220, 0]);
  code(a, 'Build Digest Emails', mods('TP'), `
return P.buildDigests($input.first().json.data, deps).map((m) => ({ json: { b64: b64(m) } }));`, [440, 0], 'runOnceForAllItems');
  pg(a, 'Queue Emails', `=SELECT rfe_enqueue(${PAYLOAD}) AS outbox_id`, [660, 0]);
  kick(a, 'Wake Dispatcher', [880, 0]);
  a.connect('Every Morning 07:45', 'Digest Data');
  a.connect('Digest Data', 'Build Digest Emails');
  a.connect('Build Digest Emails', 'Queue Emails');
  a.connect('Queue Emails', 'Wake Dispatcher');
});

// =============================================================================
const outputs = { [path.join(ROOT, 'database', '003_settings.sql')]: settingsSql(ROOT) };
for (const [file, w] of Object.entries(workflows)) {
  outputs[path.join(ROOT, 'workflows', file + '.json')] = JSON.stringify(w, null, 2) + '\n';
}

let stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  if (CHECK) stale.push(path.relative(ROOT, file));
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); console.log('wrote', path.relative(ROOT, file)); }
}
if (CHECK && stale.length) {
  console.error('Out of date (run `npm run build`):\n  ' + stale.join('\n  '));
  process.exit(1);
}
if (!CHECK) console.log(`${Object.keys(workflows).length} workflows up to date.`);
module.exports = { workflows };
