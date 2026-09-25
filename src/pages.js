/**
 * Server-rendered HTML pages served by n8n webhooks:
 *   - customer feedback form (link in email / SMS)
 *   - staff case page (link in escalation alerts): acknowledge, edit & send the
 *     draft reply, resolve, full timeline
 * No external assets; works on a phone; light + dark.
 */

const CSS = `
:root{--bg:#f7f6f2;--card:#fff;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--line:#e4e2dc;--accent:#2a78d6;--accent-ink:#fff;
--good:#0ca30c;--warn:#b87a00;--serious:#c4622d;--crit:#d03b3b;--chip:#efeee9;--quote:#f3f2ee}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121211;--card:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#96958c;
--line:#2e2e2b;--accent:#3987e5;--chip:#262624;--quote:#232321;--warn:#fab219;--serious:#ec835a;--crit:#e66767;--good:#2fbf2f}}
:root[data-theme="dark"]{--bg:#121211;--card:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#96958c;--line:#2e2e2b;--accent:#3987e5;--chip:#262624;
--quote:#232321;--warn:#fab219;--serious:#ec835a;--crit:#e66767;--good:#2fbf2f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 8px}.sub{color:var(--ink2);margin:0}.muted{color:var(--muted);font-size:13px}
.quote{background:var(--quote);border-left:4px solid var(--accent);border-radius:6px;padding:10px 12px;white-space:pre-wrap;margin:8px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chip{display:inline-flex;gap:4px;align-items:center;background:var(--chip);border-radius:999px;padding:2px 10px;font-size:13px}
.st-escalated{color:var(--crit);font-weight:600}.st-in_queue{color:var(--warn);font-weight:600}.st-ready_to_post,.st-posted{color:var(--good);font-weight:600}.st-resolved{color:var(--ink2);font-weight:600}
textarea,input,select{width:100%;font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}
textarea{min-height:150px;resize:vertical}label{display:block;font-size:13px;color:var(--ink2);margin:8px 0 4px}
button,.btn{appearance:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:10px 14px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}button:focus-visible,a:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0}dt{color:var(--muted)}dd{margin:0}
.tl{list-style:none;padding:0;margin:0}.tl li{border-left:2px solid var(--line);padding:0 0 10px 12px;position:relative}.tl li:before{content:"";position:absolute;left:-5px;top:6px;width:8px;height:8px;border-radius:50%;background:var(--accent)}
.flash{background:var(--quote);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:12px}
.rating{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.rating input{position:absolute;opacity:0;width:1px;height:1px}
.rating label{margin:0;border:2px solid var(--line);border-radius:10px;padding:14px 4px;text-align:center;font-size:15px;color:var(--ink);cursor:pointer;background:var(--card)}
.rating input:checked+label{border-color:var(--accent);background:var(--quote)}.rating input:focus-visible+label{outline:3px solid var(--accent)}
.big{font-size:28px;display:block}
`;

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main class="wrap">${body}</main></body></html>`;
}

function firstName(n) {
  const f = String(n || '').trim().split(/\s+/)[0];
  return f ? f[0].toUpperCase() + f.slice(1) : '';
}

// ---------------------------------------------------------------- customer form
function renderFeedbackForm(ctx, preselect, submitUrl) {
  const brand = (ctx.settings && ctx.settings.general && ctx.settings.general.brand_name) || '';
  if (!ctx.found) return shell('Feedback', `<div class="card"><h1>Link not recognised</h1><p class="sub">This feedback link has expired or is incorrect. Thank you anyway!</p></div>`);
  if (ctx.opted_out) return shell('Unsubscribed', `<div class="card"><h1>You're unsubscribed</h1><p class="sub">You won't receive feedback requests from ${esc(brand)} any more.</p></div>`);
  if (ctx.already_responded) return shell('Thank you', `<div class="card"><h1>Thanks - we already have your feedback</h1><p class="sub">If you'd like to add anything, just reply to our message or call ${esc(ctx.branch_name)}.</p></div>`);
  const opt = (v, emoji, label) => `<input type="radio" name="r" id="r-${v}" value="${v}"${preselect === v ? ' checked' : ''}>` +
    `<label for="r-${v}"><span class="big" aria-hidden="true">${emoji}</span>${label}</label>`;
  return shell(`How was ${ctx.branch_name}?`, `
<div class="card">
  <h1>Hi ${esc(firstName(ctx.customer_name)) || 'there'}, how did we do?</h1>
  <p class="sub">Your ${esc(ctx.service_type || 'visit')} at <b>${esc(ctx.branch_name)}</b>${ctx.vehicle_reg ? ` (${esc(ctx.vehicle_reg)})` : ''}</p>
</div>
<form class="card" method="post" action="${esc(submitUrl)}">
  <input type="hidden" name="t" value="${esc(ctx.token)}">
  <fieldset style="border:0;padding:0;margin:0"><legend class="muted" style="margin-bottom:8px">Overall</legend>
  <div class="rating">${opt('great', '😀', 'Great')}${opt('ok', '😐', 'OK')}${opt('poor', '😞', 'Not good')}</div></fieldset>
  <label for="comment">Tell us more (optional) - what went well, or what should we have done better?</label>
  <textarea id="comment" name="comment" maxlength="4000" placeholder="Your words go straight to the branch team"></textarea>
  <p style="margin-top:12px"><button class="primary" type="submit">Send feedback</button></p>
  <p class="muted">Read by the ${esc(ctx.branch_name)} team. We never publish your comments without asking.</p>
</form>`);
}

