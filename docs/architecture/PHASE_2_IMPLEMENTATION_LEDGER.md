# Phase 2 Implementation Ledger

Live tracking document, not a plan — updated after every implementation slice. Cross-references `PHASE_1_IMPLEMENTATION_BLUEPRINT.md` for design rationale; this file only tracks what actually happened.

---

## Wave A — Slice 1: Foundation verification

**Status:** ✅ Investigation complete. **No implementation code written yet — see checkpoint note at the bottom before Slice 2 begins.**

### Repository state (verified this slice)

| Repo | Branch | State |
|---|---|---|
| `DivineXLeadStack` (Flow) | `dev`, up to date with `origin/dev` | Uncommitted: `.claude/settings.local.json` (modified), `CLAUDE.md` (modified — Phase 0's SSO section), `docs/` (untracked — all Phase 0/1 architecture docs + this ledger). **Nothing from Phase 0/1 has been committed yet.** |
| `DivineX-Business-Intelligence` (Ascend) | `main` — **no `dev` branch exists on this repo** | Uncommitted: `docs/SSO_BRIDGE.md`, `docs/ASCEND_OS_V1_ARCHITECTURE_REFERENCE.md` (Phase 0 docs), plus **pre-existing untracked source files not created by this effort**: `artifacts/api-server/src/lib/crmIntegration.ts`, `sendLeadToCrm.ts`, and four other scripts (`backfillAllReports.ts`, `fixSilentFailures.ts`, `regressionSample.ts`, `sweepNewsletterContradiction.ts`, `triageRegression.ts`) |

**🆕 Repository-truth finding**: the third integration documented in Phase 0 (`crmIntegration.ts`) has **never been committed to git** on the Ascend side — it exists on disk, is real and working code (confirmed by direct read in Phase 0), but isn't in version control. This doesn't change Phase 0's findings (the code is real regardless of commit status) but is worth flagging to the product owner separately from this migration effort — uncommitted production integration code is a standing risk independent of Ascend OS.

**🆕 Repository-truth finding**: Ascend Intelligence has no `dev` branch — all work happens directly against `main`. Flow's `dev`-first discipline (this repo's own saved workflow preference, and Section 3.4 of this prompt) has no direct equivalent on the Ascend side today. **This needs a decision before any Ascend-side Phase 2 code is written**: either create a `dev` branch on Ascend now, or treat Ascend-side changes with extra manual caution given there's no existing staging branch to land them on first.

### Feature-flag mechanism inventory

**🆕 Repository-truth finding — contradicts an assumption in the Phase 2 prompt.** Section 3.3 requires "feature-flag every major customer-facing cutover" and Section 15 (priority order) proceeds directly from identity work into building flagged features, implicitly assuming a flag system already exists to build behind. **It does not.**

What exists today (✅ verified by grep across `src/`):
- **Flow's agency feature gates** (`emailDomainEnabledByAgency`, `apiAccessEnabledByAgency`, `funnelCheckoutEnabledByAgency`, etc. — 11 today, documented in `CLAUDE.md`'s "Agency feature gates" section) — these are **entitlement/access booleans per sub-account**, checked server-side, toggled by the agency owner. Structurally close to what's needed but semantically different: they gate *product access a customer paid for*, not *internal progressive rollout of a not-yet-certified feature to super-admin → QA → one workspace → beta → GA* (Phase 2 prompt, Section 12).
- **One hardcoded source-code boolean**: `GET_LEADS_PARKED` in `src/lib/get-leads/business-types.ts` — a build-time constant, not a runtime/per-user/per-workspace flag.
- **No LaunchDarkly, PostHog, or generic `featureFlags` collection with percentage/cohort rollout exists anywhere in the codebase.**

**Recommendation (🟡, to be confirmed before Slice 2 builds anything behind "a flag"):** build a minimal flag primitive reusing the **exact proven shape** of the existing agency feature-gate pattern — a Firestore doc (`system/featureFlags/{flagId}` or similar) read server-side, with an admin-only toggle UI, rather than adopting a third-party flagging service. This is new infrastructure work that Section 15's priority list doesn't currently list as a prerequisite step — flagging it as Priority 0, before Priority 1 ("extract/reuse identity primitives"), since nothing in Wave A can honestly ship "behind a flag" without it existing first.

### Identity / JIT provisioning — exact reusable functions (✅ verified, from Phase 0's direct source reads)

| Function | File | What it does | Reuse plan |
|---|---|---|---|
| `issueSsoBridgeToken(bridgeId)` / `verifySsoBridgeToken(token)` / `hashSsoBridgeToken(token)` | `src/lib/auth/sso-bridge-token.ts` (87 lines, full file already read in Phase 0) | HMAC-signed, single-use bridge token issue/verify | Reused as-is for the identity-link confirmation step (Blueprint §2.2) — no new token primitive needed |
| `verifySsoWorkspaceAccess({uid, subAccountId, approvedRole})` | `src/lib/auth/sso-workspace-access.ts` (67 lines, full file already read) | Re-validates active membership + role match, fails closed | This **is** the workspace-authorization check Blueprint §3.1's `evaluateWorkspacePermission()` builds on — not replaced, extended |
| JIT provisioning block (Phase C) | `src/app/api/auth/sso/callback/route.ts`, lines ~181–257 | Creates a passwordless Firebase user + `users`/`subAccountMembers`/`userMemberships` docs in one batch, rolls back via `deleteUser()` on partial Firestore failure | This is the exact code path Blueprint §2.3 stage 1 (backfill) reuses — needs extracting into a standalone, callable function (currently inlined in the route handler) so both the live SSO callback and a new offline migration script can call the same logic without duplicating it |
| `ssoBridge/{bridgeId}` Firestore doc shape | Same route, lines ~260–275 | Single-use, 30s-TTL, transaction-consumed | Template for the new `identityLinks` record's own consumption-safety pattern (Blueprint §2.2) |

