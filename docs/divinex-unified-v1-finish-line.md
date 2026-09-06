# DivineX Unified V1 — Finish Line

**Supersedes the beta/P0–P3 framing in `divinex-unified-product-standard.md`.**
That document remains governing for *product principle, quality bar and
standing rules*. This one replaces its **roadmap**: there is no beta scope and
no open-ended P1/P2 — there is a finite V1, a certification, and a feature lock.

**Objective: move from BUILD MODE to SELL MODE.** Anything not required to make
V1 commercially credible is V1.1+, by default, without further debate.

---

## Requirement status — the finite checklist

Legend: **PASS** = exists and is certified · **FIX** = exists, needs work ·
**MISSING** = must be built.

| # | V1 requirement | Status | What remains |
|---|---|---|---|
| 1 | Stable Ascend intelligence + Growth Scan | **FIX** | Staging `OPENROUTER_API_KEY` 502s (owner action, diagnosed: the local key authenticates, staging's does not). Nothing in this repo can fix it. |
| 2 | Business-aware Zeno | **PASS** | Intelligence reaches generation and materially changes it; page context is ownership-proofed. |
| 3 | Recommendation → Fix/Create with Zeno | **BUILT** | Shipped (ask-Zeno bridge + action on the recommendation card). Certification of the rendered path needs a Complete-mode workspace + live intelligence. |
| 4 | Zeno orchestration of core Flow capabilities | **PASS** | Forms and booking shipped; 30/30. Social deliberately out of V1 (Meta review). |
| 5 | High-quality landing pages/funnels | **PASS** | Sales Argument Engine + Critic + art direction; quality battery passed 3 industries. |
| 6 | Production-quality basic multi-step funnels | **PASS** | `multi_step_form` section; 20/20 in a real browser incl. CRM, measurement and phone. |
| 7 | Launch-quality template library (~20–30) | **PASS** | 24 templates, 7 architectures × 7 design systems; 41/41 including a distinct-structure proof. |
| 8 | CRM | **PASS** | Mature licensed infrastructure. |
| 9 | Email / SMS | **PASS** | Certified send path (write → draft → approve → send). |
| 10 | Social creation + scheduling | **FIX** | Publisher works. **Meta App Review is an external blocker** — cannot be closed by code. |
| 11 | Automation / workflows | **PASS** | Visual builder + executor + QStash. |
| 12 | Lead magnets + marketing assets | **PASS** | Asset Studio reachable from unified Create via the machine bridge. |
| 13 | Forms | **PASS** | Zeno builds real, embeddable forms with refusals that protect conversion. |
| 14 | Booking | **PASS** | Zeno builds booking pages as drafts; creation extracted to a shared service. |
| 15 | Campaign Plan / review / approve | **PASS** | Control centre on Create: approve, ask for changes, drop; 17/17. |
| 16 | Funnel measurement (views, conversions, rate) | **PASS** | Shipped. Real-browser E2E: 4 visits → 1 submission → 1 real lead → 0.25, reported per page. Unvisited pages report *no data*, never 0%. |
| 17 | Reliable publishing | **PASS** | Explicit publish boundary; approving is not publishing. |
| 18 | Workspace isolation | **PASS** | Re-checked on every read/write; certified per feature, including the new telemetry. |
| 19 | Billing / access control | **PASS** | Client Billing v1: plans, gates, checkout, dunning, paywall. |
| 20 | Mobile + desktop QA of critical workflows | **MISSING** | No systematic mobile pass has been run against the customer journeys. |

**Remaining: requirement 20 (mobile/desktop QA), then journey certification
A–E and final certification. Requirements 1 and 10 are owner/external actions
this repo cannot close.**

**Certification of 3, and of journeys A–E, needs an environment this repo does
not control**: the unified shell mounts only for a Complete-mode workspace, and
live recommendations need the intelligence bridge plus a working model key.
Locally those steps report UNAVAILABLE, which is never counted as a pass.

---

## Multi-step V1 — the smallest thing that is production-quality

**Decision: one new section type, not a form engine.** A `multi_step_form`
section rendered by the existing public renderer, submitting once at the end
through the existing `/api/forms/[id]/submit` route.

Why this shape: it inherits — rather than re-implements — CRM field mapping,
automation triggers, attribution capture, opt-out handling, workspace tenancy
and the conversion tracking just shipped. A parallel form engine would have to
re-earn every one of those, and would be the single largest source of new risk
in V1.

Required behaviour, all of it: multiple steps · progress indication · next/back
· per-step validation · answers persisted across steps (and across an
accidental refresh) · CRM field mapping · mobile-responsive · a completion
destination (thank-you or booking) · automation trigger fires · conversion
tracked.

**Deferred to V1.1: conditional branching and qualification scoring.** They are
not low-risk extensions — both change what "the next step" means, which is the
one thing this design deliberately keeps linear.

---

## Template library V1 — composed, not hand-built

**Do not author 30 pages by hand.** The library is the cross-product of what
already exists and is already certified:

- **7 genre frameworks** (`lib/funnels/frameworks.ts`) — real structural
  variation: lead magnet, VSL, challenge, application, tripwire, webinar,
  lead gen.
- **7 design packs** (`lib/funnels/design-packs.ts`) — real visual variation:
  classic, executive, bold, premium, startup, local business, wellness.

A template is a **named, curated pairing** of framework + design pack +
industry-specific default copy, with a preview. That yields 20–30 genuinely
distinct starting points, every one of which already publishes reliably,
adapts to brand, and is editable — because it is an ordinary funnel from the
moment it is created.

Templates must be usable by Zeno as starting architectures, which the framework
layer already supports (`create_funnel` selects stages within a framework).

**Not in V1: a template marketplace, per-template analytics, user-saved
templates.**

---

## Zeno scope for V1

Add **forms** and **booking** capabilities. Both are required by journeys A, D
and E and are the only hard gaps.

**Social stays out of Zeno for V1.** Publishing is externally blocked on Meta
App Review, so a capability that cannot execute would be a dead end in the
chat surface. The Social Planner remains usable directly. Revisit at V1.1 once
review clears.

Capabilities must serve outcomes, not read as CRUD: "build me a form to qualify
leads" produces a real, embeddable form wired into the page that needed it —
not a form floating unattached.

---

## The five journeys — certification targets

Each is certified end-to-end through the stages that apply:
UNDERSTAND → RECOMMEND → EXPLAIN → CREATE → REVIEW → APPROVE → EXECUTE → MEASURE.

| Journey | Blocked on |
|---|---|
| A · "I need more leads" | forms capability (4/13); measurement is now in place |
| B · "Leads aren't converting" | multi-step qualification (6); measurement in place |
| C · "Help me market my business" | nothing structural — needs journey certification |
| D · "Create a lead magnet campaign" | forms + booking capabilities; Campaign Plan UI (15) |
| E · "Why isn't my funnel generating leads?" | recommendation → Zeno (3) + measurement — both now shipped, needs certification on a Complete-mode workspace |

---

## Explicitly V1.1+ (do not delay V1 for any of these)

Autonomous closed-loop strategy changes · multi-touch attribution · an
experimentation platform · template counts beyond ~30 · conditional funnel
logic and qualification scoring · exposing every Flow capability to Zeno ·
social via Zeno · competitor feature parity · redesigns of certified systems ·
architectural cleanup with no customer effect.

---

## Execution order (dependency-ordered)

1. **Forms + booking capabilities for Zeno** — unblocks journeys A, D, E; no
   dependencies; smallest risk.
2. **Multi-step funnel section** — depends on forms being reachable; unblocks B.
3. **Template library** — depends on nothing new; composed from existing
   frameworks × design packs.
4. **Campaign Plan control centre** — makes the approve flow visible.
5. **Journey certification (A–E)** on a Complete-mode workspace.
6. **Mobile + desktop QA** of the critical workflows.
7. **Final certification → GO/NO-GO → FEATURE LOCK.**

Owner actions running in parallel, outside this repo: staging model key (1),
Meta App Review (10).

---

## After GO

**Unified V1 is feature-locked.** Development narrows to critical bugs,
security, reliability, customer-blocking issues, measured customer feedback,
and clearly justified V1.1 work. "Could be improved" is not a reason to reopen
the scope, and not a reason to withhold the lock.

---

## Investor / demo-quality gate (added to final certification)

V1 will be demonstrated live to prospective customers and to family investors.
So "it works" is not the bar for a full PASS. Every major customer-facing
capability is graded against all of:

technically functional · visually professional · intuitive without explanation
· polished loading / empty / error / success states · production-ready copy ·
intentional on desktop AND mobile · high-quality generated output · cohesive
with the rest of Unified · no placeholders, prototype artifacts or
developer-facing language · something we would demonstrate live without
steering around it · something we would charge for.

Grades: **PASS** · **PASS WITH NON-BLOCKING ISSUES** · **FAIL**.

A capability that technically works but would undermine confidence in a live
demo does not receive a full PASS. Final certification reports
**INVESTOR / DEMO READINESS — PASS / FAIL** and names any specific screen or
flow that should not be demonstrated until corrected.

This is a quality gate on work already in V1 scope. It is not licence to
expand scope, redesign certified systems, or chase perfection: the standard is
commercial quality, stability, cohesion and differentiation.

---

## V1.1 engineering priorities (recorded during certification, not built)

**1. Zeno tool/context routing — cost.** A single Zeno turn ships ~40,549 prompt
tokens and costs ~$0.20 on Opus 4.8, because all 25 tool schemas are sent on
every turn before the customer has said anything: 40k of those 40.5k tokens are
schemas. At 1,000 turns that is ~$200, at 10,000 ~$2,000, before any other AI
operation. The likely shape is `intent/router → relevant tool subset → capable
model → execute`, rather than `every message → all 25 tools → Opus`. Someone
asking for a booking page needs booking, funnel, form and business context, not
social, quotes and products. Pair the work with a measurement of AI cost per
active customer, because that is the gross-margin number, not the per-turn one.

**2. Bridge client must reject non-JSON responses.** Certification lost three
round trips to this: Ascend's Express server serves its SPA `index.html` as a
catch-all, so a bridge call to a mistyped path returned **HTTP 200 with
`text/html`** instead of 404. Flow's client took the 200, failed to parse the
`{ok, data, error}` envelope, and degraded every intelligence resource to
"Unavailable" — indistinguishable from "no data yet". A 200 masking a 404 is the
worst kind of integration failure because nothing anywhere reports an error.
The client must assert the response content-type is JSON and surface a real
integration error when it is not, rather than degrading silently.

**3. Guarantees must not be recommended without evidence (HIGH — first after
lock).** Real-business validation surfaced this: the scan recommended adding
*"Risk-free. If you don't see measurable progress in 30 days, we'll refund your
investment, no questions asked."* That is not a copy-taste issue. A refund
policy changes a business's economics and its obligations, and for a dentist,
roofer, attorney, restaurant, med spa or agency it is usually inapplicable or
actively harmful advice. Ascend must not manufacture one.

The narrow guard, which is deliberately not a prompt overhaul: recommend a
guarantee ONLY where there is evidence the business already offers one, or the
offer context clearly supports it. Otherwise reach for lower-risk trust
mechanisms it can support honestly — proof, testimonials, clear expectations,
process transparency, a consultation, case studies, credentials, plain terms.

Worth recording alongside it that the surrounding output was strong: the scan
named a real page, counted its CTAs, chose a placement and wrote specific copy.
The mechanism is sound; a few strategic assumptions need calibration, which is
exactly what validating against a real business is for.

**4. Health check should cover what it implies.** `OPENROUTER_API_KEY: ok (live
ping)` passed against a free endpoint while every real model call returned 402
for insufficient credits. A check that validates a key but not the account's
ability to serve a real request invites exactly the wrong diagnosis.
