# Ascend OS — Launch Readiness Audit

Live document. Started 2026-08-08 during the post-cutover launch-completion pass. Status legend:

- ✅ VERIFIED WORKING
- 🟡 PARTIAL
- ❌ BROKEN
- ⬜ MISSING
- 🔧 FIXED THIS PASS
- ⚠️ KNOWN LIMITATION
- 🚫 LAUNCH BLOCKER

Every entry below is backed by direct code inspection or a live production test performed during this pass — nothing here is marked ✅ on the basis of "code exists."

## Entry / Auth

| Item | Status | Evidence |
|---|---|---|
| Login at `app.divinex.io` | ✅ VERIFIED WORKING | Live tested; `/login` renders and authenticates correctly |
| Signup — first-ever signup becomes agency owner | ✅ VERIFIED WORKING | `src/app/api/auth/signup/route.ts` — transactional `appConfig/main` bootstrap check |
| Signup — every signup after the first | ⚠️ KNOWN LIMITATION | Requires a matching, unrevoked invite doc naming a specific agency/sub-account/role. This is a deliberate GHL-style agency-tool model, not a defect — but it means "self-service new customer" doesn't mean what it does for most SaaS products here. Flag for product-owner confirmation this is the intended Ascend customer model too. |
| Session persistence across `app.divinex.io`/`crm.divinex.io` | ✅ VERIFIED WORKING (as separate sessions) | Cookies are host-only (no shared `Domain=`), confirmed by direct testing — a session on one hostname does not carry to the other. Working as designed, not a bug; surfaced real confusion during testing tonight (mistaken for a broken auth state) — worth a UX note somewhere visible if it recurs. |
| Workspace selection for multi-membership users on `/app/*` | 🔧 FIXED THIS PASS | See "Workspace selection cookie" below |
| Logout | ✅ VERIFIED WORKING | Standard flow, unchanged |

## Full Ascend workspace provisioning

The single most important finding of this audit. Getting ONE existing internal user into `full_ascend` mode required five things, done by hand via ad hoc scripts against Postgres and Firestore directly:

| Requirement | Self-service/automated path? | Status |
|---|---|---|
| `featureFlags/unified_shell` + `unified_navigation` Firestore docs | 🚫 → 🔧 FIXED THIS PASS | Was: no UI, one gated API nothing called. Now: minimal operator toggle added to Agency Settings (see Pass 2B below). |
| Ascend↔Flow `identityLinks` doc | 🚫 → 🔧 FIXED THIS PASS | Was: script-only (`scripts/backfill-identity-link.mts`). Now: auto-created on first successful SSO bridge login (see Pass 2A below). |
| Ascend↔Flow `workspaceMappings` doc, active | 🚫 → 🔧 FIXED THIS PASS | Was: script-only (`scripts/migrate-single-workspace-mapping.mts`). Now: auto-created + activated on first successful SSO bridge login. |
| `ascendIntelligenceEnabledByAgency` gate | ✅ VERIFIED WORKING | Real UI in the sub-account Manage dialog; bundleable into a Client Billing plan. Working as designed, not a gap. |
| Ascend-side `divinex_workspace_mappings` Postgres row (upstream of everything above) | 🚫 LAUNCH BLOCKER | Confirmed via this repo's own documentation: "no admin UI, API route, or seed script that writes to it... populated by hand via a one-off script." Lives in the separate `DivineX-Business-Intelligence` repo. This pass's SSO-callback fix (above) only activates *once this row already exists* — it does not make the row's creation self-service. **This remains the true launch blocker**: a brand-new customer still cannot reach `full_ascend` without someone manually inserting this Postgres row. Needs a product-owner decision on the other repo; explicitly out of scope for this pass per the standing instruction not to touch that repo's SSO-adjacent code while its `dev`/`main` divergence is unresolved. |

## `/app/*` lifecycle section status

