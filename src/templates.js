/**
 * Message templates (customer + staff) and a tiny renderer.
 *
 * {{var}} is replaced with the value (HTML-escaped in *_html templates).
 * {{#var}}...{{/var}} renders the block only when var is truthy.
 *
 * WhatsApp business-initiated messages MUST use templates approved by Meta.
 * Their definitions (for submission) live in templates/whatsapp/*.json; here we
 * only keep the ordered parameter lists we send with them. Free-form replies
 * (within the 24h customer-service window opened by the customer's message)
 * use the plain *_text templates below.
 *
 * Every template can be overridden per brand/branch via app_settings key
 * 'templates' (same keys as below) without rebuilding workflows.
 */

const TEMPLATES = {
  // ---------------------------------------------------------------- customer
  request_text:
    'Hi {{customer_first_name}}, thanks for choosing {{branch_name}} today for your {{service_type}}{{#vehicle_reg}} ({{vehicle_reg}}){{/vehicle_reg}}. ' +
    'How did we do? Reply 1-5 (5 = excellent) and tell us anything we could do better: {{feedback_link}} {{#sms_optout}}Reply STOP to opt out.{{/sms_optout}}',
  request_email_subject: 'How was your visit to {{branch_name}}?',
  request_email_html:
    '<p>Hi {{customer_first_name}},</p>' +
    '<p>Thanks for choosing <b>{{branch_name}}</b> for your {{service_type}}{{#vehicle_reg}} ({{vehicle_reg}}){{/vehicle_reg}}. How did we do?</p>' +
    '<p style="font-size:16px">' +
    '<a href="{{feedback_link}}&r=great" style="padding:10px 14px;background:#0ca30c;color:#fff;border-radius:6px;text-decoration:none;margin-right:6px">😀 Great</a> ' +
    '<a href="{{feedback_link}}&r=ok" style="padding:10px 14px;background:#8a8984;color:#fff;border-radius:6px;text-decoration:none;margin-right:6px">😐 OK</a> ' +
    '<a href="{{feedback_link}}&r=poor" style="padding:10px 14px;background:#d03b3b;color:#fff;border-radius:6px;text-decoration:none">😞 Not good</a></p>' +
    '<p>It takes 20 seconds, and every reply is read by the branch team.</p>' +
    '<p>Thanks,<br>The {{branch_name}} team</p>' +
    '<p style="color:#888;font-size:11px">You received this because you recently visited {{brand_name}}. <a href="{{optout_link}}">Unsubscribe</a></p>',
  reminder_text:
    'Hi {{customer_first_name}}, a quick reminder from {{branch_name}} - how was your visit? A one-word reply is perfect: {{feedback_link}}',

  reply_positive_text:
    "Thank you {{customer_first_name}}! That's great to hear - we'll pass it on to the {{branch_name}} team.{{#staff_mentioned}} {{staff_mentioned}} will be chuffed.{{/staff_mentioned}}" +
    '{{#review_link}} If you have a moment, a public review really helps us: {{review_link}}{{/review_link}}' +
    '{{#ask_consent}}\n\nMay we share your comment (first name only) on our website? Reply YES or NO.{{/ask_consent}}',
  reply_neutral_text:
    'Thanks {{customer_first_name}}, we appreciate the feedback.{{#review_link}} If you would like to leave a public review: {{review_link}}{{/review_link}}',
  // Optional holding message for negative feedback (off by default - see
  // customer_auto_replies.negative_acknowledgement). The real reply is a human-reviewed draft.
  reply_received_text:
    "Thanks {{customer_first_name}} - we've received your message and the {{branch_name}} team will come back to you personally.",
  ask_details_great_text:
    "Great to hear, {{customer_first_name}}! Anything in particular stand out? Just reply here - we'll share it with the team.",
  ask_details_ok_text:
    'Thanks {{customer_first_name}}. What one thing would have made it a 5-star visit? Just reply here.',
  ask_details_poor_text:
    "Sorry to hear that, {{customer_first_name}}. What went wrong? Please reply with a few words - it goes straight to the {{branch_name}} manager.",
  consent_yes_text: 'Thank you, {{customer_first_name}}! 🙏',
  consent_no_text: "No problem at all - we won't share it. Thanks again, {{customer_first_name}}.",
  optout_text: "You've been unsubscribed from {{brand_name}} feedback messages. Reply START to opt back in.",
  resolved_text:
    'Hi {{customer_first_name}}, thanks for your patience while we looked into your feedback. {{#resolution_note}}{{resolution_note}} {{/resolution_note}}' +
    'If anything is still not right please reply here or call {{branch_phone}}.{{#review_link}} You are also welcome to leave a public review: {{review_link}}{{/review_link}}',

  // ---------------------------------------------------------------- staff
  staff_alert_text:
    '🚨 ESCALATED ({{tier_label}}) - {{branch_name}}\n' +
    '{{#repeat_note}}⚠️ {{repeat_note}}\n{{/repeat_note}}' +
    'Customer: {{customer_name}} ({{customer_phone}}) | {{vehicle}} | {{service_type}}\n' +
    'Score: {{score_100}}/100{{#emotion}} ({{emotion}}){{/emotion}}\n' +
    '"{{customer_quote}}"\n' +
    'Why flagged: {{reasons}}\n' +
    'Next step: {{recommended_action}}\n' +
    'Draft reply is ready for review. Acknowledge within {{ack_minutes}} min: {{case_link}}',
  staff_alert_email_subject: '[ESCALATED - {{tier_label}}] {{branch_name}} - {{summary}}',
  staff_alert_email_html:
    '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
    '<p style="font-size:13px;color:#666">{{tier_icon}} <b>ESCALATED &middot; {{tier_label}}</b> &middot; {{branch_name}} &middot; {{received_at}}</p>' +
    '{{#repeat_note}}<p style="background:#fff4e5;padding:8px 12px;border-radius:6px"><b>Repeat customer:</b> {{repeat_note}}</p>{{/repeat_note}}' +
    '<h2 style="margin:4px 0 12px">{{summary}}</h2>' +
    '<blockquote style="border-left:4px solid #d03b3b;margin:0;padding:8px 12px;background:#f7f6f2;white-space:pre-wrap">{{customer_text}}</blockquote>' +
    '<table style="margin-top:12px;font-size:14px" cellpadding="4">' +
    '<tr><td><b>Customer</b></td><td>{{customer_name}} &middot; {{customer_phone}} &middot; {{customer_email}}</td></tr>' +
    '<tr><td><b>Job</b></td><td>{{job_id}} &middot; {{service_type}} &middot; {{vehicle}} &middot; tech: {{technician}}</td></tr>' +
    '<tr><td><b>Score</b></td><td>{{score_100}}/100 (sentiment {{score}}, intensity {{intensity}})</td></tr>' +
    '<tr><td><b>Why flagged</b></td><td>{{reasons}}</td></tr>' +
    '<tr><td><b>Issues</b></td><td>{{issues_list}}</td></tr>' +
    '<tr><td><b>Suggested action</b></td><td>{{recommended_action}}</td></tr>' +
    '</table>' +
    '<p style="margin-top:12px"><b>Draft reply (not sent - review and send from the case page):</b></p>' +
    '<div style="border:1px solid #ddd;border-radius:6px;padding:8px 12px;white-space:pre-wrap">{{draft_text}}</div>' +
    '<p><a href="{{case_link}}" style="display:inline-block;padding:10px 16px;background:#2a78d6;color:#fff;border-radius:6px;text-decoration:none">Open case: acknowledge, edit &amp; send reply</a> ' +
    '&nbsp;SLA: acknowledge within {{ack_minutes}} minutes.</p>' +
    '</div>',
  escalation_text:
    '⏰ ESCALATION - {{tier_label}} case at {{branch_name}} not {{overdue_what}} for {{overdue_minutes}} min.\n' +
    'Customer: {{customer_name}} ({{customer_phone}})\n"{{customer_quote}}"\n' +
    'Owner so far: {{notified_names}}\nTake action: {{case_link}}',
  escalation_email_subject: '[ESCALATION] {{tier_label}} case at {{branch_name}} overdue',
  recognition_text:
    '🌟 Customer kudos - {{branch_name}}\n{{#staff_mentioned}}Shout-out for {{staff_mentioned}}! {{/staff_mentioned}}"{{customer_quote}}"\n- {{customer_first_name}}, {{service_type}}',
  recognition_email_subject: '🌟 Kudos for {{branch_name}}{{#staff_mentioned}} - {{staff_mentioned}}{{/staff_mentioned}}',
};

