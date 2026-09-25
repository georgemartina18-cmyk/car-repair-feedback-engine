# Reputation & Feedback Intelligence Engine

**For a multi-location car care and auto repair chain. Built on n8n, PostgreSQL, WhatsApp / SMS / email, and Claude.**

Every completed job triggers a WhatsApp feedback request. The engine reads the customer's reply, scores **sentiment and severity**, and checks whether this customer has **complained before**. It then routes each item to one of three lanes: **Ready to Post**, **In Queue**, or **Escalated** (branch lead, regional manager and HQ alerted instantly). It drafts a personalised reply for every negative item, for a person to review and send. Management sees **every location in one dashboard**.

![Dashboard](docs/dashboard-layout.png)

## What it does

| Problem today | What the engine does |
|---|---|
| Follow-up depends on who is at the desk | Job marked **completed** → WhatsApp request goes out automatically (SMS/email fallback, quiet hours, one reminder) |
| Bad reviews appear before anyone knows | Replies arrive privately first; severe ones reach managers in **under a minute** |
| A delay and a ruined car get the same treatment | A granular **sentiment score** (−1…+1) and **severity index** (0–100) drive three lanes with different SLAs |
| The same customer keeps complaining | **Repeat-customer check** runs before routing: a 2nd+ negative is escalated regardless of score |
| Blank-page replies, inconsistent tone | A **drafted reply** quotes the customer and names the fix. A person edits and sends it; it is never sent automatically |
| 5+ inboxes and WhatsApp groups | **One dashboard**: every entry, location, score and status, with filters and trends. Staff act on items from the same page |

| Customer says | Score | Severity | Lane |
|---|---|---|---|
| "It was fine, a bit slow" | 47/100 · Mildly negative | 5 · Low | ⚠️ **In Queue**: private, branch handles in its own time |
| "You ruined my car and wasted my whole day" | 8/100 · Severely negative | 95 · Critical | 🚨 **Escalated**: lead + regional + HQ alerted now |
| "Dan was brilliant, tyres done in 30 minutes" | 94/100 · Very positive | 0 | ✅ **Ready to Post**: team edits and shares manually |

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Architecture and data-flow diagrams | [docs/01-architecture.md](docs/01-architecture.md) |
| 2 | n8n workflow import files (9) | [workflows/](workflows/), with setup in [docs/02-n8n-setup.md](docs/02-n8n-setup.md) and **n8n Cloud** in [docs/11-n8n-cloud-setup.md](docs/11-n8n-cloud-setup.md) |
| 3 | Feedback request message templates | [docs/03-message-templates.md](docs/03-message-templates.md), [templates/whatsapp/](templates/whatsapp/), [src/templates.js](src/templates.js) |
| 4 | Sentiment scoring rules and severity thresholds | [docs/04-scoring-rules.md](docs/04-scoring-rules.md), [src/scoring.js](src/scoring.js) |
| 5 | Routing and escalation matrix | [docs/05-routing-escalation-matrix.md](docs/05-routing-escalation-matrix.md) |
| 6 | Repeat-customer detection logic | [docs/06-repeat-customer-logic.md](docs/06-repeat-customer-logic.md) |
| 7 | Auto-draft response templates | [docs/07-draft-responses.md](docs/07-draft-responses.md), [src/drafts.js](src/drafts.js) |
| 8 | Dashboard design and setup guide | [docs/08-dashboard.md](docs/08-dashboard.md), [dashboard/index.html](dashboard/index.html) |
| 9 | Testing plan and go-live checklist | [docs/09-testing-go-live.md](docs/09-testing-go-live.md) |
| 10 | Maintenance and scaling documentation | [docs/10-maintenance-scaling.md](docs/10-maintenance-scaling.md) |
| + | Build plan and requirements traceability | [docs/00-build-plan.md](docs/00-build-plan.md) |

## Workflows

| File | Name | Trigger |
|---|---|---|
| `00-error-alerts.json` | RFE 00 - Error Alerts | any workflow failure → email the admin |
| `01-job-completed-intake.json` | RFE 01 - Job Completed Intake | `POST /webhook/rfe/job-completed` (from your garage system) |
| `02-outbox-dispatcher.json` | RFE 02 - Outbox Dispatcher | every minute + instant wake-up → WhatsApp / SMS / email with fallback |
| `03-inbound-feedback-processor.json` | RFE 03 - Inbound Feedback Processor | WhatsApp, SMS, web form → score → repeat check → route |
| `04-customer-feedback-form.json` | RFE 04 - Customer Feedback Form | `GET /webhook/rfe/f` (link in email/SMS) |
| `05-sla-monitor-reminders.json` | RFE 05 - SLA Monitor & Reminders | every 5 min: escalation ladder, reminders, expiry |
| `06-case-page.json` | RFE 06 - Case Page | link in alerts: acknowledge, edit & send draft, resolve |
| `07-management-dashboard.json` | RFE 07 - Management Dashboard | `GET /webhook/rfe/dashboard` |
| `08-daily-digest.json` | RFE 08 - Daily Digest | 07:45 email scoped to branch / region / group |

## Quick start

```bash
# 1. database
psql "$DATABASE_URL" -f database/001_schema.sql -f database/002_functions.sql -f database/003_settings.sql
psql "$DATABASE_URL" -f database/010_demo_seed.sql        # optional demo branches/staff

# 2. n8n: create the 8 credentials (docs/02 step 4), then import workflows/*.json
#    or: N8N_URL=... N8N_API_KEY=... node scripts/deploy-n8n.js

# 3. try it
RFE_URL=https://your-n8n RFE_INTAKE_KEY=... RFE_INTERNAL_KEY=... node scripts/simulate.js --phone +44YOURMOBILE
```

Self-hosting with Docker: `docker/docker-compose.yml` with `.env.example`. **n8n Cloud:** see [docs/11-n8n-cloud-setup.md](docs/11-n8n-cloud-setup.md).

## Repository layout

```
src/            business logic (plain JS, no dependencies) - inlined into n8n Code nodes
database/       schema, stored functions (transactional logic), settings, demo seed
workflows/      generated n8n workflow files - do not edit by hand
dashboard/      the management dashboard page
templates/      WhatsApp template definitions for Meta approval
config/         default settings (loaded into app_settings)
scripts/        build-workflows, deploy-n8n, simulate
tests/          unit, workflow and database integration tests
docs/           the deliverables above
```

## Development

```bash
npm test                     # unit + workflow tests
RFE_TEST_DATABASE_URL=postgres://user:pass@localhost/rfe_test npm test   # + end-to-end DB pipeline
npm run build                # regenerate workflows/*.json and database/003_settings.sql from src/ + config/
npm run check                # CI: fail if generated files are stale
```

Edit logic in `src/` and run `npm run build`. Do not edit Code nodes in the n8n UI; the next deploy overwrites them. The test suite includes 80 tests covering a scoring calibration set, channel adapters, execution of the generated n8n Code nodes, and 19 end-to-end database scenarios. The whole system has also been run on a real n8n 2.40 instance, including a mode that mimics n8n Cloud (no environment variables).
