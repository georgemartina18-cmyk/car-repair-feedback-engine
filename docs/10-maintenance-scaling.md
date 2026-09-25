# 10. Maintenance and scaling

## 10.1 Routine operations

| Frequency | Task | How |
|---|---|---|
| Daily (branch lead) | Clear **In Queue** and waiting drafts | Dashboard → In Queue tab |
| Daily (marketing) | Review **Ready to Post** | Dashboard → Ready to Post tab |
| Daily (admin, 2 min) | Check failures | `SELECT kind, count(*) FROM outbox WHERE status='failed' AND created_at > now()-interval '1 day' GROUP BY 1;` plus the n8n Executions list filtered to errors |
| Weekly (ops) | Review escalations: SLA %, root causes | Dashboard scorecard; `SELECT root_cause, count(*) FROM cases WHERE resolved_at > now()-interval '7 days' GROUP BY 1;` |
| Weekly (admin) | Handle unknown-number messages | Dashboard alert → View |
| Monthly | Calibration review: add misrouted messages to the tests, then tune (§4.6) | `npm test` |
| Monthly | AI cost check | `SELECT count(*) FROM feedback WHERE scoring_method='hybrid' AND created_at > now()-interval '30 days';` × roughly 1–2k tokens per message |
| Quarterly | Rotate secrets (WhatsApp token, API keys, dashboard password, `RFE_DASHBOARD_SECRET`) | n8n Credentials / env |
| On staff change | Update `staff_contacts` (set `active=false` for leavers) | SQL or a simple admin form |

## 10.2 Adding a location (about 5 minutes, no workflow changes)

```sql
INSERT INTO branches (code, name, region_id, timezone, phone, google_review_url)
VALUES ('SHF-1', 'Sheffield', (SELECT id FROM regions WHERE name='North'), 'Europe/London', '0114 000 0000', 'https://g.page/r/.../review');
INSERT INTO staff_contacts (name, role, branch_id, whatsapp, email) VALUES
 ('Sheffield Team', 'branch_team', (SELECT id FROM branches WHERE code='SHF-1'), NULL, 'sheffield@yourco.com'),
 ('Alex Lead', 'branch_lead', (SELECT id FROM branches WHERE code='SHF-1'), '+44…', 'alex@yourco.com');
```

Then make sure the DMS sends `branch_id: "SHF-1"`. The branch appears in the dashboard, trends, digests and routing automatically. A new **region** is one row in `regions` plus its `regional_manager` contact. **Other countries or timezones:** set `branches.timezone` (quiet hours are per branch) and `general.default_country_code` for number parsing. Localise templates via `app_settings.templates`. Submit WhatsApp templates in each language and set `whatsapp.template_language`.

## 10.3 Changing behaviour safely

| Change | Where | Rebuild needed? |
|---|---|---|
| Thresholds, SLAs, recipients per tier, channels, quiet hours, cool-down, repeat-customer window | `app_settings` (SQL) | No |
| Customer and staff message wording | `app_settings.templates` override | No |
| WhatsApp template wording | Meta (re-approval), with a new version name in `app_settings.whatsapp` | No |
| Scoring vocabulary, rules, routing logic, pages | `src/*.js`, then `npm test` and `npm run build`, then re-import the changed workflows (or run `scripts/deploy-n8n.js`) | Yes |
| Database functions | `database/002_functions.sql` (idempotent `CREATE OR REPLACE`), then re-run it | No |
| Schema | Add a new migration file `database/0xx_*.sql` using `IF NOT EXISTS` | No |

Never edit the generated Code nodes in the n8n UI. They are overwritten by the next deploy, and `npm run check` fails in CI if the files diverge from `src/`.

## 10.4 Data retention and privacy

- Personal data lives in `customers` (name, phone, email) and in the free text of `feedback.customer_text` and `feedback_messages.body`.
- Suggested retention: keep identifiable feedback for 24 months, then anonymise it while keeping scores for trends:

```sql
UPDATE customers SET name = NULL, email = NULL, phone = NULL WHERE id IN (
  SELECT customer_id FROM jobs GROUP BY customer_id HAVING max(completed_at) < now() - interval '24 months');
UPDATE feedback_messages SET body = '[removed]', payload = NULL WHERE received_at < now() - interval '24 months';
```

