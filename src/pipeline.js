/**
 * The logic of every n8n Code node, as plain functions.
 *
 * Workflows call these with data from the previous node; tests call them
 * directly against a real Postgres. `deps` = { S: scoring, T: templates,
 * D: drafts, R: routing, I: inbound, X: dispatch } - passed in rather than
 * required so this file can be inlined into n8n.
 */

function baseUrl(settings) {
  return String((settings.general && settings.general.public_base_url) || '').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// WF-01 Job completed -> feedback request
// ---------------------------------------------------------------------------
function buildFeedbackRequestMessage(reg, deps) {
  const { T } = deps;
  const settings = reg.settings;
  const overrides = settings.templates || {};
  const base = baseUrl(settings);
  const link = `${base}/webhook/rfe/f?t=${reg.token}`;
  const vars = {
    brand_name: settings.general.brand_name,
    customer_first_name: T.firstName(reg.customer.name),
    branch_name: reg.branch.name,
    service_type: reg.job.service_type || 'visit',
    vehicle_reg: reg.job.vehicle_reg,
    feedback_link: link,
    optout_link: `${link}&optout=1`,
    sms_optout: true,
  };
  return {
    audience: 'customer',
    kind: 'feedback_request',
    priority: 4,
    channels: settings.collection.channels,
    to_phone: reg.customer.phone,
    to_email: reg.customer.email,
    wa_template: {
      name: settings.whatsapp.request_template,
      language: settings.whatsapp.template_language,
      params: [vars.customer_first_name, vars.branch_name, vars.service_type, vars.vehicle_reg || 'your vehicle'].map((p) => T.waParam(p, 60)),
      button_payloads: ['RATE_GREAT', 'RATE_OK', 'RATE_POOR'].map((c) => `${c}:${reg.request_id}`),
    },
    text: T.render(T.getTemplate('request_text', overrides), vars),
    email_subject: T.render(T.getTemplate('request_email_subject', overrides), vars),
    email_html: T.render(T.getTemplate('request_email_html', overrides), vars, { html: true })
      .replace(/&amp;r=/g, '&r='),
    respect_quiet_hours: true,
    timezone: reg.branch.timezone,
    request_id: reg.request_id,
    dedupe_key: `req:${reg.request_id}`,
  };
}

function buildReminderMessage(due, settings, deps) {
  const { T } = deps;
  const link = `${baseUrl(settings)}/webhook/rfe/f?t=${due.token}`;
  const vars = {
    customer_first_name: T.firstName(due.customer.name), branch_name: due.branch.name, feedback_link: link,
  };
  // Remind on the channel that actually delivered the request.
  const ch = due.channel_used || 'whatsapp';
  return {
    request_id: due.request_id,
    message: {
      audience: 'customer', kind: 'feedback_reminder', priority: 6,
      channels: ch === 'whatsapp' ? ['whatsapp'] : [ch],
      to_phone: due.customer.phone, to_email: due.customer.email,
      wa_template: { name: settings.whatsapp.reminder_template, language: settings.whatsapp.template_language,
        params: [vars.customer_first_name, vars.branch_name].map((p) => T.waParam(p, 60)),
        button_payloads: ['RATE_GREAT', 'RATE_OK', 'RATE_POOR'].map((c) => `${c}:${due.request_id}`) },
      text: T.render(T.getTemplate('reminder_text', settings.templates), vars),
      email_subject: `Quick reminder: how was ${due.branch.name}?`,
      email_html: `<p>${T.escapeHtml(T.render(T.getTemplate('reminder_text', settings.templates), vars))}</p>`,
      respect_quiet_hours: true, timezone: due.branch.timezone, request_id: due.request_id,
      dedupe_key: `rem:${due.request_id}:${due.reminder_no}`,
    },
  };
}

// ---------------------------------------------------------------------------
// WF-03 Inbound feedback: prepare -> (Claude) -> finalise
// ---------------------------------------------------------------------------
/**
 * @param lookup output of rfe_lookup_inbound()
 * @returns { mode: 'score'|'intent'|'ignore', ... }
 */
function prepareInbound(lookup, deps) {
  const { S, I, T } = deps;
  const settings = lookup.settings;
  const msg = { text: lookup.new_text || '', rating: lookup.rating };
  const intent = I.classifyIntent(msg, { consent_pending: lookup.consent_pending });

  if (intent !== 'feedback') {
    if (intent === 'ignore') return { mode: 'ignore' };
    const key = { opt_out: 'optout_text', opt_in: null, consent_yes: 'consent_yes_text', consent_no: 'consent_no_text' }[intent];
    const reply = key ? {
      audience: 'customer', kind: `intent_${intent}`, priority: 3, channels: [lookup.channel],
      to_phone: lookup.customer.phone, to_email: lookup.customer.email,
      text: T.render(T.getTemplate(key, settings.templates), {
        brand_name: settings.general.brand_name, customer_first_name: T.firstName(lookup.customer.name) }),
      dedupe_key: `intent:${lookup.message_id}`,
    } : null;
    return { mode: 'intent', payload: { intent, request_id: lookup.request_id, message_id: lookup.message_id, reply } };
  }

  // A reply that is just "4" or "5/5" is a rating, not text to analyse.
  const numeric = S.parseNumericRating(lookup.new_text);
  const newText = numeric ? '' : (lookup.new_text || '');
  const text = [lookup.previous_text, newText].filter((t) => t && t.trim()).join('\n');
  const rating = lookup.rating || (numeric ? String(numeric) : null) || lookup.previous_rating || null;
  const rules = S.analyzeRules(text);
  const llmCfg = settings.llm || {};
  const useLlm = Boolean(llmCfg.enabled && text.trim());
  return {
    mode: 'score',
    text,
    rating,
    rules,
    use_llm: useLlm,
    llm_request: useLlm ? S.buildLlmRequest(text, {
      branch_name: lookup.branch.name,
      service_type: lookup.job.service_type,
      vehicle: [lookup.job.vehicle, lookup.job.vehicle_reg].filter(Boolean).join(' '),
      rating_label: rating,
      customer_first_name: T.firstName(lookup.customer.name),
      previous_negative_count: lookup.history && lookup.history.previous_negative_count,
    }, llmCfg) : null,
    llm_headers: S.llmHeaders(llmCfg),
  };
}

/** Compact audit copy of the model response (the useful parts are stored as columns). */
function llmAudit(resp) {
  if (!resp) return null;
  if (resp.error) return { error: typeof resp.error === 'object' ? (resp.error.message || JSON.stringify(resp.error)).slice(0, 500) : String(resp.error).slice(0, 500) };
  return { id: resp.id, model: resp.model, stop_reason: resp.stop_reason, usage: resp.usage };
}

/**
 * @param lookup  rfe_lookup_inbound() output
 * @param prep    prepareInbound() output (mode 'score')
 * @param llmResponse raw Messages API response, or null / {error} when the call failed
 * @returns payload for rfe_save_feedback()
 */
function finalizeInbound(lookup, prep, llmResponse, deps) {
  const { S, T, D, R } = deps;
  const settings = lookup.settings;
  const llm = prep.use_llm ? S.parseLlmResponse(llmResponse) : null;
  let scored = S.combine({ text: prep.text, rating: prep.rating }, prep.rules, llm, settings.scoring);
  // Repeat-customer priority check happens BEFORE routing.
  scored = S.applyRepeatCustomerRule(scored, lookup.history, settings.repeat_customer);
  const fb = lookup.feedback || {};
  const routing = R.routeFeedback(scored, {
    feedback_id: fb.id || lookup.request_id,
    is_new: !fb.id,
    previous_tier: fb.tier || null,
    previous_lane: fb.lane || null,
    auto_reply_keys: fb.auto_reply_keys || [],
    consent_requested: Boolean(fb.consent_requested),
    customer: lookup.customer,
    customer_text: prep.text,
    branch: lookup.branch,
    job: lookup.job,
    contacts: lookup.contacts,
    case_token: lookup.case_token,
    history: lookup.history,
    received_at: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  }, settings, { T, D, TIER_RANK: S.TIER_RANK, overrides: settings.templates || {} });
  if (prep.use_llm && !llm) scored.reasons.push('AI scoring unavailable - rules-only score');
  return {
    request_id: lookup.request_id,
    message_id: lookup.message_id,
    channel: lookup.channel,
    rating: prep.rating,
    customer_text: prep.text || null,
    scored,
    routing,
    llm_raw: llmAudit(llmResponse),
  };
}

// ---------------------------------------------------------------------------
// WF-05 SLA monitor: escalation messages
// ---------------------------------------------------------------------------
function buildEscalations(dueList, settings, deps) {
  const { T, R } = deps;
  const base = baseUrl(settings);
  const out = [];
  for (const due of dueList || []) {
    const roles = due.roles || [];
    const recipients = R.contactsForRoles(due.contacts, roles);
    const meta = T.TIER_META[due.tier] || { label: due.tier };
    const messages = recipients.map((c) => {
      const v = {
        tier_label: meta.label, branch_name: due.branch_name, overdue_what: due.overdue_what,
        overdue_minutes: due.overdue_minutes, customer_name: due.customer_name || 'Unknown',
        customer_phone: due.customer_phone || '-',
        customer_quote: String(due.customer_text || due.summary || '').slice(0, 280),
        notified_names: due.notified_names || 'branch team',
        case_link: `${base}/webhook/rfe/case?t=${encodeURIComponent(due.token)}&c=${c.id}`,
      };
      const text = T.render(T.getTemplate('escalation_text', settings.templates), v);
      return {
        audience: 'staff', kind: 'escalation', priority: 1, contact_id: c.id,
        channels: R.staffChannels(c, ['whatsapp', 'email']),
        to_phone: c.whatsapp, to_email: c.email,
        wa_template: { name: settings.whatsapp.staff_alert_template, params: [
          `⏰ ESCALATION ${meta.label}${due.repeat_customer ? ' - REPEAT CUSTOMER' : ''}`, v.branch_name,
          `${v.customer_name} (${v.customer_phone})`, `not ${v.overdue_what} +${v.overdue_minutes} min`,
          v.customer_quote, `Already notified: ${v.notified_names}`, v.case_link].map((p) => T.waParam(p, 500)) },
        text,
        email_subject: T.render(T.getTemplate('escalation_email_subject', settings.templates), v),
        email_html: '<p style="font-family:system-ui,Arial,sans-serif;white-space:pre-wrap">' + T.escapeHtml(text) + '</p>',
        dedupe_key: `esc:${due.case_id}:${due.next_level}:${c.id}`,
      };
    });
    out.push({ case_id: due.case_id, level: due.next_level, roles, messages });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WF-07 Daily digest e-mails
// ---------------------------------------------------------------------------
function buildDigests(data, deps) {
  const { T } = deps;
  const settings = data.settings;
  const dash = `${baseUrl(settings)}/webhook/rfe/dashboard`;
  const byId = Object.fromEntries((data.branches || []).map((b) => [b.id, b]));
  const out = [];
  for (const r of data.recipients || []) {
    let branches;
    if (r.role === 'branch_team' || r.role === 'branch_lead') branches = byId[r.branch_id] ? [byId[r.branch_id]] : [];
    else if (r.role === 'regional_manager') branches = data.branches.filter((b) => b.region_id === r.region_id);
    else if (['hq', 'ops_director', 'admin', 'marketing'].includes(r.role)) branches = data.branches;
    else branches = [];
    if (!branches.length) continue;
    const e = T.escapeHtml;
    const rows = branches.map((b) => `<tr><td>${e(b.name)}${b.declining ? ' <b style="color:#d03b3b">▼ declining</b>' : ''}</td>` +
      `<td align="right">${b.responses}</td><td align="right">${b.avg_score_100 ?? '-'}</td>` +
      `<td align="right">${b.escalated}</td><td align="right">${b.open_escalations}</td>` +
      `<td align="right">${b.open_queue}${b.overdue_queue ? ` (${b.overdue_queue} overdue)` : ''}</td>` +
      `<td align="right">${b.drafts_waiting}</td><td align="right">${b.ready_to_post}</td></tr>`).join('');
    const declining = branches.filter((b) => b.declining).map((b) => `<li><b>${e(b.name)}</b>: ${e(b.declining_reason || '')}</li>`).join('');
    const kudos = r.role === 'branch_team' || r.role === 'branch_lead' || r.role === 'marketing'
      ? branches.flatMap((b) => b.kudos || []).slice(0, 5).map((k) => `<li>“${e(k.text)}”</li>`).join('') : '';
    const mild = r.role === 'branch_team' || r.role === 'branch_lead'
      ? branches.flatMap((b) => b.mild_items || []).map((m) => `<li>${e(m.summary || '')} <span style="color:#888">(${m.score_100}/100)</span></li>`).join('') : '';
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:720px">` +
      `<h2 style="margin:0 0 4px">Customer feedback - ${e(data.date)}</h2>` +
      `<p style="color:#666;margin:0 0 12px">${e(settings.general.brand_name)} · ${branches.length === 1 ? e(branches[0].name) : branches.length + ' branches'}</p>` +
      (declining ? `<div style="background:#fdecec;padding:8px 12px;border-radius:6px"><b>Needs attention</b><ul>${declining}</ul></div>` : '') +
      `<table cellpadding="6" style="border-collapse:collapse;font-size:14px;margin-top:12px"><tr style="background:#f3f2ee">` +
      `<th align="left">Branch</th><th>Responses</th><th>Avg score</th><th>Escalated</th><th>Open escalations</th><th>In queue</th><th>Drafts waiting</th><th>Ready to post</th></tr>${rows}</table>` +
      (mild ? `<h3>In your queue from yesterday</h3><ul>${mild}</ul>` : '') +
      (kudos ? `<h3>🌟 What customers loved</h3><ul>${kudos}</ul>` : '') +
      `<p><a href="${dash}">Open the dashboard</a></p></div>`;
    out.push({
      audience: 'staff', kind: 'digest', priority: 8, contact_id: r.id, channels: ['email'], to_email: r.email,
      email_subject: `Feedback digest ${data.date} - ${branches.length === 1 ? branches[0].name : 'all branches'}`,
      email_html: html, text: `Feedback digest ${data.date}: see email.`,
      dedupe_key: `digest:${data.date}:${r.id}`,
    });
  }
  return out;
}

module.exports = {
  buildFeedbackRequestMessage, buildReminderMessage, prepareInbound, finalizeInbound, llmAudit,
  buildEscalations, buildDigests,
};
