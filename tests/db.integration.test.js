/**
 * End-to-end test against a real PostgreSQL: runs the same functions the n8n
 * workflows run, in the same order, minus the HTTP calls to WhatsApp/Claude.
 *
 *   RFE_TEST_DATABASE_URL=postgres://user:pass@localhost/rfe_test npm test
 *
 * Skipped when the variable is not set. The database name must contain "test"
 * because the public schema is dropped and recreated.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { deps, settings, makeDb } = require('./helpers');

const URL = process.env.RFE_TEST_DATABASE_URL;
const skip = !URL ? 'RFE_TEST_DATABASE_URL not set' : (!/test/i.test(URL.split('/').pop()) ? 'database name must contain "test"' : false);

const { S, I, X, P } = deps;

test('database pipeline end-to-end', { skip }, async (t) => {
  const db = makeDb(URL);
  db.run('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db.file('database/001_schema.sql');
  db.file('database/002_functions.sql');
  db.file('database/003_settings.sql');
  db.file('database/010_demo_seed.sql');
  // deterministic tests: no quiet hours, no LLM (we inject fake model responses)
  db.run(`UPDATE app_settings SET value = jsonb_set(value, '{quiet_hours}', 'null') WHERE key = 'collection'`);

  const S0 = db.json('SELECT rfe_settings()');
  assert.ok(S0.routing.P1_CRITICAL);
  assert.equal(S0.runtime, undefined, 'deployment secrets are never broadcast with the settings');

  // ---- helpers mirroring the workflows ---------------------------------------
  const registerJob = (body) => {
    const n = I.normalizeJobEvent(body, settings.general.default_country_code);
    assert.equal(n.errors, undefined, JSON.stringify(n.errors));
    const reg = db.call('rfe_register_job', n.job);
    if (reg.status === 'accepted') {
      const msg = P.buildFeedbackRequestMessage(reg, deps);
      db.json(`SELECT rfe_enqueue(${db.lit(msg)}::jsonb)`);
    }
    return reg;
  };
  const dispatchAll = (result = () => ({ ok: true })) => {
    const rows = db.rows('SELECT * FROM rfe_claim_outbox(100)');
    const sends = rows.map((row) => {
      const send = X.buildSend(row, S0);
      const r = send.channel === 'none' ? { ok: false } : result(send, row);
      const err = r.ok ? null : X.classifyError(send.channel, r.error || {});
      db.call('rfe_record_send_result', {
        outbox_id: row.id, channel: send.channel, ok: r.ok,
        provider_message_id: r.ok ? (r.id || `${send.channel}-${row.id}`) : null,
        error: err && err.message, error_code: err && err.code, permanent: err ? err.permanent : false,
      });
      return { row, send };
    });
    return sends;
  };
  const inbound = (msg, fakeLlm) => {
    const lookup = db.call('rfe_lookup_inbound', msg);
    if (lookup.action !== 'process') return { lookup };
    const prep = P.prepareInbound(lookup, deps);
    if (prep.mode === 'intent') return { lookup, prep, result: db.call('rfe_apply_intent', prep.payload) };
    if (prep.mode !== 'score') return { lookup, prep };
    const payload = P.finalizeInbound(lookup, prep, fakeLlm ? fakeLlm(prep) : null, deps);
    return { lookup, prep, payload, result: db.call('rfe_save_feedback', payload) };
  };
  const waText = (from, text, id) => I.normalizeWhatsApp({ entry: [{ changes: [{ value: {
    contacts: [{ wa_id: from.replace('+', ''), profile: { name: 'WA Name' } }],
    messages: [{ from: from.replace('+', ''), id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
  } }] }] }, '44').messages[0];
  const waButton = (from, payload, id) => I.normalizeWhatsApp({ entry: [{ changes: [{ value: {
    messages: [{ from: from.replace('+', ''), id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'button',
      button: { payload, text: 'Not good' } }],
  } }] }] }, '44').messages[0];

  let reqA;
  await t.test('job completed -> request queued -> sent on WhatsApp', () => {
    reqA = registerJob({ job_id: 'RO-1001', branch_id: 'LDS-N', status: 'completed', service_type: 'Full service',
      customer: { name: 'Sarah Jones', phone: '07700 900123', email: 'sarah@example.com' },
      vehicle: { registration: 'ab12cde', make: 'Ford', model: 'Focus' }, technician: 'Dave' });
    assert.equal(reqA.status, 'accepted');
    const sends = dispatchAll();
    assert.equal(sends.length, 1);
    assert.equal(sends[0].send.channel, 'whatsapp');
    assert.equal(sends[0].send.whatsapp_body.template.name, 'rfe_feedback_request_v1');
    assert.equal(sends[0].send.whatsapp_body.template.components[1].parameters[0].payload, `RATE_GREAT:${reqA.request_id}`);
    const r = db.rows(`SELECT status, channel_used FROM feedback_requests WHERE id = '${reqA.request_id}'`)[0];
    assert.deepEqual(r, { status: 'sent', channel_used: 'whatsapp' });
  });

  await t.test('duplicate job webhook is idempotent', () => {
    const again = registerJob({ job_id: 'RO-1001', branch_id: 'LDS-N', customer: { phone: '07700900123' } });
    assert.equal(again.status, 'duplicate');
  });

  await t.test('unknown branch is rejected, opted-out/cooldown customers suppressed', () => {
    const n = I.normalizeJobEvent({ job_id: 'X1', branch_id: 'NOPE', customer: { phone: '07700900999' } }, '44');
    assert.equal(db.call('rfe_register_job', n.job).status, 'rejected');
    const cd = registerJob({ job_id: 'RO-1002', branch_id: 'LDS-S', customer: { phone: '07700900123' } });
    assert.equal(cd.status, 'suppressed');
    assert.equal(cd.reason, 'cooldown');
  });

  await t.test('"Not good" tap -> In Queue (P3), draft created, details requested', () => {
    const { result, payload } = inbound(waButton('+447700900123', `RATE_POOR:${reqA.request_id}`, 'wamid.in1'));
    assert.equal(result.tier, 'P3_MEDIUM');
    assert.equal(result.status, 'in_queue');
    assert.ok(result.draft_id);
    assert.equal(payload.routing.staff_messages.length, 0, 'queue lane must not push alerts');
    assert.equal(payload.routing.customer_message.template_key, 'ask_details_poor_text');
  });

  await t.test('same webhook delivered twice is ignored', () => {
    const { lookup } = inbound(waButton('+447700900123', `RATE_POOR:${reqA.request_id}`, 'wamid.in1'));
    assert.equal(lookup.action, 'duplicate');
  });

  await t.test('follow-up "you ruined my car" -> Escalated (P1), alerts to lead + regional + HQ', () => {
    const { result, payload } = inbound(waText('+447700900123', 'You ruined my car and wasted my whole day. There is a scratch down the door.', 'wamid.in2'));
    assert.equal(result.tier, 'P1_CRITICAL');
    assert.equal(result.status, 'escalated');
    assert.equal(result.is_new, false);
    const roles = payload.routing.staff_messages.map((m) => m.role).sort();
    assert.deepEqual(roles, ['branch_lead', 'hq', 'regional_manager']);
    const fb = db.rows(`SELECT customer_text, lane, initial_tier FROM feedback WHERE id = '${result.feedback_id}'`)[0];
    assert.match(fb.customer_text, /You ruined my car/, 'exact words preserved');
    assert.equal(fb.initial_tier, 'P3_MEDIUM');
    const c = db.rows(`SELECT tier, token, ack_due_at IS NOT NULL AS has_sla FROM cases WHERE feedback_id = '${result.feedback_id}'`)[0];
    assert.equal(c.tier, 'P1_CRITICAL');
    assert.ok(c.has_sla);
    const alert = db.rows(`SELECT text FROM outbox WHERE case_id IS NOT NULL AND kind LIKE 'staff_alert%' LIMIT 1`)[0];
    assert.ok(alert.text.includes(c.token), 'case link carries the real case token');
    assert.ok(!alert.text.includes('__CASE_TOKEN__'));
    // the draft was regenerated for the worse message but NOT sent
    const d = db.rows(`SELECT status, draft_text FROM response_drafts WHERE feedback_id = '${result.feedback_id}'`)[0];
    assert.equal(d.status, 'draft');
    assert.match(d.draft_text, /Sarah/);
    assert.match(d.draft_text, /ruined my car/);
    assert.equal(db.rows(`SELECT count(*)::int AS n FROM outbox WHERE kind = 'draft_reply'`)[0].n, 0, 'draft never auto-sent');
  });

  await t.test('staff alerts are dispatched with priority before everything else', () => {
    const sends = dispatchAll();
    assert.equal(sends[0].row.priority, 1);
    assert.ok(sends.some((s) => s.row.kind === 'customer_reply'));
  });

  await t.test('case page actions: acknowledge, edit + send draft, resolve', () => {
    const c = db.rows(`SELECT token FROM cases LIMIT 1`)[0];
    const lead = db.rows(`SELECT id FROM staff_contacts WHERE name = 'Tom Walker'`)[0];
    assert.equal(db.call('rfe_case_action', { token: c.token, action: 'acknowledge', contact_id: lead.id }).ok, true);
    const sent = db.call('rfe_case_action', { token: c.token, action: 'send_draft', contact_id: lead.id,
      draft_text: 'Hi Sarah, Tom here - I am so sorry. I will call you at 3pm today.' });
    assert.ok(sent.outbox_id);
    const d = db.rows(`SELECT status, edited, sent_by FROM response_drafts`)[0];
    assert.deepEqual(d, { status: 'sent', edited: true, sent_by: 'Tom Walker' });
    assert.equal(db.call('rfe_case_action', { token: c.token, action: 'send_draft' }).ok, false, 'cannot send twice');
    const sends = dispatchAll();
    assert.equal(sends[0].row.kind, 'draft_reply');
    assert.equal(sends[0].send.channel, 'whatsapp');
    db.call('rfe_case_action', { token: c.token, action: 'resolve', contact_id: lead.id, notes: 'Repainted door', root_cause: 'vehicle_damage' });
    const v = db.json(`SELECT rfe_case_view(${db.lit(c.token)})`);
    assert.equal(v.case.status, 'resolved');
    assert.equal(v.feedback.status, 'resolved');
    assert.deepEqual(v.events.map((e) => e.event).filter((e) => e !== 'notified'),
      ['opened', 'tier_upgraded', 'acknowledged', 'reply_sent', 'resolved']);
  });

  await t.test('repeat customer: 2nd negative escalates regardless of score', () => {
    db.run(`UPDATE feedback_requests SET created_at = now() - interval '30 days'`);
    const reqB = registerJob({ job_id: 'RO-2001', branch_id: 'LDS-S', service_type: 'MOT', customer: { name: 'Sarah Jones', phone: '+447700900123' } });
    assert.equal(reqB.status, 'accepted');
    dispatchAll();
    const { result, payload } = inbound(waText('+447700900123', 'It was fine, a bit slow', 'wamid.in3'));
    assert.equal(payload.scored.flags.repeat_customer, true);
    assert.ok(payload.scored.score > -0.3, 'mild wording on its own');
    assert.equal(result.status, 'escalated');
    assert.equal(result.tier, 'P2_HIGH');
    assert.match(payload.scored.reasons[0], /repeat customer: 2nd negative/);
    assert.match(payload.routing.draft.text, /isn't the first time/);
  });

  await t.test('positive -> Ready to Post + consent; YES is recorded; nothing is published', () => {
    const reqC = registerJob({ job_id: 'RO-3001', branch_id: 'MCR-C', service_type: 'Tyres', customer: { name: 'Mo Ali', phone: '+447700900555' } });
    dispatchAll();
    const fake = () => ({ id: 'msg_1', model: 'claude-opus-5', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({
      sentiment_score: 0.92, intensity: 0.6, severity_score: 0, emotion: 'delighted', categories: [], issues: [],
      positives: [{ aspect: 'staff', detail: 'Friendly', customer_quote: 'Dan was brilliant', staff_mentioned: 'Dan' }],
      flags: { safety_concern: false, vehicle_damage: false, legal_threat: false, public_review_threat: false, refund_demand: false, repeat_problem: false, churn_risk: false },
      summary: 'Delighted with fast, friendly tyre fitting.', recommended_action: 'Share with team.', draft_reply: '', language: 'en', testimonial_worthy: true }) }] });
    const { result, payload } = inbound(waText('+447700900555', 'Dan was brilliant - tyres fitted in 30 minutes and he explained everything. Great value too!', 'wamid.in4'), fake);
    assert.equal(result.status, 'ready_to_post');
    assert.equal(payload.scored.method, 'hybrid');
    assert.equal(payload.routing.ask_consent, true);
    const rtp = db.rows(`SELECT status, original_text, customer_consent FROM ready_to_post`)[0];
    assert.equal(rtp.status, 'ready_to_post');
    assert.match(rtp.original_text, /Dan was brilliant/);
    dispatchAll();
    inbound(waText('+447700900555', 'Yes of course', 'wamid.in5'));
    assert.equal(db.rows(`SELECT customer_consent FROM ready_to_post`)[0].customer_consent, true);
    const id = db.rows(`SELECT id FROM ready_to_post`)[0].id;
    db.call('rfe_rtp_action', { id, action: 'posted', edited_text: 'Dan was brilliant - tyres fitted in 30 minutes.', platforms: ['website'], actor: 'Marketing' });
    assert.equal(db.rows(`SELECT status FROM feedback WHERE customer_id = (SELECT id FROM customers WHERE phone = '+447700900555')`)[0].status, 'posted');
  });

  await t.test('WhatsApp undeliverable -> automatic SMS fallback', () => {
    registerJob({ job_id: 'RO-4001', branch_id: 'BRS-1', customer: { name: 'No WhatsApp', phone: '+447700900777', email: 'nowa@example.com' } });
    dispatchAll((send) => (send.channel === 'whatsapp'
      ? { ok: false, error: { message: '400 - {"error":{"message":"Message undeliverable","code":131026}}', httpCode: '400' } }
      : { ok: true }));
    let o = db.rows(`SELECT status, tried_channels FROM outbox WHERE to_phone = '+447700900777'`)[0];
    assert.deepEqual(o, { status: 'pending', tried_channels: ['whatsapp'] });
    const sends = dispatchAll();
    assert.equal(sends[0].send.channel, 'sms');
    o = db.rows(`SELECT status, sent_channel FROM outbox WHERE to_phone = '+447700900777'`)[0];
    assert.deepEqual(o, { status: 'sent', sent_channel: 'sms' });
  });

  await t.test('async WhatsApp "failed" status re-queues on next channel', () => {
    registerJob({ job_id: 'RO-4002', branch_id: 'BRS-1', customer: { name: 'Late Fail', phone: '+447700900778' } });
    const [s] = dispatchAll(() => ({ ok: true, id: 'wamid.out-late' }));
    assert.equal(s.send.channel, 'whatsapp');
    const r = db.call('rfe_whatsapp_status', { provider_message_id: 'wamid.out-late', status: 'failed', error_code: '131026' });
    assert.equal(r.requeued, true);
    assert.equal(dispatchAll()[0].send.channel, 'sms');
  });

  await t.test('transient errors retry the same channel with back-off', () => {
    registerJob({ job_id: 'RO-4003', branch_id: 'BRS-1', customer: { name: 'Flaky', phone: '+447700900779' } });
    dispatchAll(() => ({ ok: false, error: { message: 'connect ETIMEDOUT' } }));
    const o = db.rows(`SELECT status, tried_channels, channel_attempts, next_attempt_at > now() AS backoff FROM outbox WHERE to_phone = '+447700900779'`)[0];
    assert.deepEqual(o, { status: 'pending', tried_channels: [], channel_attempts: 1, backoff: true });
  });

  await t.test('opt-out stops messages and future requests', () => {
    registerJob({ job_id: 'RO-5001', branch_id: 'LON-W', customer: { name: 'Stop Me', phone: '+447700900888' } });
    dispatchAll();
    const { prep } = inbound(waText('+447700900888', 'STOP', 'wamid.in6'));
    assert.equal(prep.payload.intent, 'opt_out');
    assert.equal(db.rows(`SELECT opted_out FROM customers WHERE phone = '+447700900888'`)[0].opted_out, true);
    db.run(`UPDATE feedback_requests SET created_at = now() - interval '60 days' WHERE customer_id = (SELECT id FROM customers WHERE phone = '+447700900888')`);
    const again = registerJob({ job_id: 'RO-5002', branch_id: 'LON-W', customer: { phone: '+447700900888' } });
    assert.equal(again.reason, 'opted_out');
  });

  await t.test('unknown sender is logged, not lost', () => {
    const { lookup } = inbound(waText('+447700900000', 'Who is this?', 'wamid.in7'));
    assert.equal(lookup.action, 'unmatched');
    assert.equal(db.rows(`SELECT count(*)::int AS n FROM unmatched_inbound`)[0].n, 1);
  });

  await t.test('unacknowledged escalation goes up the chain (once per level)', () => {
    db.run(`UPDATE cases SET ack_due_at = now() - interval '45 minutes' WHERE status = 'open'`);
    const due = db.json('SELECT rfe_due_escalations()');
    assert.equal(due.length, 1);
    assert.deepEqual(due[0].roles, ['ops_director']);
    const esc = P.buildEscalations(due, S0, deps);
    assert.equal(esc[0].messages[0].to_email, 'ops.director@example.com');
    assert.equal(db.call('rfe_record_escalation', esc[0]).ok, true);
    assert.equal(db.json('SELECT rfe_due_escalations()').length, 0, 'not re-escalated before repeat interval');
  });

  await t.test('reminder for silent customers, expiry afterwards', () => {
    registerJob({ job_id: 'RO-6001', branch_id: 'LDS-N', customer: { name: 'Quiet Person', phone: '+447700900444' } });
    dispatchAll();
    db.run(`UPDATE feedback_requests SET sent_at = now() - interval '25 hours' WHERE job_id = (SELECT id FROM jobs WHERE external_job_id = 'RO-6001')`);
    const due = db.json('SELECT rfe_due_reminders()');
    assert.equal(due.length, 1);
    const m = P.buildReminderMessage(due[0], S0, deps);
    db.call('rfe_mark_reminded', m);
    assert.equal(db.json('SELECT rfe_due_reminders()').length, 0);
    db.run(`UPDATE feedback_requests SET expires_at = now() - interval '1 minute' WHERE job_id = (SELECT id FROM jobs WHERE external_job_id = 'RO-6001')`);
    assert.equal(Number(db.run('SELECT rfe_expire_requests()')), 1);
  });

  await t.test('dashboard: one view, filters by status/score/branch', () => {
    const all = db.call('rfe_dashboard', {});
    assert.ok(all.kpis.responses >= 3);
    assert.ok(all.branches.length === 5);
    assert.ok(all.feed.every((f) => f.branch && f.status && f.score_100 !== undefined));
    const esc = db.call('rfe_dashboard', { statuses: ['escalated'] });
    assert.ok(esc.feed.length >= 1 && esc.feed.every((f) => f.status === 'escalated'));
    const low = db.call('rfe_dashboard', { max_score: 40 });
    assert.ok(low.feed.every((f) => f.score_100 <= 40));
    const mcr = db.rows(`SELECT id FROM branches WHERE code = 'MCR-C'`)[0].id;
    const one = db.call('rfe_dashboard', { branch_ids: [mcr] });
    assert.ok(one.feed.every((f) => f.branch === 'Manchester City'));
    const q = db.call('rfe_dashboard', { q: 'ruined' });
    assert.equal(q.feed.length, 1);
  });

  await t.test('daily digest renders per recipient scope', () => {
    db.run(`UPDATE feedback SET created_at = created_at - interval '1 day'`);
    const data = db.json('SELECT rfe_digest_data()');
    const mails = P.buildDigests(data, deps);
    const hq = mails.find((m) => m.to_email === 'customer-care@example.com');
    const lead = mails.find((m) => m.to_email === 'tom.walker@example.com');
    assert.ok(hq.email_html.includes('Bristol') && hq.email_html.includes('Leeds North'));
    assert.ok(lead.email_html.includes('Leeds North') && !lead.email_html.includes('Bristol'));
  });
});
