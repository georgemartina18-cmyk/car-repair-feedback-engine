const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { deps, settings } = require('./helpers');

const { I, X, T, D, S } = deps;

test('phone normalisation to E.164', () => {
  assert.equal(I.normalizePhone('07700 900123', '44'), '+447700900123');
  assert.equal(I.normalizePhone('+44 7700 900123', '44'), '+447700900123');
  assert.equal(I.normalizePhone('0044 7700900123', '44'), '+447700900123');
  assert.equal(I.normalizePhone('whatsapp:+447700900123', '44'), '+447700900123');
  assert.equal(I.normalizePhone('123', '44'), null);
  assert.equal(I.normalizePhone('', '44'), null);
});

test('job event validation', () => {
  const ok = I.normalizeJobEvent({ job_id: 'RO1', branch_id: 'B1', status: 'Completed', customer: { phone: '07700900123' }, vehicle: { reg: 'ab12 cde' } }, '44');
  assert.equal(ok.errors, undefined);
  assert.equal(ok.job.vehicle_reg, 'AB12 CDE');
  const bad = I.normalizeJobEvent({ branch_id: 'B1', status: 'in_progress' }, '44');
  assert.deepEqual(bad.errors, ['job_id is required', "status 'in_progress' is not a completed status", 'customer phone or email is required']);
});

test('WhatsApp webhook: text, quick-reply button, interactive, voice note and statuses', () => {
  const body = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '447700900123', profile: { name: 'Sarah' } }],
    messages: [
      { from: '447700900123', id: 'w1', timestamp: '1760000000', type: 'text', text: { body: 'Great job' } },
      { from: '447700900123', id: 'w2', timestamp: '1760000000', type: 'button', button: { payload: 'RATE_POOR:6f1c1c1e-0000-4000-8000-000000000000', text: 'Not good' } },
      { from: '447700900123', id: 'w3', timestamp: '1760000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'RATE_GREAT', title: 'Great' } } },
      { from: '447700900123', id: 'w4', timestamp: '1760000000', type: 'audio', audio: { id: 'm1' } },
    ],
    statuses: [{ id: 'out1', status: 'failed', timestamp: '1760000000', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
  } }] }] };
  const n = I.normalizeWhatsApp(body, '44');
  assert.equal(n.messages.length, 4);
  assert.equal(n.messages[0].text, 'Great job');
  assert.equal(n.messages[0].from_phone, '+447700900123');
  assert.equal(n.messages[0].profile_name, 'Sarah');
  assert.equal(n.messages[1].rating, 'poor');
  assert.equal(n.messages[1].request_id_hint, '6f1c1c1e-0000-4000-8000-000000000000');
  assert.equal(n.messages[2].rating, 'great');
  assert.match(n.messages[3].text, /voice note/);
  assert.deepEqual(n.statuses[0], { provider_message_id: 'out1', status: 'failed', error_code: '131026', error_title: 'Message undeliverable', at: n.statuses[0].at });
});

test('Twilio SMS + web form adapters', () => {
  const sms = I.normalizeTwilioSms({ From: '+447700900123', Body: ' 5 ', MessageSid: 'SM1' }, '44');
  assert.deepEqual([sms.channel, sms.text, sms.provider_message_id], ['sms', '5', 'SM1']);
  const web = I.normalizeWebForm({ t: 'abc', r: 'poor', comment: 'Late' });
  assert.deepEqual([web.channel, web.rating, web.text, web.request_token], ['web', 'poor', 'Late', 'abc']);
});

test('intent classification', () => {
  assert.equal(I.classifyIntent({ text: 'STOP' }, {}), 'opt_out');
  assert.equal(I.classifyIntent({ text: 'unsubscribe.' }, {}), 'opt_out');
  assert.equal(I.classifyIntent({ text: 'Stop charging me extra!' }, {}), 'feedback');
  assert.equal(I.classifyIntent({ text: 'Yes of course' }, { consent_pending: true }), 'consent_yes');
  assert.equal(I.classifyIntent({ text: 'Yes of course' }, { consent_pending: false }), 'feedback');
  assert.equal(I.classifyIntent({ text: 'no thanks' }, { consent_pending: true }), 'consent_no');
  assert.equal(I.classifyIntent({ text: '' }, {}), 'ignore');
  assert.equal(I.classifyIntent({ text: '', rating: 'poor' }, {}), 'feedback');
});

test('Meta signature verification', () => {
  const raw = '{"a":1}';
  const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
  assert.equal(I.verifyMetaSignature(raw, sig, 'secret', crypto), true);
  assert.equal(I.verifyMetaSignature(raw, sig, 'wrong', crypto), false);
  assert.equal(I.verifyMetaSignature(raw, undefined, 'secret', crypto), false);
});

