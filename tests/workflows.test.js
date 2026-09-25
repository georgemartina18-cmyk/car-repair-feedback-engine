/**
 * Structural checks on the generated n8n workflows + execution of the generated
 * Code nodes in an n8n-like context ($json, $input, $('Node'), $env, this.helpers).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { deps, settings, ROOT } = require('./helpers');

const DIR = path.join(ROOT, 'workflows');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

test('generated files are up to date with src/', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-workflows.js'), '--check'], { stdio: 'pipe' });
});

for (const f of files) {
  test(`${f}: valid n8n structure`, () => {
    const w = load(f);
    assert.ok(w.name.startsWith('RFE '));
    const names = new Set();
    for (const n of w.nodes) {
      assert.ok(!names.has(n.name), 'duplicate node ' + n.name);
      names.add(n.name);
      assert.match(n.id, /^[0-9a-f-]{36}$/);
      assert.ok(n.type.startsWith('n8n-nodes-base.'));
      assert.equal(n.position.length, 2);
      if (n.type === 'n8n-nodes-base.postgres') assert.ok(n.credentials && n.credentials.postgres, n.name);
      if (n.type === 'n8n-nodes-base.code') assert.doesNotThrow(() => new AsyncFunction(n.parameters.jsCode), n.name);
      if (n.type === 'n8n-nodes-base.webhook') {
        assert.ok(n.webhookId);
        assert.ok(n.parameters.path.startsWith('rfe/'));
        if (n.parameters.authentication !== 'none') assert.ok(n.credentials, n.name + ' needs credentials');
      }
      // SQL payloads must go through base64 - never string-interpolated JSON
      if (n.type === 'n8n-nodes-base.postgres') assert.ok(!/\{\{\s*JSON/.test(n.parameters.query), n.name);
    }
    for (const [from, c] of Object.entries(w.connections)) {
      assert.ok(names.has(from), 'connection from unknown ' + from);
      for (const out of c.main) for (const e of out) assert.ok(names.has(e.node), `${from} -> unknown ${e.node}`);
    }
    // every non-trigger node is reachable
    const targets = new Set(Object.values(w.connections).flatMap((c) => c.main.flat().map((e) => e.node)));
    for (const n of w.nodes) {
      const trigger = /webhook|Trigger$|errorTrigger/.test(n.type);
      if (!trigger) assert.ok(targets.has(n.name), `${n.name} is not connected`);
    }
  });
}

test('webhook paths are unique per method across all workflows', () => {
  const seen = new Set();
  for (const f of files) for (const n of load(f).nodes.filter((x) => x.type === 'n8n-nodes-base.webhook')) {
    const k = n.parameters.httpMethod + ' ' + n.parameters.path;
    assert.ok(!seen.has(k), 'duplicate webhook ' + k);
    seen.add(k);
  }
});

// ---------------------------------------------------------------- n8n-like runner
function runCode(workflowFile, nodeName, ctx) {
  const w = load(workflowFile);
  const node = w.nodes.find((n) => n.name === nodeName);
  assert.ok(node, nodeName);
  const items = ctx.items || [{ json: ctx.json || {} }];
  const refs = ctx.refs || {};
  const $ = (name) => {
    const r = refs[name];
    if (!r) throw new Error('no ref for ' + name);
    return { item: { json: r }, first: () => ({ json: r }), all: () => [{ json: r }] };
  };
  const env = ctx.env || {};
  const helpers = { getBinaryDataBuffer: async () => Buffer.from(ctx.raw || '') };
  const fn = new AsyncFunction('$json', '$input', '$', '$env', '$vars', 'require', 'Buffer', 'console', node.parameters.jsCode);
  const run = (json, all) => fn.call({ helpers }, json, { first: () => all[0], all: () => all }, $, env, ctx.vars || {}, require, Buffer, { log() {} });
  if (node.parameters.mode === 'runOnceForEachItem') return Promise.all(items.map((it) => run(it.json, items)));
  return run(items[0] && items[0].json, items);
}

const settingsWithUrl = JSON.parse(JSON.stringify(settings));

test('WF01 Validate Job + Build Request Message', async () => {
  const [v] = await runCode('01-job-completed-intake.json', 'Validate Job', {
    json: { settings }, refs: { 'Job Completed': { body: { job_id: 'RO1', branch_id: 'LDS-N', customer: { name: 'Sarah', phone: '07700900123' } } } } });
  assert.equal(v.json.valid, true);
  const job = JSON.parse(Buffer.from(v.json.b64, 'base64').toString());
  assert.equal(job.customer_phone, '+447700900123');
  const [bad] = await runCode('01-job-completed-intake.json', 'Validate Job', { json: { settings }, refs: { 'Job Completed': { body: {} } } });
  assert.equal(bad.json.valid, false);
  const reg = { status: 'accepted', request_id: '11111111-1111-4111-8111-111111111111', token: 'abc', branch: { name: 'Leeds North', timezone: 'Europe/London' },
    customer: { name: 'Sarah Jones', phone: '+447700900123', email: null }, job: { service_type: 'MOT', vehicle_reg: 'AB12 CDE' }, settings: settingsWithUrl };
  const [m] = await runCode('01-job-completed-intake.json', 'Build Request Message', { json: { result: reg } });
  const msg = JSON.parse(Buffer.from(m.json.b64, 'base64').toString());
  assert.equal(msg.kind, 'feedback_request');
  assert.deepEqual(msg.wa_template.params, ['Sarah', 'Leeds North', 'MOT', 'AB12 CDE']);
  assert.match(msg.text, /webhook\/rfe\/f\?t=abc/);
});

test('WF02 Build Send + Collect Result (success, error, none)', async () => {
  const row = { id: 7, channels: ['whatsapp', 'sms'], tried_channels: [], to_phone: '+447700900123', text: 'hi', wa_template: null };
  // phone number id from the database runtime row (n8n Cloud); sender from env (self-hosted) - env wins
  const [s] = await runCode('02-outbox-dispatcher.json', 'Build Send', { json: row,
    refs: { 'Load Settings': { settings, runtime: { wa_phone_number_id: '123', email_from: 'db@example.com' } } }, env: { RFE_EMAIL_FROM: 'env@example.com' } });
  assert.equal(s.json.email_from, 'env@example.com');
  assert.equal(s.json.channel, 'whatsapp');
  assert.equal(s.json.wa_url, 'https://graph.facebook.com/v22.0/123/messages');
  const [ok] = await runCode('02-outbox-dispatcher.json', 'Collect Result', { json: { messages: [{ id: 'wamid.X' }] }, refs: { 'Build Send': s.json } });
  assert.deepEqual([ok.json.ok, ok.json.provider_message_id], [true, 'wamid.X']);
  const [err] = await runCode('02-outbox-dispatcher.json', 'Collect Result', { json: { error: { message: '400 - {"error":{"code":131026}}', httpCode: '400' } }, refs: { 'Build Send': s.json } });
  assert.deepEqual([err.json.ok, err.json.permanent], [false, true]);
});

test('WF03 Parse WhatsApp verifies signatures', async () => {
  const body = { entry: [{ changes: [{ value: { messages: [{ from: '447700900123', id: 'w1', timestamp: '1760000000', type: 'text', text: { body: 'Great' } }],
    statuses: [{ id: 'o1', status: 'read', timestamp: '1760000000' }] } }] }] };
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(raw).digest('hex');
  const [cap] = await runCode('03-inbound-feedback-processor.json', 'Capture Raw Body', { json: { body, headers: { 'x-hub-signature-256': sig } }, raw });
  assert.equal(cap.json.raw, raw);
  const runtimeRow = { runtime: { wa_app_secret: 's3cret' }, general: settings.general }; // n8n Cloud: secret from the database
  const good = await runCode('03-inbound-feedback-processor.json', 'Parse WhatsApp', { json: runtimeRow, refs: { 'Capture Raw Body': cap.json } });
  assert.deepEqual(good.map((i) => i.json.kind), ['status', 'message']);
  const bad = await runCode('03-inbound-feedback-processor.json', 'Parse WhatsApp', { json: runtimeRow, refs: { 'Capture Raw Body': { ...cap.json, signature: 'sha256=00' } } });
  assert.equal(bad.length, 0);
});

test('WF03 Prepare -> Score, Check History & Route (no AI, and AI failure)', async () => {
  const lookup = { action: 'process', message_id: 1, request_id: '11111111-1111-4111-8111-111111111111', channel: 'whatsapp',
    new_text: 'You ruined my car and wasted my whole day', rating: null, previous_text: null, previous_rating: null,
    customer: { name: 'Sarah Jones', phone: '+447700900123', channel: 'whatsapp' }, job: { id: 'RO1', service_type: 'Service' },
    branch: { id: 1, name: 'Leeds North', google_review_url: null }, feedback: null, consent_pending: false, case_token: null,
    contacts: [{ id: 1, name: 'Tom Walker', role: 'branch_lead', email: 't@example.com' }, { id: 2, name: 'Rachel', role: 'regional_manager', email: 'r@example.com' },
      { id: 3, name: 'HQ', role: 'hq', email: 'hq@example.com' }],
    history: { previous_negative_count: 0, previous_negatives: [] }, settings };
  const [prep] = await runCode('03-inbound-feedback-processor.json', 'Prepare', { json: { result: lookup } });
  assert.equal(prep.json.mode, 'score');
  assert.equal(prep.json.use_llm, true);
  assert.equal(prep.json.llm_request.model, 'claude-opus-5');
  // Claude call failed (error output) -> rules only, still escalated
  const [fin] = await runCode('03-inbound-feedback-processor.json', 'Score, Check History & Route', {
    json: { error: { message: 'overloaded' } }, refs: { Prepare: prep.json } });
  const payload = JSON.parse(Buffer.from(fin.json.b64, 'base64').toString());
  assert.equal(fin.json.lane, 'escalated');
  assert.equal(payload.scored.method, 'rules');
  assert.deepEqual(payload.routing.staff_messages.map((m) => m.role), ['branch_lead', 'regional_manager', 'hq']);
  assert.ok(payload.routing.draft.text.includes('Sarah'));
  assert.equal(payload.routing.customer_message, null, 'negative feedback is never auto-replied');
});

test('WF04 + WF06 pages render', async () => {
  const [f] = await runCode('04-customer-feedback-form.json', 'Render Form', {
    json: { result: { found: true, token: 'abc', customer_name: 'sarah', branch_name: 'Leeds North', service_type: 'MOT', settings } }, refs: { 'Read Link': { r: 'poor' } } });
  assert.match(f.json.html, /Hi Sarah, how did we do\?/);
  assert.match(f.json.html, /id="r-poor" value="poor" checked/);
  const view = { token: 'tok', case: { status: 'open', ack_due_at: new Date(Date.now() - 1000).toISOString() },
    feedback: { status: 'escalated', tier: 'P1_CRITICAL', customer_text: 'You ruined <my> car', score_100: 8, severity_index: 95, reasons: ['x'], channel: 'whatsapp', created_at: new Date().toISOString() },
    customer: { name: 'Sarah' }, job: {}, branch: { name: 'Leeds North' }, draft: { status: 'draft', source: 'ai', draft_text: 'Hi Sarah' }, events: [], history: [] };
  const [c] = await runCode('06-case-page.json', 'Render Case', { json: { result: view, general: settings.general }, refs: { 'Read Case Link': { contact_id: '1', done: 'acknowledge' } } });
  assert.match(c.json.html, /Acknowledgement overdue/);
  assert.match(c.json.html, /You ruined &lt;my&gt; car/, 'customer text is escaped');
  assert.match(c.json.html, /value="send_draft"/);
  assert.match(c.json.html, /Acknowledged - escalation stopped/);
});

test('WF07 dashboard: page embeds a signed session; API requires it and rejects unknown operations', async () => {
  const env = {};
  const runtime = { dashboard_secret: 'a-very-long-test-secret-123' };
  const [page] = await runCode('07-management-dashboard.json', 'Issue Session', { json: { runtime }, env });
  const token = page.json.html.match(/const SESSION = '([^']+)'/)[1];
  assert.notEqual(token, '__RFE_SESSION__');
  const headers = { 'x-rfe-session': token };
  const api = (hdrs, body) => runCode('07-management-dashboard.json', 'Validate Request', { json: { runtime }, refs: { 'Dashboard API': { headers: hdrs, body } }, env });
  const [ok] = await api(headers, { op: 'case_action', action: 'send_draft', token: 't' });
  assert.equal(ok.json.authorised, true);
  assert.equal(ok.json.sends, true);
  const [bad] = await api(headers, { op: 'drop_tables' });
  assert.equal(bad.json.op, 'invalid');
  const [anon] = await api({}, { op: 'data' });
  assert.equal(anon.json.authorised, false);
  const [forged] = await api({ 'x-rfe-session': token.slice(0, -2) + 'xx' }, { op: 'data' });
  assert.equal(forged.json.authorised, false);
});

test('session tokens expire', () => {
  const SESSION = require('../src/session.js');
  const t = SESSION.issueToken('a-very-long-test-secret-123', 60, 1_000_000_000_000, crypto);
  assert.equal(SESSION.verifyToken(t, 'a-very-long-test-secret-123', 1_000_000_030_000, crypto), true);
  assert.equal(SESSION.verifyToken(t, 'a-very-long-test-secret-123', 1_000_000_061_000, crypto), false);
  assert.equal(SESSION.verifyToken(t, 'another-secret-xxxxxxxxxxx', 1_000_000_030_000, crypto), false);
  assert.throws(() => SESSION.issueToken('short', 60, 0, crypto));
});
