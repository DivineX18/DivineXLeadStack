# DivineX Unified — Product Standard & Launch Gap Analysis

**Status: LOCKED product direction.** This governs implementation decisions.
Read alongside `divinex-unified-launch-handoff.md` (execution state) and the
North Star. Where this and actual code disagree, **code wins** — update this.

## The product principle

Unified answers one question: **"What should my business do next to grow?"** —
then helps do it. Differentiation is not features; it is
**intelligence → recommendation → creation → approval → execution → measurement**.

Flow's execution capability is **licensed infrastructure to leverage and expose
to Zeno**, not functionality to rebuild because competitors have it.

---

## 1. Existing system inventory (verified, not assumed)

### Ascend — intelligence
Growth Scan, CRO audit, business/brand profile, growth scoring, opportunity
identification, recommendations, Asset Studio (16 deliverable types), framework
library. Published to Flow via the versioned `divinex.profile` contract
including the `intelligence` block (constraint, opportunities, recommended
funnel type/lead magnet, score).

### Flow — execution
CRM (contacts, pipeline, deals, tasks, calendar, conversations), funnels +
public renderer, forms, booking, quotes/invoices/products, email + SMS,
broadcasts, workflows/automations, AI Agents (web chat, SMS, WhatsApp, voice,
outbound voice), social planner (Meta), websites (gitpage), custom domains,
reports, public API + webhooks, client billing.

### Zeno — orchestration
~37 capabilities across create/lookup. Certified: intelligence reaches
generation and materially changes it; email write→draft→approve→send; unified
Create incl. Ascend Asset Studio via the machine bridge; contextual page editing
with ownership-proofed page context.

### Unified — environment
Locked IA (Home/Create/Leads/Agents/Performance/Intelligence/Settings), clean
customer URLs, light+dark, global floating Zeno, visual funnel editor with
drag/add/duplicate/delete + media library, persisted Campaign Plan.

---

## 2. KEEP / IMPROVE / INTEGRATE / CONSOLIDATE / DEPRECATE / MISSING

| Capability | Verdict | Note |
|---|---|---|
| Funnel generation + Sales Argument Engine + Critic | **KEEP** | Certified; quality battery passed 3 industries |
| CRM, pipeline, tasks, calendar, conversations | **KEEP** | Mature licensed infrastructure |
| Email/SMS/broadcasts/workflows | **KEEP** | Certified send path |
| AI Agents (5 channels) | **INTEGRATE** | Reachable in Unified; **not exposed to Zeno** — Zeno cannot configure an agent |
| Social Planner | **INTEGRATE** | Publisher works; no Zeno capability; Meta App Review pending |
| Quotes / products / booking / forms | **INTEGRATE** | Reachable; **no Zeno capability** for any of them |
| Websites (gitpage) | **KEEP** | Zeno-exposed already |
| Custom domains | **KEEP** | `custom-domains-service.ts` exists |
| Reports | **IMPROVE** | Measures CRM outcomes (deals/contacts) only |
| Campaign Plan | **IMPROVE** | Persisted + inherited; **no control-centre UI** |
| Message templates | **KEEP** | Email/SMS templates |
| **Page/funnel template library** | **MISSING** | `/templates` is MESSAGE templates. No page templates exist |
| **Multi-step funnels / qualification** | **MISSING** | Only `bridge` (thank-you→next offer) + upsell/downsell chain. No steps, logic, branching, progress, scoring |
| **Funnel measurement** | **MISSING** | No page-view or funnel-conversion instrumentation anywhere |
| **Recommendation → executable action** | **MISSING** | `RecommendationRow` renders text; no "Fix with Zeno" action |
| **Closed-loop learning** | **MISSING** | Nothing observes post-launch outcome |

---

## 3. Competitive quality gap

**Pages: strong.** Certified across 3 industries — real persuasion depth, no
fabricated proof, honest placeholders, art-direction variation by archetype.
Not generic-AI-looking. **This is not the weak point.**

**Templates: absent.** Only "Create with Zeno" exists. No browse path.

**Multi-step funnels: absent.** The directive's canonical journey (landing →
qualification steps → contact → dynamic result → booking) cannot be built.

**Editing: good.** Real-page canvas, drag reorder, media library, contextual Zeno.

**Measurement: absent.** Cannot answer "did it work?"

---

## 4. Vertical journey gap analysis

| Journey | Verdict | Blocking gap |
|---|---|---|
| 1 · Generate more leads | **PARTIAL** | Diagnosis + funnel + follow-up work. Zeno does not *challenge* the request from data; no qualification steps |
| 2 · Improve lead conversion | **BLOCKED** | No signal instrumentation (response time, booking rate, engagement) |
| 3 · Market my business | **PARTIAL** | Assets generate; social not Zeno-exposed; no coordinated series |
| 4 · Lead magnet campaign | **PARTIAL** | Asset Studio produces the magnet; delivery→nurture→CRM journey not auto-connected |
| 5 · Fix my website/funnel | **PARTIAL** | Ascend analyses; recommendation is **text, not an action** |