function renderThanks(lane) {
  const msg = lane === 'escalated'
    ? "We're sorry. Your message has gone straight to the branch manager, who will contact you personally."
    : lane === 'in_queue'
      ? "Thank you - the branch team will look at this and come back to you."
      : 'Thank you - we really appreciate you taking the time.';
  return shell('Thank you', `<div class="card"><h1>Thanks for your feedback</h1><p class="sub">${esc(msg)}</p></div>`);
}

// ---------------------------------------------------------------- staff case page
const STATUS_LABEL = { escalated: 'Escalated', in_queue: 'In Queue', ready_to_post: 'Ready to Post', posted: 'Posted',
  not_posted: 'Not posted', resolved: 'Resolved', logged: 'Logged' };
const EVENT_LABEL = { opened: 'Case opened', notified: 'Alerts sent', tier_upgraded: 'Severity increased', repeat_customer: 'Repeat customer detected',
  acknowledged: 'Acknowledged', reply_sent: 'Reply sent to customer', contacted: 'Customer contacted', handled_offline: 'Handled by phone / in person',
  resolved: 'Resolved', escalated: 'Escalated (SLA missed)', reopen: 'Reopened', note: 'Note', discard_draft: 'Draft discarded', save_draft: 'Draft saved' };

function fmt(ts, tz) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-GB', { timeZone: tz || 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(ts).slice(0, 16).replace('T', ' '); }
}

