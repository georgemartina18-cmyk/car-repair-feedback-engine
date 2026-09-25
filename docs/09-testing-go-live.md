# 9. Testing plan and go-live checklist

## 9.1 Automated tests (run on every change)

```bash
npm test                                   # unit + workflow tests (no database needed)
RFE_TEST_DATABASE_URL=postgres://user:pass@localhost/rfe_test npm test   # + full database pipeline
npm run check                              # workflows/*.json match src/ (CI guard)
```

| Suite | What it proves |
|---|---|
| `tests/scoring.test.js` | The calibration set (including the brief's two examples) lands in the right lane. Severity ordering. "bad" alone does not escalate. Quotes are verbatim. Repeat-customer rule (both directions). Taps and star ratings. AI output clamping, refusal, truncation and error fallback. The AI can raise severity but can never hide a rules safety flag. The request shape is correct (structured output, low effort, fallbacks, injection guard). |
| `tests/channels.test.js` | Phone normalisation. Job payload validation. WhatsApp, Twilio and web-form parsing (text, buttons, voice notes, statuses). Opt-out and consent intents. Meta signature. Channel choice and error classification. Template escaping. Draft content. |
| `tests/workflows.test.js` | Every workflow is valid n8n JSON: nodes connected, credentials present, SQL payloads base64-encoded, webhook paths unique. **The generated Code nodes run** in an n8n-like context for intake, dispatch, signature verification, scoring and routing (including the Claude-failure path), page rendering, and dashboard session auth. |
| `tests/db.integration.test.js` | 19 scenarios against real PostgreSQL, from job to request to send, then tap, escalation, case actions, repeat customer, positive/consent/posted, WhatsApp→SMS fallback (sync and async), retry back-off, opt-out, unknown sender, SLA escalation, reminder/expiry, dashboard filters and digest scoping. |

**Also verified on a real n8n 2.40 instance.** All 9 workflows were imported and published with mocked WhatsApp and Claude endpoints. The following worked end to end: intake auth, validation and dedupe; the dispatcher's immediate WhatsApp send; webhook verification; button tap → ask for details; the angry message → hybrid scoring → P1 alerts to three managers; the case page acknowledge and edited-draft send; the web form → Ready to Post; SMS → In Queue; WhatsApp 131026 → SMS fallback; the SLA monitor escalating to the ops director; and the dashboard in a real browser (login, live data, Mark as posted, Send reply).

## 9.2 User-acceptance test (staging, 1 branch, 1–2 days)

Use real phones owned by staff. Tick each line.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Request on completion | Close a test job in the DMS | WhatsApp template arrives within 1 minute, with name, branch, service, reg and 3 buttons |
| 2 | Quiet hours | Close a job at 21:00 | Arrives at 08:30 next morning |
| 3 | Positive | Tap 😀, then write something specific and kind | Thank-you + review link + consent question. Dashboard shows **Ready to Post**. No staff alert |
| 4 | Consent | Reply YES | Ready to Post item shows consent **Yes** |
| 5 | Mild | Write "It was fine, a bit slow" | Dashboard shows **In Queue**, score about 47, severity Low, with a draft. **No** WhatsApp alert |
| 6 | Severe | Write "You ruined my car and wasted my whole day" | Within 1 minute, lead + regional + HQ get WhatsApp + email **🚨 ESCALATED**. Dashboard shows **Escalated** |
| 7 | Safety | Write "brakes grinding since the service" | Escalated **P1**, reason "possible safety issue". Draft contains the "don't drive it" advice |
| 8 | Draft never auto-sent | After 5 and 6, check the customer phone | No reply arrived except the automatic "tell us more" prompts |
| 9 | Human reply | Open the alert link → Acknowledge → edit draft → Send | Customer receives the edited text. Case shows Contacted, with the actor's name in the timeline |
| 10 | Repeat customer | Set `survey_cooldown_days` to 0. Close a 2nd job for the same phone. Reply "bit late again" | **Escalated (P2)** despite mild words. Alert says REPEAT CUSTOMER. The draft acknowledges the history |
| 11 | SLA escalation | Create a severe item and do not acknowledge it for 30 min (or temporarily set `ack_sla_minutes` to 2) | Ops director gets ⏰ ESCALATION, once per level |
| 12 | Not on WhatsApp | Use a landline or a number without WhatsApp | SMS arrives instead |
| 13 | Email-only customer | Job with email and no phone | Email with 3 buttons. The form works on a phone, and the submission is scored |
| 14 | Opt-out | Reply STOP | Confirmation arrives. A new job for that number returns `suppressed: opted_out` |
| 15 | Duplicate webhook | Send the same job twice | Second call returns `duplicate`. Only one message is sent |
| 16 | Dashboard filters | Filter by location, date, score 0–40, and each status tab | The feed and counts match |
| 17 | Ready to Post | Edit the text, tick Google, Mark as posted | Status becomes **Posted**. Nothing was auto-published anywhere |
| 18 | Digest | Next morning 07:45 | Leads get their branch only. The regional manager gets their region. HQ gets everything, with declining flags |
| 19 | AI outage | Temporarily break the `RFE Anthropic Key` credential | Feedback is still scored (method `rules`) and routed. Nothing is lost |
| 20 | Failure alert | Stop Postgres briefly during a test | Admin receives "[RFE] Workflow failed" |

## 9.3 Go-live checklist

**Accounts and compliance**

- [ ] WhatsApp templates **Active**. The display name is approved, and quality rating and messaging tier are checked.
- [ ] Customer consent for service messages is covered by your terms and privacy notice (a post-visit feedback request is a transactional/service message, but include it explicitly). STOP handling is tested.
- [ ] Privacy notice updated: feedback storage, AI processing (Anthropic as a processor; check your DPA), and the retention period (§10.4).
- [ ] Review-link policy decided. The default invites **every** respondent, never only happy ones, to stay within Google's review policy and consumer-review rules.
- [ ] Staff WhatsApp numbers have messaged the business number once (opt-in for alerts).

**Configuration**

- [ ] `general.public_base_url`, `brand_name` and `support_phone` are set. `branches.google_review_url` and `phone` are filled in for every branch.
- [ ] Every branch **code matches the DMS** exactly.
- [ ] Each branch has at least one `branch_lead` with WhatsApp **and** email. Each region has a `regional_manager`. HQ and ops director are set.
- [ ] `RFE_WA_APP_SECRET`, `RFE_TWILIO_AUTH_TOKEN` and `RFE_DASHBOARD_SECRET` are set (signatures and sessions enforced).
- [ ] The error workflow is set on workflows 01–08. `RFE_ADMIN_EMAIL` is monitored.
- [ ] SLAs and escalation chains are agreed with operations and set in `app_settings.routing`.
- [ ] Backups: daily Postgres backup plus point-in-time recovery, with a restore tested.

**Technical**

- [ ] `npm test` passes, including the database suite, on the release commit.
- [ ] HTTPS is valid. The webhooks are reachable from the internet. The dashboard sits behind SSO or a VPN if required.
- [ ] n8n execution-data pruning is enabled (`EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=336`).
- [ ] Load check: `simulate.js` has run for 50 jobs. Dispatcher runs take under 20 s and nothing is left pending.

**People**

- [ ] 20-minute briefing for branch leads covering the alert, the case page, and editing and sending drafts. Tone guide: never argue, never admit liability in writing, move to a phone call quickly.
- [ ] Owner named per branch for the **In Queue** list (checked daily).
- [ ] Owner named for the **Ready to Post** queue (marketing or the branch lead).
- [ ] Old inboxes and WhatsApp groups: announce the cut-over date and redirect people to the dashboard.

**Rollout**

1. **Pilot:** 1 branch, 2 weeks. Tune the thresholds with real messages (§4.6).
2. **Wave 2:** half of the branches, 2 weeks.
3. **All branches.** After 2 weeks of clean operation, retire the old inboxes.

**Rollback:** deactivate **01 Job Completed Intake**. No new requests go out, while replies still in flight keep being processed.