---

## 5. Architectural gap analysis — what blocks intelligence→execution→measurement

**A. Measurement is the hard blocker.** No funnel view/conversion telemetry
exists. Without it, steps 8–9 of the loop (measure, learn) are impossible and
"conversion is no longer your constraint" can never be said truthfully.

**B. Recommendations are not executable.** Ascend's output renders as prose.
The `recommendation → Zeno action` edge does not exist.

**C. Zeno's capability surface is narrower than Flow's.** Forms, booking,
products, quotes, social, AI agents have **no capability**, so Zeno cannot
construct the journeys the directive describes even though Flow can execute them.

**D. Zeno does not challenge the request.** No mechanism weighs "what was asked"
against "what the diagnosis says".

**E. No multi-step funnel model.** `FunnelDoc` is a flat section array.

---

## 6. Launch blockers (genuinely prevent customers)

1. **Staging model key** — `OPENROUTER_API_KEY` 502s; two certifications UNAVAILABLE.
2. **Meta App Review** — social publishing cannot go live.
3. **No funnel measurement** — the differentiating claim is unprovable.
4. **Recommendations are not actionable** — the core loop visibly breaks.

Everything else is quality/scope, not a blocker.

---

## 7. Prioritized roadmap

### P0 — before beta
| # | Item | Owner | Why | Risk |
|---|---|---|---|---|
| 0.1 | Restore staging model key; re-run UNAVAILABLE suites | Ops | Nothing is certifiable without it | none |
| 0.2 | **Funnel measurement**: view + submission + conversion-rate per funnel | Flow | Makes measure/learn possible; unblocks journeys 2 & 5 | low — additive |
| 0.3 | **Recommendation → "Create/Fix with Zeno"** action on the existing card | Unified | Closes the visible loop break | low |
| 0.4 | **Zeno capabilities for forms + booking** | Zeno | Journeys 1 & 4 cannot complete without them | low |
| 0.5 | **Campaign Plan control centre** (YES/NO/CHANGES) | Unified | Plan is persisted but invisible | low |

### P1 — before public launch
| # | Item | Owner | Risk |
|---|---|---|---|
| 1.1 | **Multi-step funnel + qualification** (steps, validation, progress, scoring, CRM mapping) | Flow | med — extends `FunnelDoc` |
| 1.2 | **Template library** (~20 strong, structurally varied; Zeno selects + adapts) | Flow/Zeno | med |
| 1.3 | **Zeno challenges the request** from diagnosis | Zeno | low |
| 1.4 | Series generation (email/SMS/social) from the approved plan | Zeno | low |
| 1.5 | Social + AI-agent Zeno capabilities | Zeno | low |

### P2 — differentiation
Closed-loop learning (outcome → updated constraint); campaign performance
attribution; conditional branching; template expansion to 40–60.

### P3 — expansion
Ads, knowledge base, Ascend agency product, advanced analytics.

---

## 8. Acceptance tests

**P0.2** Publish a funnel → 3 visits + 1 submission → Performance shows views,
submissions, conversion rate for THAT funnel. Zero-traffic shows honest empty, never fabricated.
**P0.3** A recommendation renders an action that opens Zeno pre-loaded with that
recommendation as context; declining changes nothing.
**P0.4** "Build me a form to qualify leads" produces a real Flow form, embeddable,
submissions reach the right workspace.
**P0.5** Plan shows every step with status; YES advances; CHANGES revises only
that step; changing the CTA marks built assets `needs_update` and never rewrites.
**P1.1** A 3-step qualification funnel validates, remembers input on back, maps
to CRM, has no dead end on mobile.
**P1.3** With a diagnosis contradicting the request, Zeno states the tension
before building, and still builds if the customer insists.

---

## 9. Test plan

Unit/pure (existing pattern) · integration against real Firestore · behavioural
on deployed staging (assert **rendered outcome**, never source) · visual QA:
generate for 5 representative businesses, capture desktop+mobile, fix
**systemic** weaknesses in generator/components — never per-page · failure
testing: missing profile, no traffic, bad URL, long names, empty states, model
outage (must read UNAVAILABLE, never a pass).

---

## 10. Recommended beta scope

**Enabled:** Home/intelligence, Growth Scan, Zeno, funnels + visual editor +
media, forms, CRM/pipeline/conversations, email+SMS, workflows, booking,
Campaign Plan, Asset Studio.
**Beta-labelled:** AI Agents, campaign series, custom domains.
**Hidden/deferred:** Social publishing (Meta review), quotes/invoices/products,
community, Get Leads (parked), template library until ≥20 strong templates.

---

## Standing rules

Inspect before modifying · reuse licensed infrastructure · integrate rather than
duplicate · never fabricate proof, metrics or imagery · GENERATION ≠ APPROVAL,
DRAFT ≠ SEND/PUBLISH · UNAVAILABLE is never a pass · production untouched.
