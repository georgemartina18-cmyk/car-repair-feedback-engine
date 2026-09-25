/**
 * API tests. Run with `npm test` (in backend/ or the project root).
 * They use a throwaway in-memory database, so your real data is never touched.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.TIMEZONE = 'Africa/Lagos';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { ensureDefaultAdmin } = require('../src/auth');
const { seedSampleData } = require('../src/seed');
const { createApp } = require('../src/app');
const { nextBookingRef } = require('../src/bookings');
const { addDays, dateStrInTz, startOfWeek } = require('../src/utils/time');

let server;
let base;
let token;

// A valid booking for a few days from now.
const futureDate = addDays(dateStrInTz(new Date(), 'Africa/Lagos'), 3);
const validBooking = {
  customer_name: 'Test Customer',
  customer_email: 'Test@Example.com',
  customer_phone: '+234 803 000 1111',
  service_type: 'Oil Change',
  other_details: '',
  branch: 'Ikeja Branch',
  amount_paid: '25000',
  scheduled_date: futureDate,
  scheduled_time: '10:30',
};

async function call(method, path, body, auth = token) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  await db.initDb(null);
  ensureDefaultAdmin();
  seedSampleData({ count: 30 });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

test('options lists the 13 services and 4 branches', async () => {
  const { status, body } = await call('GET', '/options', null, null);
  assert.equal(status, 200);
  assert.equal(body.services.length, 13);
  assert.deepEqual(body.branches, ['Ikeja Branch', 'Lekki Branch', 'Ikorodu Branch', 'Oshodi Branch']);
});

test('a valid booking is saved and gets a reference number', async () => {
  const { status, body } = await call('POST', '/bookings', validBooking, null);
  assert.equal(status, 201);
  assert.match(body.booking_ref, /^AUTO-\d{6}-\d{4}$/);
  const saved = db.get('SELECT * FROM bookings WHERE booking_ref = ?', [body.booking_ref]);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.customer_email, 'test@example.com');
  assert.equal(saved.amount_paid, 25000);
  assert.equal(saved.scheduled_date, `${futureDate} 10:30`);
  assert.equal(saved.other_details, null);
});

test('reference numbers count up within a day', () => {
  const now = new Date();
  const first = nextBookingRef(now);
  db.run(
    "INSERT INTO bookings (booking_ref, customer_name, customer_email, customer_phone, service_type, branch, amount_paid, scheduled_date, created_at) VALUES (?, 'x', 'x@x.x', '0800', 'Oil Change', 'Ikeja Branch', 0, '2030-01-01 10:00', ?)",
    [first, now.toISOString()]
  );
  const second = nextBookingRef(now);
  assert.equal(Number(second.slice(-4)), Number(first.slice(-4)) + 1);
  assert.equal(second.slice(0, 12), first.slice(0, 12));
});

test('invalid bookings are rejected with a message per field', async () => {
  const { status, body } = await call(
    'POST',
    '/bookings',
    { ...validBooking, customer_email: 'nope', branch: 'Mars Branch', amount_paid: '-5', scheduled_date: '2020-01-01', scheduled_time: '23:00' },
    null
  );
  assert.equal(status, 400);
  for (const f of ['customer_email', 'branch', 'amount_paid', 'scheduled_date', 'scheduled_time']) {
    assert.ok(body.fields[f], `expected an error for ${f}`);
  }
});

test('"Other" service requires notes', async () => {
  const { status, body } = await call('POST', '/bookings', { ...validBooking, service_type: 'Other (Specify in notes)' }, null);
  assert.equal(status, 400);
  assert.ok(body.fields.other_details);
});

test('admin routes need a login', async () => {
  const { status } = await call('GET', '/admin/bookings', null, null);
  assert.equal(status, 401);
  const bad = await call('GET', '/admin/bookings', null, 'not-a-token');
  assert.equal(bad.status, 401);
});

test('wrong password is refused, right password returns a token', async () => {
  const wrong = await call('POST', '/auth/login', { email: 'admin@test.local', password: 'nope' }, null);
  assert.equal(wrong.status, 401);
  const ok = await call('POST', '/auth/login', { email: 'ADMIN@test.local', password: 'Admin@12345' }, null);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  token = ok.body.token;
});

test('bookings list: filters and search', async () => {
  const all = await call('GET', '/admin/bookings');
  assert.equal(all.status, 200);
  assert.ok(all.body.bookings.length >= 31);

  const lekki = await call('GET', '/admin/bookings?branch=Lekki%20Branch&status=completed');
  assert.ok(lekki.body.bookings.every((b) => b.branch === 'Lekki Branch' && b.status === 'completed'));

  const byName = await call('GET', '/admin/bookings?q=test%20cust');
  assert.equal(byName.body.bookings.length, 1);

  const byPhone = await call('GET', '/admin/bookings?q=803-000%201111'); // spaces and dashes ignored
  assert.equal(byPhone.body.bookings[0].customer_name, 'Test Customer');

  const byRef = await call('GET', `/admin/bookings?q=${byName.body.bookings[0].booking_ref}`);
  assert.equal(byRef.body.bookings.length, 1);

  const range = await call('GET', `/admin/bookings?from=${futureDate}&to=${futureDate}`);
  assert.ok(range.body.bookings.length >= 1);
  assert.ok(range.body.bookings.every((b) => b.scheduled_date.startsWith(futureDate)));
});

test('mark as completed saves the time and cannot be undone', async () => {
  const id = db.get("SELECT id FROM bookings WHERE customer_name = 'Test Customer'").id;
  const started = await call('PATCH', `/admin/bookings/${id}/status`, { status: 'in_progress' });
  assert.equal(started.body.booking.status, 'in_progress');

  const done = await call('PATCH', `/admin/bookings/${id}/status`, { status: 'completed' });
  assert.equal(done.status, 200);
  assert.equal(done.body.booking.status, 'completed');
  assert.ok(Date.parse(done.body.booking.completed_at));

  const again = await call('PATCH', `/admin/bookings/${id}/status`, { status: 'pending' });
  assert.equal(again.status, 409);

  const bogus = await call('PATCH', `/admin/bookings/${id}/status`, { status: 'exploded' });
  assert.equal(bogus.status, 400);
});

test('summary totals add up', async () => {
  const { status, body } = await call('GET', '/admin/summary');
  assert.equal(status, 200);
  assert.equal(body.branches.length, 4);
  const count = db.get('SELECT COUNT(*) AS n, SUM(amount_paid) AS rev FROM bookings');
  assert.equal(body.totals.total, count.n);
  assert.equal(body.totals.revenue, count.rev);
  assert.equal(body.totals.pending + body.totals.in_progress + body.totals.completed, count.n);
  assert.ok(body.totals.booked_today >= 1); // the booking made above
  assert.equal(body.weekStart, startOfWeek(body.today));
});

test('system info is available', async () => {
  const { status, body } = await call('GET', '/admin/system-info');
  assert.equal(status, 200);
  assert.equal(body.admin.email, 'admin@test.local');
  assert.ok(body.database.bookings > 0);
});

test('change password: checks the old one, then old tokens stop working', async () => {
  const wrong = await call('POST', '/auth/change-password', { currentPassword: 'nope', newPassword: 'NewPass123' });
  assert.equal(wrong.status, 400);
  const weak = await call('POST', '/auth/change-password', { currentPassword: 'Admin@12345', newPassword: 'short' });
  assert.equal(weak.status, 400);

  // Tokens only record whole seconds, so wait until the next second first.
  await new Promise((r) => setTimeout(r, 1100));
  const ok = await call('POST', '/auth/change-password', { currentPassword: 'Admin@12345', newPassword: 'NewPass123' });
  assert.equal(ok.status, 200);

  const oldToken = await call('GET', '/auth/me');
  assert.equal(oldToken.status, 401);

  await new Promise((r) => setTimeout(r, 1100));
  const login = await call('POST', '/auth/login', { email: 'admin@test.local', password: 'NewPass123' }, null);
  assert.equal(login.status, 200);
  const me = await call('GET', '/auth/me', null, login.body.token);
  assert.equal(me.status, 200);
});