test('dispatch: channel order, WhatsApp template payload, fallbacks', () => {
  const row = { id: 1, channels: ['whatsapp', 'sms', 'email'], tried_channels: [], to_phone: '+447700900123', to_email: 'a@example.com',
    wa_template: { name: 'rfe_feedback_request_v1', params: ['Sarah'], button_payloads: ['RATE_GREAT:x'] }, text: 'hi', email_html: '<p>hi</p>' };
  const s1 = X.buildSend(row, settings);
  assert.equal(s1.channel, 'whatsapp');
  assert.equal(s1.whatsapp_body.to, '447700900123');
  assert.equal(s1.whatsapp_body.template.components[0].parameters[0].text, 'Sarah');
  assert.equal(s1.whatsapp_body.template.components[1].sub_type, 'quick_reply');
  assert.equal(X.buildSend({ ...row, tried_channels: ['whatsapp'] }, settings).channel, 'sms');
  assert.equal(X.buildSend({ ...row, to_phone: null }, settings).channel, 'email');
  assert.equal(X.buildSend({ ...row, to_phone: null, to_email: null }, settings).channel, 'none');
});

test('dispatch: error classification', () => {
  assert.equal(X.classifyError('whatsapp', { message: '400 - {"error":{"code":131026}}', httpCode: '400' }).permanent, true);
  assert.equal(X.classifyError('whatsapp', { message: '429 - {"error":{"code":130429}}', httpCode: '429' }).permanent, false);
  assert.equal(X.classifyError('whatsapp', { message: 'connect ETIMEDOUT' }).permanent, false);
  assert.equal(X.classifyError('sms', { message: 'The number is unverified. code 21211', httpCode: '400' }).permanent, true);
  assert.equal(X.classifyError('email', { message: '550 mailbox unavailable' }).permanent, true);
  assert.equal(X.classifyError('email', { message: '421 try again later' }).permanent, false);
  assert.equal(X.classifyError('sms', { message: 'Forbidden - perhaps check your credentials?' }).permanent, true, 'n8n auth wording');
});

test('templates: sections, escaping, WhatsApp param hygiene', () => {
  assert.equal(T.render('a{{#x}} b {{x}}{{/x}}', { x: 'y' }), 'a b y');
  assert.equal(T.render('a{{#x}} b{{/x}}', {}), 'a');
  assert.equal(T.render('<b>{{x}}</b>', { x: '<script>' }, { html: true }), '<b>&lt;script&gt;</b>');
  assert.equal(T.waParam('line1\nline2\t    x'), 'line1 line2 x');
  assert.equal(T.waParam(''), '-');
  assert.equal(T.firstName('sarah JONES'), 'Sarah');
});

test('drafts: personalised, quotes the customer, never empty', () => {
  const text = 'Took 3 hours longer than promised and no one called me. Not happy.';
  const scored = S.combine({ text }, S.analyzeRules(text), null, settings.scoring);
  const d = D.buildDraft(scored, { customer_first_name: 'Sarah', customer_text: text, branch_name: 'Leeds North', branch_lead_name: 'Tom', lane: scored.lane }, settings.drafts);
  assert.equal(d.source, 'template');
  assert.match(d.text, /^Hi Sarah/);
  assert.match(d.text, /You said "Took 3 hours longer than promised/);
  assert.match(d.text, /kept you/);
  assert.match(d.text, /Leeds North team$/);
  const noText = S.combine({ text: '', rating: 'poor' }, S.analyzeRules(''), null, settings.scoring);
  const d2 = D.buildDraft(noText, { customer_first_name: 'Sam', branch_name: 'Bristol', lane: 'in_queue' }, settings.drafts);
  assert.match(d2.text, /what went wrong/);
  const pos = S.combine({ text: 'Brilliant' }, S.analyzeRules('Brilliant'), null, settings.scoring);
  assert.equal(D.buildDraft(pos, {}, settings.drafts), null, 'no draft for positive feedback');
});

test('drafts: AI draft preferred when present', () => {
  const text = 'Car still pulls to the left after the alignment';
  const scored = { ...S.combine({ text }, S.analyzeRules(text), null, settings.scoring),
    ai_draft_reply: 'Hi Sam, thanks for telling us the car still pulls to the left after the alignment - that should not happen. Please bring it back and we will re-check it free of charge today. - Bristol team' };
  assert.equal(D.buildDraft(scored, { customer_text: text }, settings.drafts).source, 'ai');
});
