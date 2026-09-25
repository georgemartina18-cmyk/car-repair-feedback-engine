# 3. Feedback request message templates

The request is sent **immediately when the job is marked completed**, with no manual step. The only exception is quiet hours (20:30–08:30 branch local time): a job closed at 21:00 is asked about at 08:30 the next morning.

## 3.1 WhatsApp (primary)

Business-initiated WhatsApp messages must use a template approved by Meta. Submit the files in [`templates/whatsapp/`](../templates/whatsapp/) through WhatsApp Manager (Account tools → Message templates) or through the Graph API. Use category **Utility**, because this is a post-transaction service follow-up.

**`rfe_feedback_request_v1`** (en_GB)

```
Hi {{1}}, thanks for visiting {{2}} today for your {{3}} ({{4}}).

How did we do? Tap a button below, or reply with a few words. Every reply is read by the branch team.

Reply STOP to opt out
[ 😀 Great ]  [ 😐 OK ]  [ 😞 Not good ]
```

| Param | Value |
|---|---|
| {{1}} | Customer first name |
| {{2}} | Branch name |
| {{3}} | Service performed |
| {{4}} | Vehicle registration |

Each button carries a per-message payload, `RATE_GREAT:<request_id>`, so a tap maps to the exact job even if the customer has had several visits.

**What happens after a tap**

| Tap | Automatic follow-up (free-form, inside the 24 h window the tap opens) |
|---|---|
| 😀 Great | "Great to hear, Sarah! Anything in particular stand out? Just reply here - we'll share it with the team." (+ review link) |
| 😐 OK | "Thanks Sarah. What one thing would have made it a 5-star visit? Just reply here." |
| 😞 Not good | "Sorry to hear that, Sarah. What went wrong? Please reply with a few words - it goes straight to the Leeds North manager." |

A "Not good" tap on its own already lands **In Queue** with a draft reply. The written answer is re-scored and can escalate it.

**`rfe_feedback_reminder_v1`** is sent once, 24 h later, and only if there is no reply:

```
Hi {{1}}, a quick reminder from {{2}}: how was your visit? One tap is perfect.
[ 😀 Great ]  [ 😐 OK ]  [ 😞 Not good ]
```

## 3.2 SMS (fallback 1)

Used when the number isn't on WhatsApp, the template fails, or WhatsApp reports the message as undeliverable.

```
Hi Sarah, thanks for choosing Leeds North today for your full service (AB12 CDE). How did we do?
Reply 1-5 (5 = excellent) and tell us anything we could do better: https://…/webhook/rfe/f?t=… Reply STOP to opt out.
```

Replies such as `5`, `4/5`, `8 out of 10` or `⭐⭐⭐` are read as ratings. Any words are scored in full.

## 3.3 Email (fallback 2)

- **Subject:** How was your visit to Leeds North?
- **Body:** a greeting, then three large buttons (😀 Great · 😐 OK · 😞 Not good). Each links to the hosted form with the rating preselected, where the customer can add a comment. The email ends with a one-click unsubscribe link.

## 3.4 Hosted feedback form

`/webhook/rfe/f?t=<token>` is a mobile page with the three rating buttons and a comment box. It handles expired links, already-answered links and unsubscribes gracefully.

## 3.5 Staff alert (WhatsApp template `rfe_staff_alert_v1` + email)

```
🚨 {{1}} customer feedback - {{2}}
Customer: {{3}}
Score: {{4}}
"{{5}}"
Why: {{6}}

Open the case to acknowledge and send the drafted reply: {{7}}
```

Example:

```
🚨 🔴 CRITICAL customer feedback - Leeds North
Customer: Sarah Jones (+447700900123)
Score: 8
"You ruined my car and wasted my whole day. There is a scratch down the door."
Why: sentiment -0.84; damage to customer vehicle
Open the case to acknowledge and send the drafted reply: https://…/webhook/rfe/case?t=…&c=2
```

The email version adds the job, technician, issue list, suggested action and **the full draft reply**, plus a button that opens the case.

Staff numbers must have opted in to receive WhatsApp messages from your business number. A simple way to do this is to ask each manager to send "hi" to the number once during onboarding.

## 3.6 Editing wording

All texts live in `src/templates.js` (`TEMPLATES`). To change wording without a rebuild, add an override in the database:

```sql
UPDATE app_settings SET value = value || '{"reply_positive_text": "Cheers {{customer_first_name}}! …"}'
 WHERE key = 'templates';
-- (INSERT INTO app_settings (key, value) VALUES ('templates', '{}') first if it does not exist)
```

The placeholders available are listed in `src/routing.js` (`vars`) and `src/pipeline.js`. WhatsApp **template** text changes must be re-approved by Meta. Bump the version suffix (`_v2`) and update `app_settings.whatsapp.*_template`.
