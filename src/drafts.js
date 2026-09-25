/**
 * Draft replies for negative feedback - "never a blank page".
 *
 * Preferred source: the AI draft returned alongside the score (same Claude call).
 * Fallback: the deterministic template below, built from the customer's own words
 * and the detected concern. Either way the draft is saved with status 'draft'
 * and is ONLY sent when a person presses Send in the dashboard.
 */

const CONCERN_LINES = {
  safety: "Your safety matters more than anything else. If you think the car may not be safe, please don't drive it - we'll inspect it free of charge or arrange recovery.",
  vehicle_damage: "Any damage to your car while it was in our care is something we take very seriously, and I'd like to look at it with you and put it right.",
  workmanship: "It's not acceptable that the job wasn't right first time. We'd like to re-check the car free of charge at a time that suits you.",
  repeat_problem: "It's not acceptable that the problem is still there after your visit. We'd like to re-check the car free of charge at a time that suits you.",
  pricing_billing: "I'm sorry the final bill wasn't what you expected. I'd like to go through the invoice with you line by line.",
  delay_turnaround: "You're right that we took longer than we should have, and we should have kept you updated.",
  communication: 'We should have kept you properly informed, and we did not.',
  staff_attitude: "That isn't how we want anyone to feel when they visit us, and I'm following it up with the team.",
  cleanliness: 'We should have returned your car as clean as it arrived.',
  booking_admin: "I'm sorry for the mix-up with your booking and paperwork.",
  parts_availability: "I'm sorry for the wait on parts - we should have been clearer about timings from the start.",
  other: "I'm sorry your visit didn't meet the standard you expect from us.",
};
// When several concerns are present, lead with the most serious.
const CONCERN_PRIORITY = ['safety', 'vehicle_damage', 'repeat_problem', 'workmanship', 'pricing_billing',
  'staff_attitude', 'communication', 'delay_turnaround', 'parts_availability', 'cleanliness', 'booking_admin', 'other'];

function pickQuote(scored, customerText) {
  const where = (q) => { const i = String(customerText || '').indexOf(q); return i === -1 ? 1e9 : i; };
  const issueQuote = (scored.issues || [])
    .filter((i) => i.customer_quote && i.customer_quote.length >= 8)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || where(a.customer_quote) - where(b.customer_quote))
    .map((i) => i.customer_quote)[0];
  let q = issueQuote || String(customerText || '').trim();
  q = q.replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '');
  if (q.length > 160) {
    const cut = q.slice(0, 160);
    q = cut.slice(0, Math.max(cut.lastIndexOf(' '), 100)) + '…';
  }
  return q;
}
function sevRank(s) { return { low: 0, medium: 1, high: 2, critical: 3 }[s] || 0; }

/**
 * @param scored  combine()/applyRepeatCustomerRule() output
 * @param ctx     { customer_first_name, customer_text, branch_name, branch_lead_name, lane }
 */
function templateDraft(scored, ctx) {
  const name = ctx.customer_first_name || 'there';
  const branch = ctx.branch_name || 'the branch';
  const text = String(ctx.customer_text || '').trim();
  const quote = text ? pickQuote(scored, text) : '';
  const cats = CONCERN_PRIORITY.filter((c) => (scored.categories || []).includes(c));
  const lines = cats.slice(0, 2).map((c) => CONCERN_LINES[c]);
  if (!lines.length) lines.push(CONCERN_LINES.other);

  const opener = quote
    ? `Hi ${name}, thank you for taking the time to tell us about your visit to ${branch}. You said "${quote}" - I'm sorry, that's not the experience we want for you.`
    : `Hi ${name}, thank you for letting us know your visit to ${branch} wasn't good enough. I'm sorry - could you tell us a little about what went wrong so we can put it right?`;

  let next;
  if (scored.flags && scored.flags.repeat_customer) {
    next = `I also know this isn't the first time you've had to raise something with us, which makes it worse. ${ctx.branch_lead_name || 'Our branch manager'} will call you personally today.`;
  } else if (ctx.lane === 'escalated') {
    next = `${ctx.branch_lead_name || 'Our branch manager'} will call you today to agree how we put this right.`;
  } else {
    next = "If you're happy to, reply here and we'll arrange whatever is needed to make it right.";
  }
  return `${opener} ${lines.join(' ')} ${next}\n\n- ${branch} team`;
}

/** Returns { text, source, quote } or null when no draft is needed for this tier. */
function buildDraft(scored, ctx, draftsCfg) {
  const tiers = (draftsCfg && draftsCfg.enabled_for_tiers) || ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'];
  if (!tiers.includes(scored.tier)) return null;
  const ai = scored.ai_draft_reply && scored.ai_draft_reply.length >= 40 ? scored.ai_draft_reply : null;
  // The AI draft does not know about the repeat-customer history unless told, so the
  // template is used when that rule fired after scoring and the AI draft does not mention it.
  const aiMissesRepeat = ai && scored.flags && scored.flags.repeat_customer && !/(again|before|previous|last time|not the first)/i.test(ai);
  if (ai && !aiMissesRepeat) return { text: ai, source: 'ai', quote: pickQuote(scored, ctx.customer_text) };
  return { text: templateDraft(scored, ctx), source: 'template', quote: pickQuote(scored, ctx.customer_text) };
}

module.exports = { buildDraft, templateDraft, pickQuote, CONCERN_LINES };
