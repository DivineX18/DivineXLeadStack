# Ascend Production Implementation Plan

Derived from the Ascend Production Master Prompt + the Product Strategy &
Commercialization Amendment (amendment takes precedence on packaging,
positioning, pricing, account types and public product).

**Status: PLAN ONLY. Nothing in here is implemented yet.** Per the
amendment's final instruction: audit → plan → phase-by-phase implementation
with acceptance testing.

---

## 0. DO NOT BREAK

These are load-bearing and were certified against real data this cycle.
Breaking any of them is a production incident, not a regression.

| Invariant | Where enforced | How it is proven |
|---|---|---|
| **Approved-only assets** — an unapproved asset never reaches a rendered page | `consume-profile.ts` filters `status === "approved"` | `verify-asset-pipeline-output.mts` builds BEFORE approval and asserts 0 images |
| **Publish boundary** — nothing goes public or contacts anyone without human approval | funnel `status`, workflow `status`, `loadFunnelForRender` returning null for unpublished | `verify-e2e-journey.mts` (3 independent assertions) |
| **Tenant isolation** — no cross-workspace read, including via URL ids | `requireSubAccountMember*`, `resolveSubAccountAccess`, Firestore rules | `verify-prodexp-phases.mts`, `verify-e2e-journey.mts` |
| **No fabricated evidence** — no invented testimonials, stats, certifications, guarantees | Business Reality Engine + `content-audit.ts` | `bre-certify.mts` |
| **Preview is non-production** — no real leads, no analytics pollution | `previewMode` prop | `verify-prodexp-build-journey.mts` |
| **Frozen engines** — Sales Argument, Evidence Composition, Business Reality, Lifecycle, Automation Strategy, Time/Communication Policy | — | Fix bugs inside them; do not redesign them |
| **Above-the-fold decision completeness** | `hero-section.tsx` FOLD_* constants | `verify-hero-fold.mts` |

**Rule:** every phase below must leave all seven true. A phase that cannot is
split until it can.

---

## 1. AUDIT — verified against the codebase, not assumed

### 1a. Exists and must be PRESERVED

| Capability | Location |
|---|---|
| Growth Scan / assessments / recommendations / Growth Score | Ascend `api-server`, surfaced via `intelligence-wrappers.ts` |
| Business Memory | Ascend, consumed through the profile contract |
| Calibration Engine v1 | Flow `lib/ai-suite/` + knowledge vault |
| Canonical Business Profile + signed `profile.published` contract | `lib/divinex/contract.ts`, `consume-profile.ts` |
| Brand discovery + asset classification (byte-level) | Ascend `brandDiscovery.ts`, `imageFacts.ts` |
| CRM, pipelines, contacts, forms, workflows, email/SMS, products, orders, payments | Flow, unchanged |
| Funnel builder + public renderer + preview | `components/funnels/`, `/preview/funnel/[id]` |
| Zeno capability registry + confirm-gated execution | `lib/ai-suite/capabilities.ts`, `/api/ai-suite/confirm` |
| Client Billing plans + entitlement evaluation | `lib/billing/`, `lib/entitlements/` |
| Design tokens + shared UI | `globals.css` `.theme-ascend`, `components/divinex/ui.tsx` |

### 1b. CONFLICTS with the locked product model