**Extraction needed before Slice 2 can honestly say "reuse, don't duplicate" (Section 3.1's own rule)**: the JIT provisioning block above is currently inlined inside the callback route handler, not a standalone exported function. Making it callable from a migration script requires extracting it first — this is a small, safe, behavior-preserving refactor (move code, don't change it), not new logic, but it does touch the live SSO callback file, which is why it's named explicitly here rather than assumed trivial.

---

## Feature flags inventory

**Built this slice.** Server-only, Firestore-backed, agency-owner-managed. Six rollout stages: `off → internal_admin → internal_qa → single_workspace → beta → ga`. 12 flag IDs pre-registered (Phase 2 prompt §3.3's list) — all default to `off` (undefined doc = off, fail closed).

| File | Purpose |
|---|---|
| `src/types/feature-flags.ts` | `FeatureFlagDoc`, `FeatureFlagRolloutStage`, the 12 registered `FEATURE_FLAG_IDS` |
| `src/lib/flags/evaluate-flag.ts` | `isFeatureFlagEnabled(flagId, ctx)` — server-only evaluator |
| `src/lib/flags/manage-flags.ts` | `listFeatureFlags()`, `setFeatureFlag()` |
| `src/app/api/platform/feature-flags/route.ts` | GET/POST, agency-owner-gated (`requireAgencyOwnerAny`, existing) |
| `firestore.rules` | New `featureFlags/{flagId}` match block — `allow read, write: if false` (Admin-SDK-only, no client access at all) |

**Design note carried into the report**: "internal_admin" reuses Flow's existing `agencyRole === "owner"` check rather than a new platform-role system, since Flow has no separate internal-staff role today (Phase 1 blueprint §2.7 deferred platform roles as Ascend-specific). Documented inline in `evaluate-flag.ts`.

**Not built yet**: an admin toggle UI — API-only for now. Flagged explicitly as a fast-follow, not silently deferred.

**⚠️ Firestore rules change requires a manual deploy step not yet run**: `firebase deploy --only firestore:rules,firestore:indexes` — per this repo's own documented process, this needs to happen before the new `featureFlags` collection is actually locked down in production (until deployed, the collection doesn't exist yet in prod Firestore, so there's no live exposure window — but the rule needs deploying before any flag doc is ever written in production, not after).

## Migrations added

*(None — this slice's Firestore rules addition is new, not a migration of existing data.)*

## Tests added

*(None yet — flagged as a gap for the next slice touching this code, not silently skipped.)*

## Risks discovered this slice

1. No feature-flag system exists — see above. Blocks Section 3.3 compliance for every subsequent slice until resolved.
2. No `dev` branch on the Ascend repo — blocks Section 3.4's dev-first discipline for any Ascend-side code until resolved.
3. `crmIntegration.ts` and five other scripts are real, working, uncommitted code on Ascend's `main` — pre-existing risk, independent of this effort, worth a separate cleanup task.

## Decisions corrected this slice

None — Phase 0/1 architecture holds. The two findings above are gaps in *infrastructure prerequisites*, not contradictions of the approved architecture itself.

## Deployment state

Nothing deployed. No code written beyond this ledger and the repo-state investigation above.

## Browser verification state

Not started. Phase 0 §0.2's live SSO checklist remains outstanding and is a harder dependency for Wave A's certification gate (Blueprint/Phase 2 prompt §5.11) than for this slice.

## Rollback instructions

N/A — no code changes made this slice.

---

## Checkpoint before Slice 2 — resolved

1. **Feature-flag primitive**: confirmed — build it first, on Flow's `dev` branch, reusing the existing agency feature-gate pattern. In progress below.
2. **Ascend `dev` branch**: attempting to create one surfaced a pre-existing, unrelated finding — see below. **Ascend-side Phase 2 work is paused** pending the product owner's own review.

### 🛑 Blocking discovery — Ascend `dev`/`main` divergence (unrelated to Ascend OS, found while creating the branch)

A local `dev` branch already existed on `DivineX-Business-Intelligence` (tracked at `origin/dev`), and it has **diverged significantly from `main`**:

- `dev` (tip `3c4d3e8`) carries **~60 commits not present on `main`** — real-looking work: vision-based site audits (APIFlash), offer-sprawl detection, calibration/em-dash enforcement fixes, an OOM crash fix, headless-render fallback fixes, testimonial/CTA-extraction fixes, and more.
- `main` (tip `c7422b0`) has its own separate, more recent commits not on `dev` — marketing/homepage changes, onboarding email flows, the `/buy/growth-system` checkout link.
- **No merge commit or common recent ancestor close to either tip** — these are two branches that forked and were never reconciled, predating this effort entirely.

**No action taken** — did not push, merge, delete, or check out either branch beyond the local `git branch`/`git log` inspection above. This needs the product owner to determine which branch actually reflects what's deployed to `app.divinex.io` before any new work lands on either one; picking a side unilaterally risks either losing ~60 commits of real fixes or building on top of a branch that isn't what's actually in production. **Ascend-side Phase 2 implementation is paused until this is resolved separately from Ascend OS.**

Flow-side work (the feature-flag primitive, and everything else that doesn't touch the Ascend repo) is unaffected and continues below.