- **Subject access or erasure request:** find the customer by phone and export or anonymise with the same statements scoped to that customer.
- The AI receives only the message text, branch, service, vehicle and first name. It never receives phone numbers or emails.

## 10.5 Scaling

Rough capacity of the default setup (single n8n instance, small Postgres):

| Load | What happens |
|---|---|
| 5–50 branches, ~200–5,000 jobs/day | Default setup. The dispatcher sends 25 messages per tick, and is woken on demand, so bursts clear within seconds. |
| 50+ branches, or more than 5,000 jobs/day | Raise the claim size (`rfe_claim_outbox(100)`). Run n8n in **queue mode** (Redis + 2+ workers). The outbox's `FOR UPDATE SKIP LOCKED` makes parallel dispatchers safe. |
| WhatsApp throughput | Meta messaging tiers (1k → 10k → 100k → unlimited unique customers per 24 h) grow with quality rating. Watch the quality rating in WhatsApp Manager. |
| Claude throughput | One short call per inbound message, with a 60 s timeout and 3 retries. If you hit rate limits, the rules fallback keeps routing working. Request a higher tier, or batch non-urgent re-scoring. |
| Database | Every hot query is indexed by branch and date. At millions of rows, add monthly partitioning on `feedback_messages` and `outbox` (the append-heavy tables), and archive sent outbox rows older than 90 days. |
| Dashboard | One SQL call per refresh, with 50 feed rows per page. For heavy BI, point Metabase or Power BI at a **read replica**. |

**High availability:** managed Postgres with failover, n8n queue mode with 2+ workers behind a load balancer, and webhooks handled by the main or webhook processes. Messages survive restarts because they live in the database. Rows stuck in `sending` for more than 10 minutes are reclaimed automatically.

## 10.6 Security

- **Webhooks.** WhatsApp is HMAC-verified (`RFE_WA_APP_SECRET`). Twilio is signature-verified (`RFE_TWILIO_AUTH_TOKEN`). Job intake uses a header key. Internal endpoints use a separate header key.
- **Dashboard.** Basic auth plus a signed 12 h session token for the API calls. For named users and MFA, put `/webhook/rfe/dashboard*` and `/webhook/rfe/case*` behind an identity-aware proxy (Cloudflare Access, Google IAP or Azure App Proxy). The names people type are an audit convenience, not authentication.
- **Case links.** 128-bit random tokens, sent only to staff. Anyone holding a link can act on that one case, so do not forward alerts outside the company. For stricter control, use the proxy above.
- **SQL.** Every payload reaches Postgres base64-encoded and is parsed as JSON inside `plpgsql`, so there is no string-built SQL anywhere. The dashboard API whitelists operations and actions.
- **Prompt injection.** Customer text is fenced and treated as data. The AI output is schema-validated and can only raise severity, and it never triggers a send by itself.
- **Credentials.** Kept only in n8n's encrypted credential store and env. Nothing secret is stored in workflow JSON or in this repository.

## 10.7 Monitoring and alerting

- **RFE 00 - Error Alerts** emails the admin on any workflow failure.
- Useful health queries (add them to your monitoring):

```sql
-- messages stuck or failing
SELECT status, count(*) FROM outbox WHERE created_at > now() - interval '1 hour' GROUP BY 1;
-- requests not sent within 10 minutes (dispatcher down?)
SELECT count(*) FROM feedback_requests WHERE status = 'queued' AND queued_at < now() - interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.request_id = feedback_requests.id AND o.next_attempt_at > now());
-- AI fallback rate (should be near 0)
SELECT round(avg((scoring_method = 'rules')::int), 3) FROM feedback WHERE created_at > now() - interval '1 day' AND customer_text IS NOT NULL;
-- open escalations past SLA
SELECT count(*) FROM cases WHERE status = 'open' AND ack_due_at < now();
```

## 10.8 Roadmap ideas (v2+)

- Voice-note transcription (WhatsApp audio → speech-to-text → score).
- Read Google Business Profile reviews into the same feed, and match them to jobs where possible.
- Technician-level scorecards (the data already exists in `jobs.technician`).
- Per-issue routing (for example billing disputes copied to accounts), using a new role in `staff_contacts` plus `notify_roles`.
- Two-way WhatsApp inbox for staff (reply from the dashboard to any message within 24 h).
- Weekly AI summary of themes per branch for the management meeting.