| # | Conflict | Current state (verified) | Required |
|---|---|---|---|
| C1 | Primary navigation | `home, campaigns, crm, intelligence, brand, settings` | `HOME, CREATE, LEADS, PERFORMANCE, INTELLIGENCE` + Refer Ascend, Settings |
| C2 | **Ascend is gated to one workspace** | `decideShellMode` requires `workspaceTier === "full_ascend"`, which requires an active `workspaceMappings` row. Exactly ONE exists. | Ascend is THE public product — every paying workspace gets it |
| C3 | Flow branding exposed | `resolve-shell-branding.ts` falls back to `flowBrand.name`; staging `<title>` is "Flow — The Growth Operating System" | Never expose Flow branding in the Ascend customer experience |
| C4 | Role model | `EffectiveRole = agencyOwner \| admin \| collaborator`. `FutureWorkspaceRole` exists as a **type only**, unused. | 6 platform + 7 agency + 7 business roles |
| C5 | **Super Admin absent** | No `superAdmin` anywhere in `src/lib` or `src/types` | `hello@divinex.io` seeded Super Admin, enforced server-side |
| C6 | Approval states | `FunnelStatus = "draft" \| "published"` | Draft, Ready for Review, Changes Requested, Approved, Scheduled, Live, Paused, Archived |
| C7 | Zeno is a destination, not ambient | `/app/zeno` page only | Persistent Copilot on every authenticated page, context-aware |
| C8 | Public pricing | `CUSTOM_BRAND` starter/pro/scale + separate Client Billing plans | ONE pricing page: ASCEND / ASCEND PRO / AGENCY |
| C9 | Marketing site | White-label CRM template | Ascend AI Growth OS narrative |

### 1c. Must be NEWLY BUILT

- **Zeno Growth Plan** (§10) — no `GrowthPlan` concept exists.
- **Landing Page Critic** (§14) — no independent second evaluation exists.
- **Image Director** (§13) — `art-direction.ts` + `imagery.ts` + the new
  classifier are *inputs*; the Research→Strategy→Narrative→Section
  Architecture→Visual Plan→Asset Selection→Build→QA pipeline does not exist.
- **Autopilot permissions** (§23).
- **Super Admin console** (§31).
- **Blueprints** (§27).

---

## 2. PHASING

### P0.1 — Foundation: identity, roles, Super Admin *(no UI change)*

Ship first because everything else depends on it, and it is invisible to
customers if done correctly.

**Migrations (ADDITIVE ONLY):**
- Add `platformRole` to `users/{uid}` (nullable). Absent = ordinary user.
- Expand agency/business role vocabularies as *additive* enum values. Existing
  `agencyOwner`/`admin`/`collaborator` continue to resolve — map them:
  `admin → Business Admin`, `collaborator → Viewer`+ scoped grants.
- Seed `hello@divinex.io` as `platformRole: "super_admin"` via a script, not a
  client path.

**HIGH RISK:** `firestore.rules` reads roles today. Rules must accept BOTH
vocabularies during migration. Deploy rules **before** any writer emits new
values, or existing members lose access.

**Acceptance:** every existing member retains identical access; Super Admin
resolves server-side; a forged client role claim changes nothing.

### P0.2 — Ungate Ascend *(C2 — highest blast radius in the whole plan)*

Today one workspace can reach `/app/*`. The locked model says Ascend is the
product. This must be staged, not flipped.

1. Make `full_ascend` derive from **plan entitlement**, not from a hand-created
   `workspaceMappings` row.
2. Backfill mappings for existing paying workspaces via script (idempotent,
   dry-run first).
3. Keep `unified_shell` as the rollout throttle; widen deliberately.

**HIGH RISK / DESTRUCTIVE POTENTIAL:** flipping this exposes the Ascend shell
to every workspace at once. Every workspace's data must already be tenant-safe
under the shell — proven for one workspace, not yet for many.

**Acceptance:** a second workspace, provisioned through the **real** path,
receives its mapping and shell automatically. *This is the standing
pre-broader-beta requirement; do not hand-create a mapping to satisfy it.*

### P0.3 — Navigation + Create library *(C1)*

- Sections become `home, create, leads, performance, intelligence`.
- `campaigns → create`, `crm → leads`, `brand` folds into Intelligence or
  Settings (decide with the Business Profile surface).
- Every old route redirects (precedent: `/app/grow → /app/crm` etc.).
- Create is a **searchable library** with filters (All, Campaigns, Pages &
  Funnels, Emails & SMS, Ads & Social, Documents, Media) and one primary CTA:
  `+ Create with Zeno`.

