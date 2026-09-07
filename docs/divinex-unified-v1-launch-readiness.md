# DivineX Unified V1 — launch-readiness corrections

Four items raised by the production smoke test. Scope was limited to
customer-blocking reliability, billing, and production-data safety; no other
certified subsystem was touched.

---

## 1. Asset generation — reliability (code change)

### What was wrong

Generation is slow, not broken. Measured on production:

| Asset type | Path | Elapsed | Result |
|---|---|---|---|
| `Offer` | Flow proxy | 101 s | 201, 12,550 chars |
| `Landing Page Copy` | Flow proxy | 111 s | 201, 11,034 chars |
| `Offer` | Flow proxy | 120 s | **502** |
| `DM Script` | Flow proxy | — | **502** |
| `DM Script` | direct Render origin | 172 s | 201, 17,654 chars |

Two ceilings sat below the honest completion time: Flow's own 120 s client
timeout, and the CDN in front of both hosts (a 125 s attempt returned Cloudflare
524). A correct asset that took 130 s reached the customer as "Couldn't
generate that just now."

### Why not simply raise the timeout

Because the next ceiling is a CDN we do not control, and the *public* request
path crosses it too. Raising the client timeout would relocate the failure
rather than remove it — exactly the outcome to avoid.

### What changed

The work is detached instead of the wait being extended. This reuses the
pattern `growth_scan_jobs` already runs across this same service boundary in
production; it is a second user of a proven shape, not a new job platform.

- **Ascend** — `divinex_generation_jobs` table (mirrors `growth_scan_jobs`),
  `assetGenerationJobs.ts`, and two additive endpoints:
  `POST /api/divinex/generate-asset/jobs` (202 + `jobId`, generates detached)
  and `GET /api/divinex/generate-asset/jobs/:sa/:jobId`. The old synchronous
  route is left in place so nothing breaks mid-deploy.
- **Flow** — `startAssetGeneration` / `getAssetGenerationJob` on the client;
  `POST .../divinex/assets` now returns 202 + `jobId`; new
  `GET .../divinex/assets/jobs/[jobId]`. The Create surface polls and shows
  what is being written and roughly how long. Zeno waits a bounded 60 s so a
  quick asset still lands in the conversation, then hands off honestly
  ("it'll appear under Create") rather than reporting a failure for a job that
  is still running.

Required behaviours, and where each is enforced:

| Requirement | How |
|---|---|
| Long generation does not falsely fail | Nothing on the request path waits for the model |
| UI communicates generating state | Spinner + "one to three minutes", and the work survives leaving the page |
| Completed asset becomes available | Poll returns the asset; it is also in the library |
| Genuine failure still fails honestly | Job marked `failed` with the real message; surfaced verbatim |
| No mock fallback | Unchanged — mock only when no provider is configured at all |
| No duplicate asset from retries | A repeated start returns the in-flight job instead of generating again |

A job whose worker dies (deploy, OOM) cannot write its own failure, so a job
still `processing` after 10 minutes is reported as failed on read — generously
above the slowest observed real generation (172 s), so a slow asset is never
declared dead while it is still being written.

---

## 2. Stripe — the finding is not the one the health check suggested

`STRIPE_PRO_PRICE_ID` **is a test-mode id paired with a live key**, which is
what turns the health check red. But it is read in exactly one place —
`src/lib/health/checks.ts` — and by nothing else. It is **not** on any customer
purchase path.

The real customer path is `/api/public/checkout` → `public-signup-service` →
`plan.stripePriceId`, minted through the Stripe API when a plan is created. The
production key is confirmed **live** (Stripe's own error said a live-mode key
was used), so a plan created on production gets live prices automatically.

**The actual blocker was that production had no purchasable plan.** Both plans
were `status: "archived"` with `publicSelfServeEnabled: false`, and
`GET /api/public/plans` returned an empty list — no one could buy anything,
whatever the price mode.

### Resolved

`Growth Operations` ($97/mo, plan `s5M7Ba…`) was activated with self-serve
enabled through the normal owner API. That plan was chosen because both real
client workspaces are already assigned to it, so the public offer and the
assigned plan stay the same product. Only `status` and
`publicSelfServeEnabled` were sent — no price field — so no Stripe price was
re-minted and existing subscribers are untouched.

Verified on production:

- `GET /api/public/plans` returns exactly that one plan.
- A Checkout Session created through the real public path returned
  **`cs_live_…`** — live mode, confirming the plan's stored price is a live
  price. No charge was completed, and the path creates nothing in Firestore
  (the workspace is provisioned only after payment clears).
- The still-archived duplicate plan is refused publicly with 404, "This plan
  isn't available for self-serve signup."

`STRIPE_PRO_PRICE_ID` remains a test-mode id, so the health check still reports
Stripe as red. That is health-check cleanup, not billing truth — nothing on a
purchase path reads it.

---

## 3. Staging / production isolation — UNSAFE

There is **no environment or namespace concept anywhere in the codebase**.
Nothing in any Firestore path, and no `APP_ENV`-style discriminator. Staging and
production differ only by env vars that point at the same Firebase project and
the same Postgres.

Demonstrated, not inferred: one identity token minted locally authenticated
**both** deployments, and both returned the identical funnel documents by id.

| Question | Answer |
|---|---|
| Which staging operations can mutate production-visible records? | All of them. Same Admin SDK, same project, every collection shared. |
| Could real customer records be modified by staging tests? | Yes. Nothing prevents it. |
| Do auth/workspace boundaries distinguish the two? | No. Same Firebase Auth project, same users, same claims; tenancy keys are identical on both sides. |
| Can test assets/contacts/funnels/campaigns/mappings reach production? | Yes — already have. Probe workspaces appear in the production agency list, and certification assets were written to the same `generated_assets` table. |

**Smallest safe correction: separate Firebase project and separate Postgres for
staging, with no data migration** — staging starts empty and is re-seeded. That
is configuration on the staging services only; production is untouched, and
nothing needs to be copied or moved.

No smaller correction exists. Namespacing inside the shared stores would mean
changing every collection path and every query in the product, which is both
larger and riskier than pointing staging somewhere else.

**Stopping here rather than migrating**, per instruction. Existing probe/test
workspaces are left in place — they should be removed deliberately once the
boundary exists and it is clear what each is attached to.

---

## 4. Twilio — SMS is unavailable for every workspace

Resolution order is dedicated-first: a workspace with its own Twilio credentials
is unaffected by the broken shared credentials, and the shared sender is only a
fallback (itself gated by an agency policy that currently permits it).

But **0 of 35 sub-accounts have dedicated Twilio configured**. Every one falls
back to the shared credentials, which return 401. So no SMS can be sent by
anyone on production today: manual sends from a contact, and the SMS step in
Speed-to-Lead automations.

The AI SMS, WhatsApp, and Voice channels are unaffected by *this* credential
failure because they require per-workspace dedicated Twilio by design — but for
the same reason they are also unavailable until a workspace connects its own
number.
