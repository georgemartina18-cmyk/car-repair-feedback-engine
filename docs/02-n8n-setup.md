# 2. Step-by-step n8n setup

Allow about half a day, excluding Meta's WhatsApp template approval (usually minutes to 24 h), so submit the templates first.

## Step 0 - Prerequisites

| Need | Notes |
|---|---|
| n8n (self-hosted ≥ 1.80 or 2.x, or n8n Cloud) | Tested on **n8n 2.40** (Node 24). Self-hosting is recommended: the system uses env variables and the `crypto` built-in in Code nodes. |
| PostgreSQL 14+ | The feedback database. It can be the same server as n8n's own database, but should be a separate database. Managed Postgres is fine. |
| Public HTTPS URL for n8n | Required by the WhatsApp and Twilio webhooks. |
| Meta **WhatsApp Business** (Cloud API) | A Business Manager, a WhatsApp Business Account, a phone number, and a **permanent System User token** with `whatsapp_business_messaging` and `whatsapp_business_management`. |
| Twilio account + number | For the SMS fallback. Optional: remove `sms` from `collection.channels` if you do not want SMS. |
| SMTP mailbox | For email fallback, staff emails and digests (Microsoft 365, Google Workspace, SES, Postmark…). |
| Anthropic API key | For AI scoring and drafts. Optional: without it the rules engine scores alone (set `llm.enabled=false`). |

## Step 1 - Submit the WhatsApp templates (do this first)

In WhatsApp Manager → Message templates, create the four templates in `templates/whatsapp/`, keeping the same **name**, **language** (`en_GB`), **category** (Utility), body, footer and quick-reply buttons. Wait for "Active".

## Step 2 - Database

```bash
psql "$DATABASE_URL" -f database/001_schema.sql
psql "$DATABASE_URL" -f database/002_functions.sql
psql "$DATABASE_URL" -f database/003_settings.sql
# optional demo data for staging:
psql "$DATABASE_URL" -f database/010_demo_seed.sql
```

Or use `docker/docker-compose.yml`, which loads the schema automatically on first start.

Then load **your** organisation (see §2.1 below): regions, branches (with the **same branch codes your garage system uses**), and staff contacts.

Finally set the public URL and brand:

```sql
UPDATE app_settings SET value = value || '{"public_base_url":"https://n8n.yourco.com","brand_name":"YourCo Autocare","support_phone":"0800 123 4567"}' WHERE key = 'general';
```

## Step 3 - n8n environment variables (self-hosted) or `app_settings.runtime` (n8n Cloud)

> **On n8n Cloud?** Environment variables are not available there. Put the same values in the database row `app_settings.runtime` instead, and skip the n8n switches below. Follow [11-n8n-cloud-setup.md](11-n8n-cloud-setup.md).

Precedence: n8n Variable (`$vars`) > environment variable > `app_settings.runtime`.

Copy `.env.example` to `.env` and fill it in. The required ones are:

| Variable | Why |
|---|---|
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | Code nodes read `RFE_*` settings |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | Webhook signature checks + dashboard sessions |
| `RFE_WA_PHONE_NUMBER_ID`, `RFE_WA_VERIFY_TOKEN`, `RFE_WA_APP_SECRET` | WhatsApp Cloud API |
| `RFE_TWILIO_FROM`, `RFE_TWILIO_AUTH_TOKEN`, `RFE_PUBLIC_URL` | SMS sending + signature check |
| `RFE_EMAIL_FROM`, `RFE_ADMIN_EMAIL` | Email sender, and where failures are reported |
| `RFE_DASHBOARD_SECRET` | Signs dashboard sessions (32+ random chars) |
| `RFE_INTERNAL_URL` | How workflows reach each other, usually `http://localhost:5678` |
| `GENERIC_TIMEZONE` / `TZ` | Your main timezone (branches can differ; see `branches.timezone`) |

Restart n8n after changing them.

## Step 4 - Credentials (Settings → Credentials → Add)

Create these **eight credentials with exactly these names**:

| Name | Type | Fields |
|---|---|---|
| `RFE Postgres` | Postgres | host, database, user, password, SSL as required |
| `RFE Intake Key` | Header Auth | Name `X-RFE-Key`, Value: long random string (give it to the garage-system integrator) |
| `RFE Internal Key` | Header Auth | Name `X-RFE-Internal`, Value: long random string |
| `RFE WhatsApp Token` | Header Auth | Name `Authorization`, Value `Bearer <permanent system-user token>` |
| `RFE Anthropic Key` | Header Auth | Name `x-api-key`, Value: your Anthropic API key |
| `RFE Twilio` | Twilio API | Account SID + Auth Token |
| `RFE SMTP` | SMTP | Your mail server |
| `RFE Dashboard Login` | Basic Auth | Username + strong password for the dashboard |

## Step 5 - Import the workflows

**Option A: UI.** In n8n, go to Workflows → ⋯ → Import from File, and import each file in `workflows/` (00 to 08). Open each one. Any node with a red credential warning needs its credential picked from the dropdown (the names match).

**Option B: script.** Create an API key (Settings → n8n API), put the credential ids in `config/n8n-credentials.json`, then run:

```bash
N8N_URL=https://n8n.yourco.com N8N_API_KEY=... node scripts/deploy-n8n.js
```

This creates or updates all nine workflows, wires the credentials by name and sets **RFE 00 - Error Alerts** as the error workflow of the others. Add `--create-credentials` to create the credentials from env variables. Add `--activate` to activate everything.

