# 11. Running on n8n Cloud (eastemade.app.n8n.cloud)

Your instance is **n8n Cloud**, at `https://eastemade.app.n8n.cloud`. Everything in this repository runs on Cloud unchanged. The workflows were tested in a Cloud-like mode: environment-variable access blocked and all configuration read from the database.

## 11.1 Your URLs

> The URL you shared, `…/webhook-test/e61b8b2d-…`, is a **test URL**. It only answers while that workflow is open in the editor with "Listen for test event" running. Production URLs use `/webhook/` and work only while the workflow is **published/active**. The engine registers its own fixed paths, so you do not need that UUID webhook.

| Purpose | Production URL | Who calls it |
|---|---|---|
| Job completed (the trigger) | `https://eastemade.app.n8n.cloud/webhook/rfe/job-completed` | Your garage system / DMS (header `X-RFE-Key`) |
| WhatsApp callback + verification | `https://eastemade.app.n8n.cloud/webhook/rfe/whatsapp` | Meta (App Dashboard → WhatsApp → Configuration) |
| SMS replies | `https://eastemade.app.n8n.cloud/webhook/rfe/sms` | Twilio (number → Messaging → "A message comes in") |
| Customer feedback form | `https://eastemade.app.n8n.cloud/webhook/rfe/f?t=…` | Links in email and SMS (automatic) |
| Staff case page | `https://eastemade.app.n8n.cloud/webhook/rfe/case?t=…` | Links in alerts (automatic) |
| **Management dashboard** | `https://eastemade.app.n8n.cloud/webhook/rfe/dashboard` | Management and branch leads (browser) |
| Dispatcher wake-up (internal) | `https://eastemade.app.n8n.cloud/webhook/rfe/dispatch` | The workflows themselves |
| Normalised inbound (internal / testing) | `https://eastemade.app.n8n.cloud/webhook/rfe/inbound` | `scripts/simulate.js` |

**Your existing UUID webhook.** If you have already pointed your garage system at the UUID webhook, you have two options. Change the DMS to call `/webhook/rfe/job-completed` (recommended), or keep your webhook and add one **HTTP Request** node after it that POSTs the same body to `/webhook/rfe/job-completed` with the `X-RFE-Key` header.

## 11.2 Differences from self-hosting

| Topic | On n8n Cloud |
|---|---|
| Environment variables | **Not available.** Put every value in the database row `app_settings.runtime` instead (11.3). If your plan has **Variables** (Settings → Variables), those override the database. Use the names `RFE_WA_PHONE_NUMBER_ID`, `RFE_EMAIL_FROM` and so on. |
| Database | n8n Cloud does not host your data. Use managed PostgreSQL that n8n Cloud can reach over the internet: Supabase, Neon, AWS RDS, Azure or Google Cloud SQL. Use SSL. If you restrict inbound IPs, allow n8n Cloud's egress IPs (listed in the n8n docs). |
| `crypto` in Code nodes | Allowed on Cloud. It is used for webhook signature checks and dashboard sessions. |
| Dispatcher wake-up | The workflows try `http://localhost:5678` by default. If your plan has Variables, create `RFE_INTERNAL_URL = https://eastemade.app.n8n.cloud`. Otherwise alerts still go out on the dispatcher's **1-minute schedule**. |
| Concurrency | Cloud plans cap concurrent executions. The design is light: short webhooks, a dispatcher that sends 25 messages per run, and a 5-minute SLA monitor. If you run hundreds of jobs an hour, check your plan's limit. |
| Importing | Workflows → **Import from File** for each file in `workflows/`, or use `scripts/deploy-n8n.js` with `N8N_URL=https://eastemade.app.n8n.cloud` and an API key (Settings → n8n API). |
| Error workflow | Set **RFE 00 - Error Alerts** as the error workflow of 01–08 (each workflow → Settings), or let the deploy script do it. |

## 11.2a Supabase: use the **Session pooler**, not the direct host

Supabase's direct host (`db.<project-ref>.supabase.co`) is **IPv6-only**, and n8n Cloud connects over IPv4. With the direct host, the credential test fails with **"Host not found, please check your host name"**. Use the pooler instead. In Supabase, click **Connect** → **Session pooler** and copy the values:

| n8n field | Value |
|---|---|
| Host | `aws-0-<region>.pooler.supabase.com` (or `aws-1-…`, exactly as shown under Session pooler) |
| Database | `postgres` |
| User | `postgres.<project-ref>`. The `.<project-ref>` suffix is required |
| Password | your database password (Project Settings → Database → Reset if unknown) |
| Port | `5432` (session mode) |
| SSL | `Require` (turn **Ignore SSL issues** on if the test complains about the certificate chain) |

The transaction pooler (port 6543) also works, because every query this system sends is a single self-contained statement. Session mode is the simpler choice.

## 11.3 Setup checklist for your instance

1. **Create the database** (for example on Supabase: Project → SQL editor). Run, in order: `database/001_schema.sql`, `002_functions.sql`, `003_settings.sql`. Then load your branches and staff (see [02-n8n-setup.md §2.1](02-n8n-setup.md#21-loading-your-organisation)).
2. **Point the engine at your instance:**

   ```sql
   UPDATE app_settings SET value = value || '{"public_base_url":"https://eastemade.app.n8n.cloud","brand_name":"YOUR BRAND","support_phone":"YOUR NUMBER"}'
    WHERE key = 'general';
   ```

3. **Fill in the runtime values** (this replaces environment variables on Cloud):

   ```sql
   UPDATE app_settings SET value = value || '{
     "wa_phone_number_id": "<WhatsApp phone number ID from Meta>",
     "wa_verify_token":    "<any long random string - also typed into Meta>",
     "wa_app_secret":      "<Meta App Secret - enables signature checks>",
     "twilio_from":        "+44...",
     "twilio_auth_token":  "<Twilio auth token - enables signature checks>",
     "email_from":         "Feedback <feedback@yourdomain.com>",
     "admin_email":        "it@yourdomain.com",
     "dashboard_secret":   "<32+ random characters>"
   }' WHERE key = 'runtime';
   ```

   These values never leave the database except inside the workflow steps that need them. The dashboard API cannot read them.

4. **Create the 8 credentials** in n8n (Credentials → Add), using the exact names in [02-n8n-setup.md, Step 4](02-n8n-setup.md#step-4---credentials-settings--credentials--add). For `RFE Postgres`, use your managed database's host with SSL = `require`.
5. **Import the 9 workflows.** Open each one, and select the credential wherever a node shows a warning (the names match).
6. **Publish (activate)** in this order: 02 → 03, 04, 06, 07 → 05, 08 → 01 last.
7. **Meta:** Callback URL `https://eastemade.app.n8n.cloud/webhook/rfe/whatsapp`, Verify token = your `wa_verify_token`, subscribe to `messages`.
8. **Twilio:** set the number's incoming message webhook to `https://eastemade.app.n8n.cloud/webhook/rfe/sms` (HTTP POST).
9. **Garage system:** POST completed jobs to `https://eastemade.app.n8n.cloud/webhook/rfe/job-completed` with the header `X-RFE-Key: <your intake key>`.
10. **Test** with `RFE_URL=https://eastemade.app.n8n.cloud RFE_INTAKE_KEY=… RFE_INTERNAL_KEY=… node scripts/simulate.js --phone +44YOURMOBILE`, then work through the UAT list in [09-testing-go-live.md](09-testing-go-live.md).

## 11.4 Quick check that the trigger is live

```bash
curl -X POST https://eastemade.app.n8n.cloud/webhook/rfe/job-completed \
  -H 'Content-Type: application/json' -H 'X-RFE-Key: <your intake key>' \
  -d '{"job_id":"TEST-001","branch_id":"<one of your branch codes>","status":"completed","service_type":"Full service","customer":{"name":"Your Name","phone":"<your mobile>"},"vehicle":{"registration":"AB12 CDE"}}'
# -> 202 {"status":"queued", ...} and a WhatsApp on your phone within a minute
```

| Response | Meaning |
|---|---|
| **404** | Workflow 01 is not published |
| **403** | Wrong `X-RFE-Key` |
| **422** | The payload is missing required fields; the response lists them |
| **200 `rejected: unknown_branch`** | The branch code is not in the `branches` table |
