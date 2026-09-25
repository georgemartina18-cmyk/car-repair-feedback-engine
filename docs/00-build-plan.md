# 0. Build plan

## Goal

Every completed visit becomes feedback. Each piece is scored for sentiment **and** severity, routed by those scores into **Ready to Post**, **In Queue** or **Escalated**, checked against the customer's history, answered with a human-reviewed draft, and shown on **one dashboard** for all locations.

## Requirements traceability

| # | Requirement | Where it is implemented | Proof |
|---|---|---|---|
| 1 | Automated collection on job completion, WhatsApp first with SMS/email fallback, immediate, no manual step | WF01 intake → outbox → WF02 dispatcher (woken instantly); quiet hours; fallback rules | `db.integration` tests 1, 11, 12; live n8n run |
| 2 | Granular sentiment + severity, reading the actual words, preserving wording | `src/scoring.js` (rules + Claude + blend); `feedback.customer_text` verbatim | `scoring.test.js` calibration, including the two brief examples; quotes-verbatim test |
| 3 | Score-based routing into three lanes: Ready to Post (never auto-published), In Queue (private, no alerts), Escalated (immediate lead + regional + HQ) | `src/routing.js`, `app_settings.routing`, `ready_to_post` table | `workflows.test` routing path; integration tests 4, 6, 10 |
| 4 | Repeat customers: 2nd+ negative escalated regardless of score | `rfe_lookup_inbound` history + `applyRepeatCustomerRule` before routing | `scoring.test` (both directions); integration test 9 |
| 5 | Drafted, personalised replies for all negative feedback; human sends, never automatic | `src/drafts.js` + AI `draft_reply`; `response_drafts`; Send only from the case page or dashboard | Integration tests 6 and 8 (never auto-sent, edited and sent by a named person) |
| 6 | One dashboard: every entry, location, score, status labels; filters; trends; no inbox hopping | WF07 + `dashboard/index.html` + `rfe_dashboard()` | Integration test 18; live browser test |
| - | Store all feedback, scores, routing actions and timestamps | `feedback`, `cases`, `case_events`, `outbox`, `feedback_messages` | Case timeline test |
| - | Built for growth | Branches and contacts are data; outbox with `SKIP LOCKED`; queue-mode ready | [10-maintenance-scaling.md](10-maintenance-scaling.md) |

## Phases

| Phase | Duration | Work | Exit criteria |
|---|---|---|---|
| **0. Accounts** | Week 1 (parallel) | Meta WhatsApp Business + templates submitted; Twilio number; SMTP; Anthropic key; Postgres | Templates **Active** |
| **1. Foundation** | Week 1 | Database; settings; branches and staff loaded; credentials; import 9 workflows | `npm test` green; smoke test from `simulate.js` |
| **2. Integration** | Week 2 | DMS → `/rfe/job-completed`; Meta and Twilio webhooks | A real completed job triggers a WhatsApp within 1 minute |
| **3. Pilot** | Weeks 3–4 | 1 branch live; daily threshold review; staff briefing | UAT 20/20; SLA acknowledgement ≥ 90%; no lost messages |
| **4. Rollout** | Weeks 5–6 | Half the branches, then all; digest on; old inboxes retired | Every location visible on the dashboard; management uses it weekly |
| **5. Iterate** | Ongoing | Tune thresholds; add calibration examples; v2 roadmap | Monthly review |

## Roles

| Role | Responsibility |
|---|---|
| Project owner (ops) | SLAs, escalation chain, go/no-go |
| n8n/IT admin | Setup, credentials, monitoring, deployments |
| DMS integrator | The job-completed webhook |
| Branch leads | Escalations, In Queue items, sending drafts |
| Marketing | Ready to Post queue, review policy |

## What is intentionally simple in v1

- **Scoring.** One Claude call per message, plus a deterministic rules engine. There is no custom ML model, so no training data or retraining is needed.
- **Dashboard.** A single page served by n8n. You can add a BI tool on top later.
- **Staff identity.** Case links and the dashboard login plus a typed name. For per-person SSO, put the URLs behind an identity-aware proxy.
- **No automatic publishing** of anything to review sites.