With the UI method, set the error workflow by hand: open each workflow → Settings → Error workflow → "RFE 00 - Error Alerts".

## Step 6 - Activate (publish) in this order

1. **02 Outbox Dispatcher**
2. **03 Inbound Feedback Processor**, **04 Customer Feedback Form**, **06 Case Page**, **07 Management Dashboard**
3. **05 SLA Monitor & Reminders**, **08 Daily Digest**
4. **01 Job Completed Intake**, last, once everything downstream is live

## Step 7 - Connect WhatsApp webhooks

In Meta App Dashboard → WhatsApp → Configuration:

- **Callback URL:** `https://n8n.yourco.com/webhook/rfe/whatsapp`
- **Verify token:** the value of `RFE_WA_VERIFY_TOKEN`. Meta calls the GET endpoint and workflow 03 answers the challenge.
- **Subscribe to:** `messages` (this covers inbound messages **and** delivery statuses).
- Put the App Secret in `RFE_WA_APP_SECRET`, so every POST is signature-verified.

## Step 8 - Connect Twilio (SMS replies)

In Twilio Console → Phone Numbers → your number → Messaging → "A message comes in": **Webhook**, `POST https://n8n.yourco.com/webhook/rfe/sms`.

## Step 9 - Connect the garage system (the trigger)

Configure your DMS / job-management system to call the webhook **when a job is marked completed**:

```http
POST https://n8n.yourco.com/webhook/rfe/job-completed
X-RFE-Key: <RFE Intake Key value>
Content-Type: application/json

{
  "job_id": "RO-104233",
  "branch_id": "LDS-N",
  "status": "completed",
  "completed_at": "2026-09-25T15:42:00+01:00",
  "service_type": "Full service",
  "technician": "Dave",
  "customer": { "name": "Sarah Jones", "phone": "07700 900123", "email": "sarah@example.com" },
  "vehicle": { "registration": "AB12 CDE", "make": "Ford", "model": "Focus" }
}
```

The endpoint accepts common alternative field names (`jobId`, `work_order`, `ro_number`, `location_id`, `mobile`, `reg`…). Responses:

| Status | Meaning |
|---|---|
| **202** `{"status":"queued"}` | The request is queued |
| **200** `{"status":"duplicate" \| "suppressed" \| "rejected", "reason": ...}` | Not queued. Reasons include cool-down, opt-out, unknown branch, excluded service and old job |
| **422** | The payload is invalid, with a list of errors |

Re-sending the same job is safe (idempotent).

**The DMS cannot call webhooks?** Add a small n8n workflow: a Schedule trigger every 2 minutes → an HTTP Request to the DMS "jobs completed since" endpoint (keep the last timestamp in `$getWorkflowStaticData('global')`) → an HTTP Request POST of each job to `/webhook/rfe/job-completed`. The intake stays the single entry point.

## Step 10 - Smoke test

```bash
RFE_URL=https://n8n.yourco.com RFE_INTAKE_KEY=... RFE_INTERNAL_KEY=... node scripts/simulate.js --branch LDS-N --phone +44YOURMOBILE
```

Then follow the UAT script in [09-testing-go-live.md](09-testing-go-live.md).

---

## 2.1 Loading your organisation

```sql
INSERT INTO regions (name) VALUES ('North'), ('South');

INSERT INTO branches (code, name, region_id, timezone, phone, google_review_url) VALUES
 ('LDS-N', 'Leeds North', (SELECT id FROM regions WHERE name='North'), 'Europe/London', '0113 000 0001', 'https://g.page/r/XXXX/review');

-- one row per person per role; a person may hold several roles
INSERT INTO staff_contacts (name, role, branch_id, whatsapp, email) VALUES
 ('Leeds North Team', 'branch_team', (SELECT id FROM branches WHERE code='LDS-N'), NULL, 'leeds-north@yourco.com'),
 ('Tom Walker', 'branch_lead', (SELECT id FROM branches WHERE code='LDS-N'), '+447700900101', 'tom@yourco.com');
INSERT INTO staff_contacts (name, role, region_id, whatsapp, email) VALUES
 ('Rachel North', 'regional_manager', (SELECT id FROM regions WHERE name='North'), '+447700900201', 'rachel@yourco.com');
INSERT INTO staff_contacts (name, role, whatsapp, email) VALUES
 ('HQ Customer Care', 'hq', '+447700900301', 'care@yourco.com'),
 ('Ops Director', 'ops_director', '+447700900302', 'ops@yourco.com'),
 ('Marketing', 'marketing', NULL, 'marketing@yourco.com'),
 ('System Admin', 'admin', NULL, 'it@yourco.com');
```

Roles: `branch_team`, `branch_lead`, `regional_manager`, `hq`, `ops_director`, `marketing`, `admin`. Per-person switches: `notify_whatsapp`, `notify_email`, `receives_digest`, `active`.

## 2.2 Settings reference

Every behaviour in `config/default-settings.json` is also stored in the `app_settings` table, one row per top-level key. Change it live with SQL:

```sql
-- example: acknowledge P1 within 20 minutes instead of 30
UPDATE app_settings SET value = jsonb_set(value, '{P1_CRITICAL,ack_sla_minutes}', '20') WHERE key = 'routing';
```

Changes apply to the next message processed. No restart or re-import is needed.