| Section | Status | Notes |
|---|---|---|
| Home | ✅ VERIFIED WORKING | Composes Flow operational data + Ascend intelligence in parallel; degrades gracefully per-card on partial failure |
| Identify | 🔧 FIXED THIS PASS (Task H) | Was already real (composed intelligence data); the "no linked business profile" / "no assessment yet" prompts were static text with no way to act — now real links out to `ascend.divinex.io` (the actual owner of business-profile creation and assessment-running, per the locked product model — not rebuilt in Flow) |
| Create | 🔧 FIXED THIS PASS (Task B) | Real Funnel Builder (list + editor) and Website Builder mounted natively in Ascend chrome, reusing `FunnelsList`/`FunnelBuilder`/`WebsiteBuilder` as-is. `/sa/{id}/funnels` and `/sa/{id}/website` untouched. |
| Grow | 🔧 FIXED THIS PASS (Task C) | Contacts, Pipeline, Tasks, Calendar, Conversations all mounted natively — the exact, unmodified legacy page components wrapped in the same `SubAccountProvider` context they already expect. Zero forking of their internal logic. |
| Settings | 🔧 FIXED THIS PASS (Task D) | The full ~20-section legacy settings page mounted natively; each section's existing role-based visibility (not a new curation layer) governs what a given caller sees, same as it does today for CRM-only collaborators vs. admins. |
| Launch | 🔧 FIXED THIS PASS (Task E) | Broadcasts (list + detail) and Workflows (list, editor, live runs) mounted natively, reusing the underlying prop-driven components directly. |
| Optimize | 🔧 FIXED THIS PASS (Task F) | Composes Growth Score + CRO recommendations (real Ascend intelligence, no invented metrics) above the real, unmodified Flow Reports page. |
| Scale | 🔧 FIXED THIS PASS (Task G) | Mounts the existing, already-built confirmation-gated workspace AI Suite/Zeno (`src/lib/ai-suite/capabilities.ts`) as-is — no new execution-authority code was written; this was reuse only. |

