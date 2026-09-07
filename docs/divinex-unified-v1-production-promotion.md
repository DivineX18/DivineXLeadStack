# DivineX Unified V1 — production promotion record

Certified compositions, promoted without modification.

## What moves

| | Flow (DivineXLeadStack) | Ascend (DivineX-Business-Intelligence) |
|---|---|---|
| Source branch | `dev` | `ascend-staging` |
| Source SHA | `f680e9c` | `9186e9e` |
| Destination | `main` @ `8acec52` | `main` @ `5311d9b` |
| Commits moving | 104 | 20 |
| Destination ahead by | 0 | 0 |
| Fast-forward | YES | YES |
| Diff | 230 files, +20561 / -1182 | 36 files, +5378 / -1470 |

No squash, no rewrite, no cherry-pick, no omitted commits. Both promotions are
pure fast-forwards, so production `main` ends at exactly the certified SHA.

## Services affected

| Service | Repo | Branch | Domains |
|---|---|---|---|
| `ascend-crm` | Flow | `main` | `crm.divinex.io`, `app.divinex.io` |
| `ascend-bi-api` | Ascend | `main` | `ascend.divinex.io`, `divinex-business-intelligence.onrender.com` |
| `ascend-onboarding-cron` | Ascend | `main` | — |
| `ascend-payouts-cron` | Ascend | `main` | — |

`app.divinex.io` and `crm.divinex.io` are both served by Flow (the shell picks
`full_ascend` vs `crm_only` per request). `ascend-bi-api` is internal
infrastructure reached over the bridge, not a third customer-facing product.

## Out-of-band steps

1. **Firestore rules** — `firestore.rules` gains three server-only blocks
   (`funnelStats/{funnelId}`, its `days/{day}` subcollection, and
   `campaigns/{campaignId}`; +34 / -1 lines). Rules deploy separately from code:
   `firebase deploy --only firestore:rules,firestore:indexes`.
   No `firestore.indexes.json` change.
2. **Ascend Postgres** — none. The one schema object in this set
   (`lib/db/manual/2026-09-02_invitations.sql`, additive and idempotent) is
   already present in the live database. Verified against `information_schema`.

## Shared-infrastructure facts established before promotion

These are properties of the existing deployment, not changes made here.

- **One Firebase project serves staging and production Flow.** Production
  accepted a session minted from the same admin credentials as staging, so
  Firestore — including `workspaceMappings` — is a single store. Staging
  certification data is therefore already visible to production and was not
  copied there; removing it would break the certified workspace, so it is
  reported rather than "cleaned".
- **One Postgres serves staging and production Ascend** (38 business profiles,
  including real customer records).

## Pre-existing production configuration defects

Found before promotion, unrelated to the code being promoted, and not fixable
from this side because the values are secrets held in Render.

| Check | Status | Cause |
|---|---|---|
| Stripe live ping | error | `STRIPE_PRO_PRICE_ID` is a **test-mode** price id while `STRIPE_SECRET_KEY` is live. Stripe: "No such price … a similar object exists in test mode, but a live mode key was used." Pro-plan checkout cannot succeed until the live price id is set. |
| Twilio credentials | error | `/Accounts` returns 401 — the account SID / auth token pair on production is invalid. Agency shared-sender SMS cannot send. Per-sub-account Twilio is unaffected (each carries its own credentials). |

Configured and reachable on production: OpenRouter, Resend, QStash, Firebase,
Stripe key/secret/webhook (the *price id* is the sole failure).
Absent and optional: Firecrawl, Vapi, Meta. Meta absent keeps social publishing
dark, which is the intended V1 state pending App Review.

## Why the Ascend promotion is load-bearing

Production Ascend serves the intelligence bridge
(`/api/internal/intelligence/snapshot` → 401 JSON, route present) but returns
404 for `/api/divinex/generate-asset`. Asset Studio generation is dead on
production today. The 20 promoted commits deliver that router along with the
evidence-safety boundary.
