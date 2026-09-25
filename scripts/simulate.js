#!/usr/bin/env node
/**
 * UAT simulator: pushes realistic job completions and customer replies into a
 * running deployment so you can watch routing, alerts and the dashboard work
 * end to end - without real customers.
 *
 *   RFE_URL=https://n8n.example.com RFE_INTAKE_KEY=... RFE_INTERNAL_KEY=... \
 *     node scripts/simulate.js [--branch LDS-N] [--phone +447700900123]
 *
 * Use your OWN phone number (or a test number) - real WhatsApp/SMS messages
 * will be sent to it if the dispatcher is active. Replies are injected through
 * the normalised inbound webhook, so you do not have to type them.
 */
const BASE = (process.env.RFE_URL || 'http://localhost:5678').replace(/\/$/, '');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const BRANCH = arg('--branch', 'LDS-N');
const PHONE = arg('--phone', '+447700900123');

const SCENARIOS = [
  { name: 'Delighted customer', reply: 'Brilliant service from Dave, car runs like new and it was ready early. Would recommend!', expect: 'ready_to_post' },
  { name: 'Mild delay', reply: 'It was fine, a bit slow', expect: 'in_queue' },
  { name: 'Severe - vehicle damaged', reply: 'You ruined my car and wasted my whole day. There is a big scratch down the door.', expect: 'escalated' },
  { name: 'Safety', reply: 'Brakes are grinding since you changed the pads, I nearly had an accident', expect: 'escalated' },
  // Repeat customer: needs a 2nd JOB for the same number, which the survey cool-down
  // (collection.survey_cooldown_days) normally suppresses. For UAT set it to 0, then run
  // with --repeat to send a second mild complaint from scenario 2's number.
  { name: 'Repeat customer (2nd negative, mild wording)', reply: 'Bit late again', expect: 'escalated', reusePhoneOf: 2, onlyWith: '--repeat' },
];

async function post(path, body, header) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...header }, body: JSON.stringify(body) });
  const t = await r.text();
  return { status: r.status, body: t };
}

(async () => {
  const intake = { 'X-RFE-Key': process.env.RFE_INTAKE_KEY || '' };
  const internal = { 'X-RFE-Internal': process.env.RFE_INTERNAL_KEY || '' };
  const run = Date.now().toString(36);
  let i = 0;
  for (const s of SCENARIOS) {
    i++;
    if (s.onlyWith && !process.argv.includes(s.onlyWith)) continue;
    // Each scenario uses a distinct phone suffix so the cool-down does not suppress it.
    const phone = PHONE.replace(/\d$/, String(s.reusePhoneOf || i));
    const job = { job_id: `SIM-${run}-${i}`, branch_id: BRANCH, status: 'completed', service_type: 'Full service',
      customer: { name: 'Test Customer ' + i, phone }, vehicle: { registration: 'SIM ' + i, make: 'Ford', model: 'Focus' } };
    const r1 = await post('/webhook/rfe/job-completed', job, intake);
    console.log(`\n[${s.name}] job -> ${r1.status} ${r1.body}`);
    await new Promise((r) => setTimeout(r, 1500));
    const msg = { channel: 'whatsapp', provider_message_id: `sim-${run}-${i}`, from_phone: phone, text: s.reply, received_at: new Date().toISOString() };
    const r2 = await post('/webhook/rfe/inbound', { message: msg }, internal);
    console.log(`   reply "${s.reply}" -> ${r2.status}. Expect status: ${s.expect}`);
  }
  console.log('\nOpen the dashboard to verify each item shows the expected status, alerts and drafts.');
})();
