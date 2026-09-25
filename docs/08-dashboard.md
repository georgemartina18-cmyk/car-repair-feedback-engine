# 8. Dashboard design and setup guide

One web page for everyone: `https://<your-n8n>/webhook/rfe/dashboard`. It covers every location, every feedback entry and every status, with nothing split across inboxes or WhatsApp groups.

![layout](dashboard-layout.png)

## 8.1 Layout (top to bottom)

| Area | Contents |
|---|---|
| **Header** | Live indicator ("Updated 09:41:12 · live"), with auto-refresh every 30 s and immediate refresh when the tab regains focus. Also a Pause button and "Set your name", which is recorded against every action. |
| **Filters** | Region, **location**, **date from / to**, **sentiment score min / max** (0–100) and free-text search (customer words, name, registration, job number). |
| **Alerts bar** | ▼ **Declining sentiment** branches with the reason, and inbound messages from unknown numbers. |
| **Status tabs** | **All · Escalated · In Queue · Ready to Post · Resolved · Posted · Logged**, each with a live count. Status is the fourth filter. |
| **KPI tiles** | Feedback received (and response rate), average score, Escalated-open (with overdue count and escalation rate), In Queue (with drafts waiting), Ready to Post (with posted count), median time to acknowledge (and % within SLA), repeat unhappy customers. |
| **All feedback feed** | One row per feedback: when, **location**, **status label**, the customer's own words, **score** (0–100 with a bar and label), **severity**, customer and vehicle, and the next step (for example "Acknowledge (overdue)" or "Review draft reply"). The feed is paginated at 50 rows. On phones each row becomes a card. |
| **Item panel** (click a row) | The full customer text, sentiment, severity, the routing reason, and the contact details (tap to call). **Actions:** Acknowledge; edit and **Send** the draft reply; "I called them instead"; Discard; Resolve with notes. **Ready to Post** items also get an edit box, a "shown as" name, "posted to" checkboxes (Google, Facebook, website…), Copy, Mark as posted and Don't post, plus the customer's consent status. |
| **Trends** | Weekly average sentiment (line), weekly volume by outcome (stacked Escalated / Mild / Positive), average sentiment by location (bars, lowest first, ▼ on declining), escalation frequency by location (bars). |
| **Location scorecard** | Per branch: requests, responses, response rate, average score, Ready to Post / Mild / Escalated counts, escalation rate, open items, median acknowledgement time, overdue, and trend (▼ declining with reason). |
| **Top issues** | Issue categories in non-positive feedback for the filtered period. |

**Status labels**, as the brief requires:

| Label | Meaning |
|---|---|
| 🟢 **Ready to Post** | Positive, waiting for the team to review and share |
| 🟡 **In Queue** | Mild negative, handled privately by the branch |
| 🔴 **Escalated** | Severe or repeat issue; managers alerted |
| Resolved / Posted / Not posting / Logged | End states |

Each label is shown with a coloured dot **and** the word, so meaning never depends on colour alone. The colours follow a validated palette, and dark mode is supported.

## 8.2 Declining-branch flag

A branch is flagged **declining** when it has at least 5 responses in the last 7 days **and** either:

- its average sentiment over the last 7 days is ≥ 0.15 lower (7.5 points on the 0–100 scale) than over the previous 28 days, **or**
- 25% or more of its last-7-day feedback is negative.

The flag shows in the alerts bar, the scorecard and the chart labels, and it heads the morning digest. The settings are in `app_settings.analytics`.

## 8.3 Setup

1. Import and activate **RFE 07 - Management Dashboard** ([02-n8n-setup.md](02-n8n-setup.md)).
2. Create the credential **RFE Dashboard Login** (type *Basic Auth*) with a strong username and password. Both the page and its API use it, and the browser remembers it for the session.
3. Open `https://<your-n8n>/webhook/rfe/dashboard`, sign in, and click **Set your name**.
4. Share the URL and login with management and branch leads.

For individual logins, put the URL behind your SSO proxy (Cloudflare Access, Google IAP or Azure App Proxy) and keep basic auth as a second layer. See [10-maintenance-scaling.md](10-maintenance-scaling.md).

**Preview without data:** open `dashboard/index.html?demo=1` locally in a browser to see the layout with sample data.

## 8.4 Data behind it

The dashboard makes one call per refresh: `POST /webhook/rfe/dashboard/api {op:"data", filters}` → `rfe_dashboard(filters)`, which is a single SQL function over indexed tables. Actions call `rfe_case_action` / `rfe_rtp_action`, the same functions the case page uses, so the audit trail is identical wherever a person acts.

**BI tools.** Because everything is in PostgreSQL, you can also point Metabase, Looker Studio or Power BI at the database with a read-only user. Useful tables: `feedback` (joined to `branches`, `cases`, `response_drafts`, `ready_to_post`) and the function `rfe_branch_trends()`.