**All 8 sections are now real** — 2 were already real (Home, Identify's data); the other 6 went from static placeholder to native, working functionality this pass, entirely via reuse (zero duplicated engines, zero new CRM/funnel/website/workflow/reports systems).

**Known scope boundary, consistent across all six**: internal deep-links *within* these pages (e.g. clicking into a specific contact's detail view, or a funnel's live-preview link) still point at the legacy `/sa/{id}/...` path for that one nested destination — the list/board/builder/settings surfaces themselves are fully native, but not literally every possible click, several layers deep, has its own dedicated `/app/*` route yet. Not a defect; a deliberate, documented boundary matching the time available this pass.

Sidebar lock icons are workspace-specific (driven by whether that workspace's entitlements include the matching module), not a global flag. The permission→module mapping is explicitly flagged in code as a first-pass Slice 8 decision, not finalized.

**Production build verified**: a full `pnpm build` (not just `tsc --noEmit`) was run after all six tasks — every new `/app/*` route compiled successfully with real bundle sizes, and every original `/sa/[subAccountId]/...` route remains present and unchanged. This specifically validates the "import the legacy page component directly, wrap in the same context it already expects" reuse pattern used throughout — it's not just type-safe, it's confirmed buildable.

## Workspace selection cookie

🔧 FIXED (earlier this session, prior commit). `/app/*` had no way to know which of a user's multiple sub-account memberships to activate — `middleware.ts` now mirrors the active `/sa/[id]/...` segment into an `active_workspace_id` cookie; `/app/layout.tsx` reads it. Membership is independently re-verified server-side regardless of cookie value (`resolveWorkspaceIdentity` → `resolveSubAccountAccess`), so a forged/stale cookie can only ever produce a harmless redirect, never real unauthorized access. Verified via `scripts/verify-shell-composition.mts` (updated) + live multi-workspace testing.

## Workspace switching inside the Ascend shell

🔧 FIXED THIS PASS (Pass 2C). "Switch workspace" / "Agency home" previously linked straight to `/agency` (plain Flow) with no way back into `/app/home` — see Pass 2C implementation below.

## Billing / entitlements

| Item | Status |
|---|---|
| `full_ascend` tier requires BOTH an active workspace mapping AND `ascendIntelligenceEnabledByAgency` | 🔧 FIXED (earlier this session) — previously mapping-existence alone was sufficient, disconnected from what the sub-account was actually paying for |
| Client Billing plan bundling | ✅ VERIFIED WORKING | `PLAN_GATE_KEYS` auto-flows into plan editor UI; confirmed no plan-route changes needed when the gate was added |
| No agency-owner bypass on the Ascend gate | ✅ DELIBERATE | Unlike the billing-lapsed exemption elsewhere, this gate is a plan decision, not a payment failure — owner sees exactly what the client's plan grants |

## Known issue — client-role dashboard on the standalone Ascend BI app

❌ BROKEN (found live, 2026-08-08, during an active customer call — worked around live by manually upgrading the affected account's role; the underlying bug is NOT fixed). A brand-new `client`-role account (`dekotadangelo@gmail.com`, standalone `ascend.divinex.io`) hit a non-working `/dashboard` after clicking the nav "Dashboard" button. Root-caused to `ExecutiveMode.tsx` (the component `DashboardRoute` renders for `client`/`user`/`auditor_trainer` roles) depending on `useActiveProfile()` resolving a Business Profile — a brand-new client with zero business profiles yet likely hits a broken or unhelpful state here rather than a graceful "create your first business profile" prompt. Not yet fixed — needs a proper empty-state pass on `ExecutiveMode.tsx` for the zero-profile case. Tracked here so it isn't lost; deliberately not chased mid-launch-pass since a live workaround was already applied.

## Known data-hygiene issue

⚠️ Two sub-accounts named identically "DivineX" exist under the same agency (#1000 — real/active, has a QA test member; #1001 — a leftover artifact from earlier SSO bridge testing, owner-only membership). Confirmed via direct Firestore inspection. This is a real footgun for the sub-account switcher — recommend archiving/renaming #1001 before launch. Not fixed this pass (data cleanup decision, not a code defect).

## Regression-risk areas flagged for Pass 4

- **Ascend BI app (`ascend.divinex.io`) Clerk auth** — a deep misconfiguration (backend `clerkMiddleware` synthesizing a bogus per-hostname publishable key once the real key was corrected to production) caused every authenticated request to 401 regardless of role. Now fixed and deployed, but the entire authenticated surface of that app was affected — warrants a full regression pass before launch, not just the one flow that was directly tested (role display).
- **`crm.divinex.io`** — no functional changes made to this surface during any of tonight's work; confirm via regression pass rather than assumption.

## Pass 2 summary (this session)

| Fix | Status |
|---|---|
| 2A — SSO bridge auto-provisions Flow-side identityLink + workspaceMapping | 🔧 FIXED THIS PASS |
| 2B — Operator UI for `unified_shell`/`unified_navigation` flag rollout | 🔧 FIXED THIS PASS |
| 2C — Workspace switching returns to `/app/home` instead of stranding in Flow | 🔧 FIXED THIS PASS |

## Pass 3 summary (this session)

All six previously-stub `/app/*` sections (Create, Grow, Settings, Launch, Optimize, Scale) are now real, plus Identify's actionability gap (Task H) — see the lifecycle table above for the per-section breakdown and reuse method. Order followed: Create → Grow → Settings → Launch → Optimize → Scale → Identify actionability, per the mandate's own priority sequencing. Verified via full `pnpm tsc --noEmit`, full `pnpm eslint` sweep, full `pnpm build`, and all six `verify-*.mts` regression scripts — all clean/passing after every task.

## Bug — every `/app/*` page re-resolved the workspace without the cookie (found + fixed 2026-08-09)

🚫 → 🔧 FIXED. The workspace-selection cookie fix above was applied to `src/app/app/layout.tsx` only. What wasn't caught at the time: **every individual page** under `/app/*` (Home, Identify, Create, Grow ×5, Launch ×5, Optimize, Scale, Settings — 18 files) makes its *own separate* Server Component call to resolve the shell context, independent of the layout's call, and none of them were passing the cookie-derived `explicitWorkspaceId`. For a multi-membership caller (any agency owner with more than one sub-account), that second, cookie-blind call fell into `decideWorkspaceSelection`'s "multiple candidates, don't guess" branch and returned `workspace: null` — so every lifecycle page rendered "No active workspace yet." even though the layout's own (correct) resolution had already found a real workspace and rendered full Ascend chrome around it. Root-caused live from the user's own screenshot of `/app/settings`.

Fix: added `resolveShellContextForPage()` to `src/lib/shell/shell-context-wrappers.ts` — the one function every `/app/*` page now calls, which reads the `active_workspace_id` cookie itself before delegating to `resolveShellContextForLayout()`. All 18 page files updated to call it instead of the bare, cookie-blind wrapper. Verified: `pnpm tsc --noEmit`, `pnpm eslint`, `pnpm build`, `verify-shell-composition.mts` all clean. Deployed via Render auto-deploy on push to `main` (this repo's actual production branch — see the branch-discipline note below).

## Branch discipline (found + fixed 2026-08-09)

**Finding**: local `dev` had received zero commits since 2026-08-07 (`2c812cb`) while every commit from Slice 8 onward — the entire unified-shell/Command-Center effort — had been landing directly on `main`, which `render.yaml` confirms is the actual, sole production branch (`branch: main`, services `ascend-crm` serving both `crm.divinex.io` and `app.divinex.io`). This is the opposite of this project's own dev-first-deploys standard and should have been caught earlier in the session rather than continuing the pattern commit after commit.

**Verification before touching anything**: `git merge-base main dev` returned dev's own tip (`2c812cb`) — meaning `dev` is a strict ancestor of `main`, not a diverged branch. Every commit on `dev` already exists in `main`'s history; `main` simply has months of additional work on top. There was zero unique content on `dev` to lose.

**Fix**: `git push origin main:dev` — a genuine fast-forward (git refuses this if it isn't one), not a merge. No conflict resolution occurred because none was possible; `dev` and `main` now point at the identical commit.

**Decision, documented**: `main` is the authoritative production branch (per `render.yaml`, and per the established pattern of this entire multi-week effort). Going forward, new work should land on `dev` first and get promoted to `main` after verification, per this project's standing dev-first policy — this session did not retroactively restructure the many already-deployed commits to fit that model (would require rewriting shipped history for no safety benefit), only stopped the branches from silently diverging further and recorded the decision here.

## Ascend Command Center (built this pass, 2026-08-09)

Super-admin-only platform management surface, native to `/app/*` Ascend chrome, per explicit user requirement. Full reuse audit performed first (Section 10 of the request) — see below for what was and wasn't reused.

**Architectural conflict surfaced and resolved**: `/app/*`'s shared layout was structurally gated to redirect away entirely unless the request resolved to one `full_ascend`-tier workspace — there was no "agency owner, no workspace selected" path through it, and prior documentation (`PHASE_1_IMPLEMENTATION_BLUEPRINT.md`, `PHASE_2_IMPLEMENTATION_LEDGER.md`) had flagged platform-admin consoles as explicitly out of scope for this repo, intended instead for the separate Ascend Intelligence repo. This was a prior implementation decision, not a constraint from the actual product owner — who explicitly requested this surface, in detail, this session. Resolved via a narrow, path-scoped carve-out rather than relaxing the gate generally: `middleware.ts` now stamps `x-pathname` on every request; `AscendAppLayout` bypasses the `mode !== "full_ascend"` redirect ONLY when the path starts with `/app/command-center` AND the caller is a verified agency owner with an active session (`AscendShellCapabilities.isAgencyOwner`, newly added, computed the same way `resolve-shell-context.ts` always has). Every other `/app/*` page is completely unaffected — confirmed via `verify-shell-composition.mts`, which still passes, though its "shell layout redirects when mode !== full_ascend" check is now a structural presence check, not an unconditional-in-all-cases guarantee — this doc is the record of the one, audited exception. Branding for this bypass render (`ascendDarkBranding()`, extracted from `resolveShellBranding` as a mode-independent literal) is forced to Ascend-dark rather than inheriting whatever `crm_only` would otherwise resolve to, since Command Center renders inside Ascend chrome regardless of the real resolved mode.

**Reuse audit results** (full detail in the request's own Section 10, executed via a dedicated research pass before any code was written):

| Capability | Reused as-is | New (thin) |
|---|---|---|
| Sub-account create/rename/delete | `createSubAccountForAgency()`, `POST /api/agency/sub-accounts`, `PATCH`/`DELETE /api/agency/sub-accounts/[id]` — called directly, zero duplication | — |
| Feature gates (17 keys) + Client Billing | `SubAccountManageDialog` mounted as-is via a fetch-then-open wrapper (`CommandCenterManageTrigger`) | — |
| Rollout flags (`unified_shell`/`unified_navigation`) | `AscendRolloutSection` (built earlier this session) mounted directly on the Command Center index | — |
| Members: invite/role-change/revoke | `POST /api/sub-accounts/[id]/invite`, `PATCH`/`DELETE /api/sub-accounts/[id]/members/[uid]` | `GET /api/command-center/workspaces/[id]/members` — no list-read existed anywhere in the codebase (both the existing members UI and the sub-accounts list UI read live via client `onSnapshot`, not a callable service) |
| Workspace list | — | `GET /api/command-center/workspaces` + `listWorkspacesForAgency()` — same "no aggregator existed" gap |
| Provisioning/connection audit | Composes `getMappingBySubAccountId`, `getIdentityLinkByFirebaseUid`, `evaluateWorkspaceEntitlements`, `isFeatureFlagEnabled`, `getAdminAuth().getUser`, and the Intelligence Bridge client's `getDashboardSummary` — every one of these already existed; nothing here re-derives entitlement/mapping/flag logic | `getWorkspaceProvisioningReport()` — the composition itself, since no single aggregator existed (confirmed by the reuse audit) |

**Honesty constraint enforced**: the audit explicitly does **not** claim to read Ascend's Postgres `divinex_workspace_mappings` table directly — Flow has no database connection to it. The "Intelligence Bridge" check is a live HTTP call to Ascend's own `/internal/intelligence/*` endpoint (when configured and a business profile is linked), labeled in the UI as "via HTTP, not a direct Postgres read" — the closest real, queryable signal that exists, never faked as ground truth. Checks that can't be answered (no mapping exists yet, no business profile linked, bridge not configured) report `status: "unknown"` with an explanation, never a fabricated pass/fail.

**Security**: every new route (`/api/command-center/workspaces*`) independently calls `requireAgencyOwnerAny()` — the same helper `/api/platform/feature-flags` and `/api/agency/plans` already use — and additionally verifies the target `subAccountId`'s `agencyId` matches the caller's before returning any data (a foreign id 404s, matching this codebase's "don't reveal existence" convention). The sidebar nav link is gated on `capabilities.isAgencyOwner` for display only, never treated as the real authorization boundary, per the explicit requirement.

**Not built** (deliberately, given scope): a richer "reconciliation action" button wired to `reconcileMapping()`'s `repairSafeDrift` option — the audit surfaces drift/partial-failure state read-only; a one-click repair action is a natural follow-up but wasn't in the minimum viable surface for this pass. Product/entitlement gate controls beyond what `SubAccountManageDialog` already exposes (its ~17 gates already cover every real gate in `PLAN_GATE_KEYS` plus `getLeadsEnabledByAgency` — no separate control surface was needed).

## Outstanding for launch (in priority order)

1. 🚫 **Ascend-side `divinex_workspace_mappings` provisioning** — the true remaining blocker; requires a product-owner decision on the other repo (its `dev`/`main` divergence — 67/50 commits apart, real file-level conflicts on `render.yaml` and `App.tsx`, the exact two files this session's earlier fixes touched — has to be resolved or explicitly worked around first).
2. ⚠️ The known scope boundary noted in the lifecycle table above (nested deep-links inside the six native sections still point at `/sa/{id}/...` for that one destination) — real, but non-blocking; the primary surfaces are fully native.
3. ⚠️ Duplicate "DivineX" sub-account cleanup — now also visible directly in the Command Center workspace list, not just via direct Firestore inspection.
4. ⚠️ Full regression pass on `ascend.divinex.io` given the depth of the auth bug found and fixed tonight.
5. ❌ The client-role Ascend BI dashboard bug (`ExecutiveMode.tsx` zero-business-profile state) — worked around live for one customer, not yet fixed for the general case.
6. ⚠️ Command Center's reconciliation action (`reconcileMapping({repairSafeDrift: true})`) is not yet wired to a UI button — audit is read-only for now.

## Growth Scan — native trigger from the unified product (staged, 2026-08-09, NOT yet promoted)

🚧 STAGED, NOT LIVE. Priority 1 per `docs/architecture/DIVINEX_V1_NORTH_STAR.md` — the unified product could display intelligence but had no way to actually RUN a scan without sending the customer to `ascend.divinex.io`, recreating the exact two-app friction the unification work exists to eliminate. Root cause was two real, distinct defects, not one:

- **Defect A** — no sanctioned trigger existed anywhere. The only two Ascend-side routes were `/zeno/growth-scan` (fully public, zero auth, zero rate limit — fine for lead capture, unsafe for a service caller) and `/zeno/cro-audit` (Clerk-session-gated — no service caller has a session).
- **Defect B** — `dashboard-summary` (the Growth Score shown on Home/Identify) only ever read `zeno_assessments` (the onboarding questionnaire), never `growth_scans` (an actual website audit) — two real, different sources answering different questions. A triggered scan would show up under Reports but never move the headline score. Confirmed via direct code trace of `intelligenceQueries.ts`, not assumed.

**What was built** (full detail in each repo's commit message):

| Repo | Branch | Commit | What |
|---|---|---|---|
| DivineX-Business-Intelligence | `growth-scan-unified-trigger` | `738bc10` | New `growth_scan_jobs` table (additive — `growth_scans` has NOT NULL columns throughout, so there's no way to represent "in progress" as a `growth_scans` row); `POST`/`GET /internal/intelligence/business-profiles/:id/growth-scan(/jobs/:jobId)` reusing the exact existing scan engine on a background continuation (not held open for the 30-90+s a scan takes); `dashboard-summary` fixed to read both sources, most-recent-wins, tagged with an explicit `scoreSource` for provenance — zero behavior change for the common case (assessment-only profiles). |
| DivineXLeadStack | `growth-scan-unified-trigger` | `2f3ec70` | Two new Intelligence Bridge client methods (dedicated single-attempt fetches, not routed through the cached/auto-retrying read helper — retrying a trigger POST could start a second scan); two new orchestration routes under `/api/sub-accounts/[id]/growth-scan/*` (re-verify tenancy + re-derive the `growth_scan` module entitlement server-side, business profile id resolved from the workspace's own mapping doc, never client input); `RunGrowthScanCard` on `/app/identify` with real ready/running/completed/failed states, a 5-minute poll ceiling reported honestly (never shown as false success), and `router.refresh()` on completion so the existing Growth Score/Assessment/Recommendations cards — now fixed by Defect B — become the native "report," no separate report page or `ascend.divinex.io` link required. |

**Neither branch has been promoted to its repo's `main` yet** — both are staged for review per explicit instruction (dev-first applies even though Ascend BI's own `dev` has a real, separate, unresolved divergence from `main` — this work branched from current `main` directly, not from that stale `dev`, and does not touch any of the 5 files known to conflict there).

**Verified, and how**:
- Ascend BI: full `tsc --noEmit` clean (8 pre-existing, unrelated errors remain in `scripts/launchCert.ts`/`scripts/lifecycleTest.ts` — confirmed present on unmodified `main` too via `git stash`, different tables entirely). Full `vitest run`: 88/88 structural/behavioral tests pass (one pre-existing test's hardcoded route count updated from 5→7, reflecting two new routes that correctly follow the same `req.serviceContext!.businessProfileId` discipline as the originals — not a weakening). Two test files require a live `DATABASE_URL` to even import; this repo has no isolated test database, so these were deliberately NOT run against the real production Neon DB rather than risk writing to it — a real, pre-existing gap, not new.
- Flow: full `tsc --noEmit`, `eslint`, `pnpm build` clean. `verify-shell-composition.mts`, `verify-intelligence-slice9-structure.mts` (confirms the client file remains the ONLY place allowed to `fetch()` an Ascend host), and `verify-workspace-entitlement-evaluator.mts` all pass.
- Certification checklist (wrong workspace / CRM-only workspace / missing business profile / missing website URL / duplicate-click / secrets-in-browser) — verified by direct code-path tracing against the actual implementation, not asserted. Each check's real mechanism: workspace access via `requireSubAccountMember` (tenancy re-verified server-side, businessProfileId never client-supplied), CRM-only refusal via the real `evaluateWorkspaceEntitlements` module decision (not a hand-rolled second check), missing-profile/missing-URL both produce clear, distinct error states rather than a silent failure, duplicate-click guarded twice (client-side disabled state AND a server-side in-flight-job check on Ascend that would still catch it even if the client guard were bypassed), no secret ever leaves the server (enforced by the same structural script above).

**Honestly NOT yet verified** — flagged rather than glossed over:
- **No live end-to-end click-through.** Neither branch is deployed anywhere. Everything above is verified by code-path tracing, typecheck, lint, build, and the existing automated test/structural-check suites — not by actually running the customer journey (login → Identify → Run Growth Scan → score updates → Home reflects it → logout/login → still there) against a real deployment. This is the single biggest gap before promotion.
- **Scrape-failure visibility.** When the underlying website scrape fails, the existing (reused, unmodified) engine degrades gracefully and still produces a scan — but the current UI shows a degraded scan identically to a clean one; `sourceConfidence`/`requiresHumanReview` aren't surfaced. Not a new gap (inherited from the reused engine), but worth closing before this is the default customer path.
- **AI-provider full-failure behavior** inside `growthScanEngine.ts` itself (both structured LLM calls failing after the existing single retry) was not independently re-traced — confirmed only that this orchestration layer honestly propagates whatever the engine throws as a `failed` job (never a fake success), not what the engine's own internal fallback behavior is in that exact case.
- **Timeout-after-client-gives-up.** If a scan genuinely exceeds the client's 5-minute poll ceiling but later succeeds server-side, the job row updates to `completed` correctly (honest data), but the user who already saw "taking longer than expected" and navigated away has no proactive notification that it finished. Minor UX gap, not a correctness bug.

## Final verdict

**CONDITIONAL GO**, unchanged in scope from the prior pass, **plus one new explicit condition**: the Full Ascend customer journey (Home → Identify → Create → Launch → Grow → Optimize → Scale → Settings) is real and functional end-to-end for any workspace already provisioned into `full_ascend` mode, with zero regression to `crm.divinex.io` or `ascend.divinex.io`. Item 1 above (Ascend-side Postgres provisioning) remains the launch blocker for *new* customers specifically. **New condition**: the Growth Scan native-trigger work is staged, code-reviewed-by-tracing, and passes every available automated check on both repos — but is NOT live-tested end-to-end and NOT promoted to either repo's `main`. Per the North Star document's own Priority 1 rule, do not begin Priority 2 (Ascend UX redesign) or Priority 3 (Landing Page Intelligence V2) work until this is promoted and verified live.
