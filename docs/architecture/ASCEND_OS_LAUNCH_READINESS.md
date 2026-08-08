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
| Identify | ✅ VERIFIED WORKING | Composes Ascend intelligence data (growth score, assessments, recommendations, memory, timeline, blueprint) |
| Create | ⬜ MISSING (real UI) | Currently a placeholder linking to `/sa/{id}/funnels` + `/sa/{id}/website`. Scoped for Pass 3, not built this pass. Research already confirms `FunnelsList`/`FunnelBuilder`/`WebsiteBuilder` are prop-driven and directly reusable — lowest-risk of the six stubs. |
| Launch | ⬜ MISSING (real UI) | Placeholder linking to `/sa/{id}/broadcasts` + `/sa/{id}/workflows`. Pass 3. |
| Grow | ⬜ MISSING (real UI) | Placeholder linking to `/sa/{id}/pipeline`. Pass 3. |
| Optimize | ⬜ MISSING (real UI) | Placeholder linking to `/sa/{id}/reports`. Pass 3. |
| Scale | ⬜ MISSING (real UI) | Placeholder linking to `/sa/{id}/ai-suite` (Zeno). Highest-risk of the six (execution-authority questions) — needs dedicated scoping before Pass 3 touches it. |
| Settings | ⬜ MISSING (real UI) | Placeholder deep-linking to the legacy `/sa/{id}/dashboard/settings` page — notably hosts zero real settings UI itself, contrary to initial assumption during this audit. Pass 3. |

**2 of 8 sections are real. The other 6 are the identical placeholder component**, each honest about being a stub ("arrives in a future slice").

Sidebar lock icons are workspace-specific (driven by whether that workspace's entitlements include the matching module), not a global flag. The permission→module mapping is explicitly flagged in code as a first-pass Slice 8 decision, not finalized — revisit once each section's real UI exists.

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

## Outstanding for launch (in priority order)

1. 🚫 **Ascend-side `divinex_workspace_mappings` provisioning** — the true remaining blocker; requires a decision on the other repo.
2. ⬜ Real UI for Create, Launch, Grow, Optimize, Scale, Settings (Pass 3 — sequenced, not bundled).
3. ⚠️ Duplicate "DivineX" sub-account cleanup.
4. ⚠️ Full regression pass on `ascend.divinex.io` given the depth of the auth bug found and fixed tonight.