function renderCasePage(view, opts) {
  const o = opts || {};
  if (!view) return shell('Case not found', `<div class="card"><h1>Case not found</h1><p class="sub">The link may be incomplete.</p></div>`);
  const tz = o.timezone;
  const f = view.feedback; const c = view.case; const d = view.draft;
  const action = o.action_url;
  const hidden = `<input type="hidden" name="t" value="${esc(view.token)}"><input type="hidden" name="c" value="${esc(o.contact_id || '')}">`;
  const overdue = c.status === 'open' && c.ack_due_at && new Date(c.ack_due_at) < new Date();
  const reviewLink = view.branch.google_review_url;
  const followup = `Hi ${firstName(view.customer.name) || 'there'}, thanks for your patience while we sorted this out. If anything still isn't right, just reply here or call ${view.branch.phone || 'us'}.` +
    (reviewLink ? ` You're also welcome to share your experience publicly: ${reviewLink}` : '');
  const draftBlock = !d ? '' : d.status === 'draft' ? `
<form class="card" method="post" action="${esc(action)}">${hidden}
  <h2>Draft reply <span class="muted">(${d.source === 'ai' ? 'AI-drafted' : 'template'} - not sent yet)</span></h2>
  <p class="muted">Review and edit, then send. It goes to the customer on ${esc(f.channel === 'web' ? 'email/SMS' : f.channel)}.</p>
  <label for="draft">Message to ${esc(view.customer.name || 'customer')}</label>
  <textarea id="draft" name="draft_text" maxlength="1500">${esc(d.draft_text)}</textarea>
  <div class="row" style="margin-top:10px">
    <button class="primary" name="action" value="send_draft">Send reply</button>
    <button name="action" value="save_draft">Save edits</button>
    <button name="action" value="handled_offline">I called them instead</button>
    <button name="action" value="discard_draft">Discard</button>
  </div>
</form>` : `<div class="card"><h2>Reply</h2><p class="muted">${esc({ sent: 'Sent', discarded: 'Discarded', handled_offline: 'Handled by phone / in person' }[d.status] || d.status)}${d.sent_by ? ' by ' + esc(d.sent_by) : ''} ${esc(fmt(d.sent_at, tz))}</p>${d.final_text ? `<div class="quote">${esc(d.final_text)}</div>` : ''}</div>`;

  const hist = (view.history || []).map((h) => `<li><b>${esc(fmt(h.created_at, tz))}</b> ${esc(h.branch)} - ${esc(h.summary || '')} <span class="muted">(${h.score_100}/100, ${esc(STATUS_LABEL[h.status] || h.status)})</span></li>`).join('');
  const events = (view.events || []).map((e) => `<li><b>${esc(EVENT_LABEL[e.event] || e.event)}</b> <span class="muted">${esc(fmt(e.created_at, tz))} · ${esc(e.actor || '')}</span>` +
    (e.details && e.details.notes ? `<div>${esc(e.details.notes)}</div>` : '') + '</li>').join('');

  return shell(`${STATUS_LABEL[f.status] || f.status} - ${view.branch.name}`, `
${o.flash ? `<div class="flash" role="status">${esc(o.flash)}</div>` : ''}
<div class="card">
  <div class="row"><span class="chip st-${esc(f.status)}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
  <span class="chip">${esc(f.tier.replace('_', ' · '))}</span>
  ${f.repeat_customer ? `<span class="chip st-escalated">Repeat customer (${f.previous_negative_count} earlier)</span>` : ''}
  ${overdue ? '<span class="chip st-escalated">Acknowledgement overdue</span>' : ''}</div>
  <h1 style="margin-top:8px">${esc(f.summary || 'Customer feedback')}</h1>
  <p class="sub">${esc(view.branch.name)} · ${esc(fmt(f.created_at, tz))} · via ${esc(f.channel)}</p>
  <div class="quote">${esc(f.customer_text || '(no written comment - rating: ' + (f.rating || '-') + ')')}</div>
  <dl>
    <dt>Sentiment</dt><dd>${f.score_100}/100 · ${esc(f.sentiment_label || '')}</dd>
    <dt>Severity</dt><dd>${f.severity_index}/100 · ${esc(f.severity_label || '')}</dd>
    <dt>Why</dt><dd>${esc((f.reasons || []).join('; ') || '-')}</dd>
    <dt>Suggested</dt><dd>${esc(f.recommended_action || '')}</dd>
  </dl>
</div>
<div class="card">
  <h2>Customer</h2>
  <dl><dt>Name</dt><dd>${esc(view.customer.name || '-')}</dd>
  <dt>Phone</dt><dd>${view.customer.phone ? `<a href="tel:${esc(view.customer.phone)}">${esc(view.customer.phone)}</a>` : '-'}</dd>
  <dt>Email</dt><dd>${esc(view.customer.email || '-')}</dd>
  <dt>Job</dt><dd>${esc([view.job.id, view.job.service_type, view.job.vehicle, view.job.vehicle_reg].filter(Boolean).join(' · '))}</dd>
  <dt>Technician</dt><dd>${esc(view.job.technician || '-')}</dd></dl>
  ${hist ? `<h2 style="margin-top:12px">Previous feedback</h2><ul>${hist}</ul>` : ''}
</div>
${c.status === 'open' ? `<form class="card" method="post" action="${esc(action)}">${hidden}
  <h2>Take ownership</h2><p class="muted">${c.ack_due_at ? 'Acknowledge by ' + esc(fmt(c.ack_due_at, tz)) + ' to stop escalation.' : ''}</p>
  <button class="primary" name="action" value="acknowledge">Acknowledge - I'm on it</button></form>` : ''}
${draftBlock}
${c.status !== 'resolved' ? `<form class="card" method="post" action="${esc(action)}">${hidden}
  <h2>Resolve</h2>
  <label for="root">Root cause</label>
  <select id="root" name="root_cause"><option value="">-</option>${['workmanship', 'vehicle_damage', 'delay_turnaround', 'communication', 'pricing_billing', 'staff_attitude', 'parts_availability', 'cleanliness', 'booking_admin', 'customer_expectation', 'other']
    .map((r) => `<option>${r}</option>`).join('')}</select>
  <label for="notes">What was done</label><textarea id="notes" name="notes" style="min-height:80px" required></textarea>
  <label for="fu">Optional follow-up to the customer (sent only if filled in)</label>
  <textarea id="fu" name="followup_text" style="min-height:80px" placeholder="${esc(followup)}"></textarea>
  <p class="muted">Tip: paste the suggestion above if you want to invite a public review once it's sorted.</p>
  <button class="primary" name="action" value="resolve">Mark resolved</button>
</form>` : `<form class="card" method="post" action="${esc(action)}">${hidden}<h2>Resolved</h2><p>${esc(c.resolution_notes || '')}</p><button name="action" value="reopen">Reopen</button></form>`}
<form class="card" method="post" action="${esc(action)}">${hidden}
  <h2>Add a note</h2><textarea name="notes" style="min-height:70px" required></textarea>
  <p><button name="action" value="note">Add note</button></p>
</form>
<div class="card"><h2>Timeline</h2><ul class="tl">${events}</ul></div>`);
}

module.exports = { renderFeedbackForm, renderThanks, renderCasePage, shell, esc, CSS };