**Acceptance:** no dead links; every legacy path lands somewhere real;
`verify-prodexp-ia.mts` updated to the new IA.

### P0.4 — Approval system *(C6)*

- Extend `FunnelStatus` **additively**. `draft` and `published` keep working;
  `published` maps to `Live`.
- Add `approval` metadata: creator, AI-or-human origin, edits, approver,
  publisher, timestamps.

**HIGH RISK:** never rewrite existing status values in place. Read-time
mapping, not a data migration.

**Acceptance:** existing funnels behave identically; publish still requires
explicit human action; audit log written for every transition.

### P0.5 — Image Director + Landing Page Critic *(§13/§14 — named CRITICAL)*

Builds on the classifier work already shipped (`imageFacts.ts`,
byte-level classification, URL dedupe, theme-asset exclusion).

- **Visual plan before generation:** for each section, decide what the image
  must communicate, whether a first-party asset exists, and whether **no image**
  is better. Asset priority: first-party → brand library → approved generated →
  quality stock → none.
- **Critic:** independent scoring pass (message clarity, hierarchy, image
  relevance/distribution, brand fidelity, CTA prominence, trust, mobile,
  repetition, generic-AI appearance, factual consistency) before a page is
  marked Ready for Review. Auto-repair obvious failures.

#### P0.5 destination — what "done" means

**100% automated strategy and composition. Human contribution ONLY where
authentic source material does not exist.**

Not a percentage target. A responsibility boundary: DivineX owns every
*decision*; the human supplies only what cannot be decided into existence.

DivineX decides, always and automatically:
- page structure, copy, hierarchy, hero treatment
- which sections need visual support at all
- which existing assets are genuinely good enough
- where each approved asset belongs
- what kind of missing asset would improve the page

DivineX must NOT manufacture authenticity to chase automation. If a section
needs a photo of the founder, team, product, office, completed project or
customer experience and that photograph does not exist, the correct output is
a **deliberate gap with an extremely specific brief** — never a stock photo
pretending to solve it.

**The four states, exhaustive:**

| Situation | Correct behaviour |
|---|---|
| Great assets available | Use them automatically |
| An appropriate generatable visual | Create or recommend it |
| No image improves the section | Intentionally no image |
| Authentic photo required but missing | Precise human shot brief |

Both extremes are failures: "AI does absolutely everything" manufactures
fake authenticity; "AI builds the page and humans decorate it" abandons the
composition decisions that are the actual product.

**Placeholder UX (P0.5, not deferred).** A gap must be actionable in place —
Upload photo · Choose from Brand Library · Generate alternative (where
generation is appropriate). The user must not have to leave the funnel,
navigate to Brand & Assets, upload, return, find the section and reconnect it.

**Page state language.** A page with open gaps is not "incomplete". State it
as capability, e.g. *"Publishable now. Stronger with 2 photos."* — the page
publishes cleanly today and upgrades the moment real imagery exists.

#### P0.5 acceptance requirements (owner-specified)

**(1) The hero is decided separately from the rest of the page.**

For every generated page the Director must resolve the hero to exactly one of:

- hero needs a first-party image
- hero needs a generated/contextual image
- hero is intentionally text-only

`hero.mediaType = none` followed immediately by a dense 3–4 image gallery is
**not permitted** unless the page strategy specifically determined that
hierarchy. Observed failing on a real page (apostillecorp): empty hero, then a
4-up gallery, which reads as an image dump regardless of the assets being
correct. When the hero is intentionally text-only, the next section must not
recreate that impression.

Hero visual hierarchy is a scored dimension in the Critic.

**(2) First-party preference is necessary; first-party STATUS is not a
placement entitlement.**

The ordering is: **authenticity → relevance → quality → composition need →
placement.** First-party is a strong positive signal, not a right to appear.

