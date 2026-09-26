/**
 * n8n webhook tests. A small local HTTP server stands in for n8n.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const db = require('../src/db');
const { ensureDefaultAdmin, login } = require('../src/auth');
const { seedSampleData } = require('../src/seed');
const { createApp } = require('../src/app');
const webhook = require('../src/webhook');

let app;
let base;
let token;
let fakeN8n;
let n8nUrl;
let received = [];
let n8nStatus = 200; // what the fake n8n answers

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function waitFor(check, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting');
}

before(async () => {
  await db.initDb(null);
  ensureDefaultAdmin();
  seedSampleData({ count: 20 });
  webhook.setRetryDelays([50, 50]);
  token = login('admin@test.local', 'Admin@12345').token;

  fakeN8n = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body: JSON.parse(data) });
      res.writeHead(n8nStatus, { 'Content-Type': 'application/json' });
      res.end('{"message":"Workflow was started"}');
    });
  });
  await new Promise((r) => fakeN8n.listen(0, r));
  n8nUrl = `http://127.0.0.1:${fakeN8n.address().port}/webhook/job-completed`;

  app = createApp().listen(0);
  await new Promise((r) => app.once('listening', r));
  base = `http://127.0.0.1:${app.address().port}/api`;
});

after(() => {
  app.close();
  fakeN8n.close();
});

test('nothing is sent while the integration is off', async () => {
  const id = db.get("SELECT id FROM bookings WHERE status != 'completed' LIMIT 1").id;
  await call('PATCH', `/admin/bookings/${id}/status`, { status: 'completed' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(received.length, 0);
});

test('settings are checked and the secret is never sent back', async () => {
  const bad = await call('PUT', '/admin/integrations/n8n', { enabled: true, url: 'not a url' });
  assert.equal(bad.status, 400);
  const noUrl = await call('PUT', '/admin/integrations/n8n', { enabled: true, url: '' });
  assert.equal(noUrl.status, 400);

  const ok = await call('PUT', '/admin/integrations/n8n', {
    enabled: true, url: n8nUrl, headerName: 'X-RFE-Key', headerValue: 'super-secret',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.config.headerValueSet, true);
  assert.ok(!JSON.stringify(ok.body).includes('super-secret'));

  const got = await call('GET', '/admin/integrations/n8n');
  assert.ok(!JSON.stringify(got.body).includes('super-secret'));
  assert.equal(got.body.config.url, n8nUrl);
});

test('marking a job completed posts it to n8n with the header', async () => {
  received = [];
  const booking = db.get("SELECT * FROM bookings WHERE status != 'completed' LIMIT 1");
  const res = await call('PATCH', `/admin/bookings/${booking.id}/status`, { status: 'completed' });
  assert.equal(res.status, 200);

  await waitFor(() => received.length === 1);
  const { headers, body } = received[0];
  assert.equal(headers['x-rfe-key'], 'super-secret');
  assert.equal(body.event, 'job.completed');
  assert.equal(body.test, false);
  assert.equal(body.job_id, booking.booking_ref);
  assert.equal(body.status, 'completed');
  assert.equal(body.branch_name, booking.branch);
  assert.match(body.branch_id, /^[A-Z]{3}$/);
  assert.equal(body.customer.phone, booking.customer_phone);
  assert.equal(body.customer.email, booking.customer_email);
  assert.ok(Date.parse(body.completed_at));

  await waitFor(() => webhook.recentDeliveries()[0].status === 'success');
});

test('"Send test" posts a test event and reports the result', async () => {
  received = [];
  const res = await call('POST', '/admin/integrations/n8n/test');
  assert.equal(res.status, 200);
  assert.equal(res.body.delivery.status, 'success');
  assert.equal(received[0].body.test, true);
});

test('server errors are retried, then marked failed and can be resent', async () => {
  received = [];
  n8nStatus = 500;
  const booking = db.get("SELECT * FROM bookings WHERE status != 'completed' LIMIT 1");
  await call('PATCH', `/admin/bookings/${booking.id}/status`, { status: 'completed' });
  await waitFor(() => webhook.recentDeliveries()[0].status === 'failed');
  assert.equal(received.length, 3); // first try + 2 retries
  assert.equal(webhook.recentDeliveries()[0].attempts, 3);

  n8nStatus = 200;
  const failedId = webhook.recentDeliveries()[0].id;
  const again = await call('POST', `/admin/integrations/n8n/deliveries/${failedId}/resend`);
  assert.equal(again.body.delivery.status, 'success');
  assert.equal(received.at(-1).body.job_id, booking.booking_ref);
});

test('a 404 (inactive workflow) is not retried and explains why', async () => {
  received = [];
  n8nStatus = 404;
  const res = await call('POST', '/admin/integrations/n8n/test');
  assert.equal(res.body.delivery.status, 'failed');
  assert.match(res.body.delivery.error, /not active/);
  assert.equal(received.length, 1);
  n8nStatus = 200;
});
