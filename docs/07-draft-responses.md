# 7. Drafted responses: never a blank page

For **all negative feedback** (P1–P4, meaning both In Queue and Escalated), the engine prepares a personalised draft reply. The draft:

- addresses the customer **by first name**;
- **quotes what they actually said** (the most serious issue, in their own words);
- references their **specific concern** (damage, delay, bill, safety…);
- says **what happens next**, naming the branch lead where one is set up;
- is **never sent automatically**. A person reviews it, edits if needed, and presses **Send**. The send is logged with their name, and both the original and the edited text are kept.

## 7.1 Where drafts come from

| Source | When | Notes |
|---|---|---|
| **AI draft** (`draft_reply` from the same Claude call that scores the message) | AI enabled and the call succeeded | 60–120 words, WhatsApp tone. The prompt forbids admitting liability, promising refunds or inventing facts. |
| **Template draft** (`src/drafts.js`) | AI off or failed, **or** the repeat-customer rule fired and the AI draft doesn't mention it | Deterministic. Built from the templates below. |

A draft is regenerated when the customer adds more detail, **unless** a person has already edited or sent it.

## 7.2 Template structure

```
Hi {first name}, thank you for taking the time to tell us about your visit to {branch}.
You said "{customer's own words}" - I'm sorry, that's not the experience we want for you.
{concern line 1} {concern line 2}
{next step}

- {branch} team
```

If there is no written comment (a "Not good" tap only), the opener becomes:

> Hi {first name}, thank you for letting us know your visit to {branch} wasn't good enough. I'm sorry - could you tell us a little about what went wrong so we can put it right?

### Concern lines (most serious first, at most two)

| Detected concern | Line |
|---|---|
| Safety | Your safety matters more than anything else. If you think the car may not be safe, please don't drive it - we'll inspect it free of charge or arrange recovery. |
| Vehicle damage | Any damage to your car while it was in our care is something we take very seriously, and I'd like to look at it with you and put it right. |
| Repeat problem | It's not acceptable that the problem is still there after your visit. We'd like to re-check the car free of charge at a time that suits you. |
| Workmanship | It's not acceptable that the job wasn't right first time. We'd like to re-check the car free of charge at a time that suits you. |
| Pricing / billing | I'm sorry the final bill wasn't what you expected. I'd like to go through the invoice with you line by line. |
| Staff attitude | That isn't how we want anyone to feel when they visit us, and I'm following it up with the team. |
| Communication | We should have kept you properly informed, and we did not. |
| Delay | You're right that we took longer than we should have, and we should have kept you updated. |
| Parts | I'm sorry for the wait on parts - we should have been clearer about timings from the start. |
| Cleanliness | We should have returned your car as clean as it arrived. |
| Booking / admin | I'm sorry for the mix-up with your booking and paperwork. |
| Other | I'm sorry your visit didn't meet the standard you expect from us. |

### Next step

| Situation | Line |
|---|---|
| Repeat customer | I also know this isn't the first time you've had to raise something with us, which makes it worse. {Lead} will call you personally today. |
| Escalated | {Lead} will call you today to agree how we put this right. |
| In Queue | If you're happy to, reply here and we'll arrange whatever is needed to make it right. |

## 7.3 Examples (actual output)

**"It was fine, a bit slow"** → In Queue

> Hi Sarah, thank you for taking the time to tell us about your visit to Leeds North. You said "It was fine, a bit slow" - I'm sorry, that's not the experience we want for you. You're right that we took longer than we should have, and we should have kept you updated. If you're happy to, reply here and we'll arrange whatever is needed to make it right.
>
> \- Leeds North team

**"You ruined my car and wasted my whole day"** → Escalated

> Hi Sarah, thank you for taking the time to tell us about your visit to Leeds North. You said "You ruined my car and wasted my whole day" - I'm sorry, that's not the experience we want for you. Any damage to your car while it was in our care is something we take very seriously, and I'd like to look at it with you and put it right. Tom will call you today to agree how we put this right.
>
> \- Leeds North team

## 7.4 Reviewing and sending

You can review and send a draft from two places. Both call the same database function, `rfe_case_action`:

1. **The case page** (link in the escalation alert). The draft is in an editable box, with four buttons: **Send reply**, **Save edits**, **I called them instead** and **Discard**.
2. **The dashboard.** Click any In Queue or Escalated row to open the same editor.

When staff press Send:

- The reply is queued for the customer's original channel (WhatsApp → SMS → email fallback). If WhatsApp's 24-hour window has closed, it falls back to SMS or email automatically.
- The case moves to **Contacted**, and the acknowledge SLA is satisfied.
- `response_drafts` stores `draft_text` (original), `final_text` (sent), `edited` (true/false), `sent_by` and `sent_at`.
- It **cannot be sent twice**, and it is blocked if the customer has opted out. Staff are told to phone instead.

## 7.5 Other customer messages (automatic, non-negative only)

These are collection or thank-you messages, not responses to complaints, so they are sent automatically. Negative feedback gets no automatic reply by default. An optional holding message can be switched on with `customer_auto_replies.negative_acknowledgement`.

| Key (`src/templates.js`) | When |
|---|---|
| `ask_details_great_text` / `ask_details_ok_text` / `ask_details_poor_text` | The customer tapped a button but wrote nothing |
| `reply_positive_text` | Positive text. Includes the review link, plus a consent question if the message is testimonial-worthy |
| `reply_neutral_text` | Neutral text |
| `consent_yes_text` / `consent_no_text` | Reply to the "may we share your comment?" question |
| `optout_text` | The customer sent STOP |

Every template can be overridden per brand in `app_settings.templates` without a rebuild.