A generated page is NOT required to use first-party photography. The Director
may legitimately conclude the hero needs generated/contextual imagery, or
should be text-only, and some businesses simply have no usable first-party
photography at all.

**Implementation warning:** do NOT implement this as `mustUseFirstParty =
true` or any equivalent hard requirement. That recreates the exact Apostille
failure this requirement exists to eliminate — a page filled with the
business's own generic stock-style imagery because it was theirs, not because
it was good.

Grade every candidate:

| Grade | Meaning | Use |
|---|---|---|
| First-party, high quality | Real, specific, well-shot | Prefer |
| First-party, relevant but generic | Theirs, but stock-style | Use sparingly, strongest one only |
| First-party, low quality / poor fit | Theirs, but weak or wrong | Avoid |
| Unusable | Chrome, theme asset, too small | Never |

An asset does not earn placement merely by living under `/uploads/`. Observed:
apostillecorp's own photography is stock-style, so maximum first-party usage
would have produced a worse page than fewer, stronger images.

When the business's own imagery is generic, valid responses are: use only the
strongest relevant asset; reduce image quantity; use intentional no-image
sections; or recommend approved custom imagery where policy allows. The goal
is **brand authenticity AND page quality** — not maximum first-party usage.

**(3) The Critic evaluates page-level visual rhythm, not image presence.**

Must flag: image clustering; gallery dumps; repeated image patterns; too many
images above the fold; long stretches with no visual support where imagery
would aid clarity; the same asset used twice; unrelated imagery; excessive
stock-style imagery; image-heavy sections that weaken hierarchy.

The page must read as **intentionally art-directed**, not populated from an
inventory.

#### How these become testable

Deterministic, hard-asserted in `verify-asset-pipeline-output.mts`:
- hero decision is one of the three explicit outcomes, recorded on the funnel
- no empty-hero-followed-by-dense-gallery pattern
- no asset repeated across sections (URL-level; perceptual is post-beta)
- above-the-fold image count within budget
- no unusable-grade asset placed anywhere

Judgment-based, model-scored with human spot-checks — these cannot be honestly
regex-asserted, and claiming otherwise would repeat the mistake where a green
suite hid a real visual defect:
- "reads as art-directed"
- generic-stock-style severity
- whether a no-image section was the right call

**Acceptance:** extend `verify-asset-pipeline-output.mts` with the
deterministic set; a page failing the Critic never reaches Ready for Review; no
fabricated evidence (existing BRE guarantees hold); a real-business probe is
run and visually spot-checked before P0.5 is called done.

### P0.6 — Zeno Copilot + Growth Plans *(C7, §10)*

- Persistent Copilot on every authenticated page, opening a contextual drawer
  in place. Context: workspace, page, selected entity, profile, memory,
  calibration.
- Growth Plan: multi-step requests produce a plan → autonomous internal drafts
  → one review experience → per-asset or whole-plan approval.

**Acceptance:** Copilot invokes real capabilities, not just text; nothing
external fires without approval.

### P0.7 — Unified Ascend product marketing experience *(C8, C9)*

**Scope: a PRODUCT marketing experience, not the DivineX corporate website.**
Its only job is to advertise and sell Ascend, the AI Growth Operating System.

**In scope**
- What Ascend is; the problem it solves; how Zeno works
- Intelligence + Execution
- Business use case; Agency use case (a plan/scope extension, not a second
  product pitch)
- Core capabilities, framed as outcomes rather than a feature list
- Product screenshots / demonstration — show, don't tell
- Pricing: ASCEND / ASCEND PRO / AGENCY, driven by **configurable plan
  metadata**; no hard-coded commercial rules
- Signup / checkout CTA, and login
- Capability states (Available / Beta / Coming Soon) so copy cannot overclaim

**Narrative**

*The Old Way* — disconnected tools, dashboards, data, and manual execution;
the owner still has to work out what to do.