const TIER_META = {
  P1_CRITICAL: { icon: '🔴', label: 'CRITICAL' },
  P2_HIGH: { icon: '🟠', label: 'HIGH' },
  P3_MEDIUM: { icon: '🟡', label: 'MEDIUM' },
  P4_LOW: { icon: '🔵', label: 'LOW' },
  NEUTRAL: { icon: '⚪', label: 'NEUTRAL' },
  POSITIVE: { icon: '🟢', label: 'POSITIVE' },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(template, vars, opts) {
  const html = opts && opts.html;
  const v = vars || {};
  let out = String(template || '');
  // sections (non-nested, repeated until stable so sibling sections work)
  const sec = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  out = out.replace(sec, (_, key, inner) => (truthy(v[key]) ? inner : ''));
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = v[key];
    if (val === undefined || val === null) return '';
    return html ? escapeHtml(val) : String(val);
  });
  return out;
}

function truthy(x) {
  if (Array.isArray(x)) return x.length > 0;
  return x !== undefined && x !== null && x !== false && x !== '' && x !== 0;
}

function getTemplate(key, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return TEMPLATES[key];
}

/** WhatsApp template parameters may not contain newlines, tabs or 4+ spaces. */
function waParam(s, max) {
  const clean = String(s === undefined || s === null || s === '' ? '-' : s)
    .replace(/\s+/g, ' ').trim();
  const lim = max || 900;
  return clean.length > lim ? clean.slice(0, lim - 1) + '…' : clean;
}

function firstName(name) {
  const n = String(name || '').trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'there';
}

function minutesToWords(min) {
  if (!min) return 'shortly';
  if (min <= 60) return `within ${min} minutes`;
  if (min < 24 * 60) return `within ${Math.round(min / 60)} hours`;
  return 'within 1 working day';
}

module.exports = { TEMPLATES, TIER_META, render, getTemplate, waParam, firstName, minutesToWords, escapeHtml };
