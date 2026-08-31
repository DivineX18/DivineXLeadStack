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

**Acceptance:** extend `verify-asset-pipeline-output.mts`; a page that fails
the Critic never reaches Ready for Review; no fabricated evidence (existing BRE
guarantees hold).

### P0.6 — Zeno Copilot + Growth Plans *(C7, §10)*

- Persistent Copilot on every authenticated page, opening a contextual drawer
  in place. Context: workspace, page, selected entity, profile, memory,
  calibration.
- Growth Plan: multi-step requests produce a plan → autonomous internal drafts
  → one review experience → per-asset or whole-plan approval.

**Acceptance:** Copilot invokes real capabilities, not just text; nothing
external fires without approval.

### P0.7 — Public marketing + one pricing page *(C8, C9)*

- One Ascend site, Old Way → New Opportunity narrative, one dominant CTA.
- One pricing page: ASCEND / ASCEND PRO / AGENCY, driven by **configurable plan
  metadata** — no hard-coded commercial rules.
- Capability states (Available / Beta / Coming Soon) so copy cannot overclaim.

**Acceptance:** no fabricated proof; every claim maps to a shipped capability.

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
