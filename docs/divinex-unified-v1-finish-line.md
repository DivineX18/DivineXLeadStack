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
| 3 | Recommendation → Fix/Create with Zeno | **FIX** | Shipped (ask-Zeno bridge + action on the recommendation card). Certification of the rendered path needs a Complete-mode workspace + live intelligence. |
| 4 | Zeno orchestration of core Flow capabilities | **FIX** | Have: funnels, websites, email, assets, workflows, contacts/deals/tasks/events. **Missing: forms, booking.** Social is a judgement call — see §Zeno scope. |
| 5 | High-quality landing pages/funnels | **PASS** | Sales Argument Engine + Critic + art direction; quality battery passed 3 industries. |
| 6 | Production-quality basic multi-step funnels | **MISSING** | No step model exists. Smallest credible implementation defined below. |
| 7 | Launch-quality template library (~20–30) | **MISSING** | No page templates. **But the raw material exists**: 7 genre frameworks (structural) × 7 design packs (visual). See §Templates. |
| 8 | CRM | **PASS** | Mature licensed infrastructure. |
| 9 | Email / SMS | **PASS** | Certified send path (write → draft → approve → send). |
| 10 | Social creation + scheduling | **FIX** | Publisher works. **Meta App Review is an external blocker** — cannot be closed by code. |
| 11 | Automation / workflows | **PASS** | Visual builder + executor + QStash. |
| 12 | Lead magnets + marketing assets | **PASS** | Asset Studio reachable from unified Create via the machine bridge. |
| 13 | Forms | **FIX** | Forms exist and work; **Zeno cannot create one**. |
| 14 | Booking | **FIX** | Booking exists and works; **Zeno cannot create or wire one**. |
| 15 | Campaign Plan / review / approve | **FIX** | Persisted + inherited + change-aware. **No control-centre UI** — the plan is invisible to the customer. |
| 16 | Funnel measurement (views, conversions, rate) | **PASS** | Shipped. Real-browser E2E: 4 visits → 1 submission → 1 real lead → 0.25, reported per page. Unvisited pages report *no data*, never 0%. |
| 17 | Reliable publishing | **PASS** | Explicit publish boundary; approving is not publishing. |
| 18 | Workspace isolation | **PASS** | Re-checked on every read/write; certified per feature, including the new telemetry. |
| 19 | Billing / access control | **PASS** | Client Billing v1: plans, gates, checkout, dunning, paywall. |
| 20 | Mobile + desktop QA of critical workflows | **MISSING** | No systematic mobile pass has been run against the customer journeys. |

**Net remaining work: 6, 7, 20 to build; 3, 4, 13, 14, 15 to finish; 1 and 10
are owner/external actions this repo cannot close.**

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