*The Ascend Way* — Ascend learns the business → Zeno identifies what matters →
Zeno builds the next move → the user reviews → Ascend executes → Ascend
measures → Zeno learns.

**Explicitly OUT of scope** (belongs to the separate DivineX.io project — do
not let this phase become a corporate-site rebuild):
- Mindful Wealth
- Broader DivineX Services
- Resources / Thought Leadership
- Corporate About architecture
- WordPress migration

**PROPERTY BOUNDARY — LOCKED**

| DivineX public website (`divinex.io`) | Unified Ascend application (`app.divinex.io`) |
|---|---|
| Ascend product marketing, likely `/ascend` | signup / login / provisioning / onboarding |
| Positioning + demonstrations | Home, Campaigns, CRM, Intelligence, Brand & Assets |
| ASCEND / ASCEND PRO / AGENCY pricing | Zeno |
| Signup / checkout entry points | Agency / multi-business experience |
| Broader DivineX corporate content elsewhere on the same property | Everything after someone enters the product |

**Implementation owner: the DivineX public website project, NOT this repo.**
Public marketing responsibilities are not added to the application repo merely
because the Ascend app is implemented here.

**P0.7 REMAINS IN THIS PLAN.** It is a launch dependency with a different
implementation owner — do not drop it from the launch checklist just because
it is not Flow code. Ascend cannot launch without it.

**Acceptance:** no fabricated proof — no invented testimonials, customer
counts, statistics or outcomes, including as placeholders that could ship;
every claim maps to a shipped capability or is explicitly marked Beta /
Coming Soon; one dominant CTA per narrative; the excluded corporate sections
are absent.

### P1 — Execution expansion
Email/SMS automation depth, advanced workflows, ad-platform execution, social
scheduling, external-website integrations, advanced attribution, Autopilot
permissions, Blueprints.

### P2 — Specialized commercialization
Only after demand: standalone Flow agency marketing, intelligence-only public
plans, partner products. **Must not delay P0.**

---

## 3. Sequencing rationale

P0.1 before everything (authorization underpins all of it). P0.2 before P0.3
(no point renaming navigation only one workspace can see). P0.5 is
independent and can run in parallel — it touches generation, not identity.
P0.7 last of the P0s, because marketing must describe what actually ships.

---

## 4. Deployment debt to clear before promotion

- **Ascend `dev` has diverged from `main`** and does not contain
  `brandDiscovery.ts`; there is no usable dev-first path on that repo.
- **Staging services are not in `render.yaml`** — both drifted silently
  (Flow staging was 20 days and three slices behind). Codify them.
- **Four regression suites remain red**, all classified: three byte-for-byte
  pins to pre-Slice-7/8 commits, one demanding a media placeholder from
  text-only sections.

---

## 5. Working agreements

1. Audit before implementing; state what exists before adding.
2. Extend before creating; new top-level surfaces need justification.
3. Real-business probes for anything touching generation or assets.
4. Verify the deployed artifact, never the dashboard — this caught two false
   greens this cycle.
5. Additive migrations; production data is preserved.

---

## 6. Release sequencing — LOCKED

    Current RC human test
      -> consolidated punch list
      -> reconcile findings against P0.1-P0.7
      -> execute P0
      -> full certification
      -> second human acceptance test
      -> production

**The release candidate is FROZEN during the human test.** The point is a
clean before/after read of the pre-P0 baseline, which is impossible if the
product changes underneath the person judging it. P0.3 changes navigation and
P0.5 changes generated-page visual direction, so this is the last chance to
judge the current experience as a customer would.

**Triage protocol during the test: categorise, do not fix.** Each finding is
one of — bug / UX problem / visual-quality problem / missing capability /
already addressed by a planned P0 phase. Fixing individual visible symptoms
mid-test obscures the underlying system problem, which is how a single
misclassified asset previously read as four separate defects.
