# P0.6 — final certification record

## Critical customer journey: CERTIFIED

`scripts/verify-p06-critical-journey.mts` — 27 assertions, end to end, all
against real state. The plan item comes from the build path being certified,
never inserted by hand.

Real Zeno build → real artifact in Firestore (`draft`) → appears in Growth
Plan in customer nouns → Zeno completion, Growth Plan and artifact all agree →
preview path exposed → **approving does NOT publish** → an approved artifact is
still not publicly renderable → foreign workspace artifact absent in both
directions → no internal metadata in the customer completion.

**Gate I (publication) deliberately not exercised**, with reason: flipping a
probe funnel to `published` would create publicly-renderable state on a live
deployment. Gate H (the mandatory half — unpublished artifacts are not
publicly renderable) is proven instead, both before and after approval. This
is an explicit omission, not a skipped check reported as a pass.

## Suite sweep

| Suite | Result |
|---|---|
| IA consistency | IA CONSISTENT |
| Approval states (P0.4) | CERTIFIED |
| Hero fold | HELD |
| Image Director (adversarial) | CERTIFIED |
| Landing Page Critic | CERTIFIED |
| P0.5 resolution + Critic | 41/41 |
| P0.5 live E2E | CERTIFIED |
| Image Director E2E | CERTIFIED |
| Zeno context/security | 30/30 |
| Zeno live behavior (B/C/G) | CERTIFIED |
| U1 response boundary | CERTIFIED |
| Super Admin projections | 30/30 |
| Super Admin UI | 34 assertions |
| Invitation provenance (production) | 19/19 |
| Deployment provenance | **1 failure — see POST-LAUNCH** |
| Production build (Flow + Ascend) | Clean |

## Growth Plan authority model

Home is the canonical plan surface; the execution half is a **read-time
projection** (`lib/intelligence/growth-plan-execution.ts`) over the artifact's
own status. Nothing is persisted, so the plan cannot drift out of agreement
with the artifact — there is no second copy to drift.

`approved` renders as **"Approved — not published yet"**. The law is in the
label, so the surface structurally cannot imply Approved = Published.

## Findings, classified

### BLOCKER
None.

### LAUNCH FIX
None outstanding.

### POST-LAUNCH

1. **Ascend staging `/version` returns 404** — the deployment-provenance suite
   cannot confirm which commit Ascend staging serves. Infrastructure
   visibility, not a customer path. **Matters for P0.7**, which works on
   Ascend.
2. **Production Stripe positive control not established.** `app.divinex.io`
   health and version endpoints are auth-gated, so Stripe mode cannot be read
   from outside without credentials, and Render env vars were not inspected.
   **Assessed as NOT launch-blocking**: the Customers view degrades safely to
   "Billing status unavailable" rather than inferring, the failure path is
   proven, and the customer *purchase* path is separate from admin billing
   visibility — a genuinely misconfigured Stripe would fail checkout loudly and
   immediately. Verify during human acceptance by loading Super Admin →
   Customers → "Check billing" in production.
3. **H — Ascend diagnosis absent from `DivinexProfileSnapshot`.** The data
   exists (`growth_scans.topOpportunities`, `growth_timelines.recommendationProgress`)
   but the shared contract does not carry it, so Zeno cannot cite an Ascend
   conclusion. Narrow, known seam; deliberately not extended.
4. **No DOM test environment.** UI certification renders shared primitives via
   `react-dom/server`; full browser-lifecycle testing is unavailable.
5. Deferred by standing decision: entitlement re-keying, multi-membership
   migration, Drizzle re-baseline, native image generation, second disposable
   shell-eligible probe workspace.

## For human acceptance

Short pass only:

1. Sign in → land on Home. The recommendation reads first; **Your growth plan**
   sits directly beneath it.
2. Ask Zeno to build a landing page. Confirm the completion names an outcome,
   review items and a next action — **no ids, no capability names**.
3. Confirm it appears in the growth plan as "Built — ready for your review".
4. Click **Preview and review** — the draft renders.
5. Confirm nothing says it is live, and that publishing is described as a
   separate step.
6. Move across Home / Create / Leads / Performance / Intelligence — no old
   Flow/Ascend module naming.
7. Super Admin → Customers → **Check billing** (the Stripe positive control
   above).
