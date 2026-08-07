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

- Committed to `dev` (2 commits: docs, then the flag primitive) and pushed to `origin/dev`. **Not merged to `main`, not deployed anywhere.**
- **Outstanding manual step**: `firebase deploy --only firestore:rules,firestore:indexes` has not been run — the new `featureFlags` rules block only takes effect in production once that's deployed. Deliberately not run automatically in this session (a live production Firestore rules deploy), left as an explicit action for the product owner or a later, dedicated deploy slice.

## Browser verification state

Not started. Phase 0 §0.2's live SSO checklist remains outstanding and is a harder dependency for Wave A's certification gate (Blueprint/Phase 2 prompt §5.11) than for this slice.

## Rollback instructions

- **Code**: `git revert 4c92849` (flag primitive) on `dev` — fully additive, nothing else references these files yet, safe to revert cleanly.
- **Firestore rules**: not yet deployed, so there's nothing live to roll back. Once deployed, rolling back means redeploying the previous `firestore.rules` revision (the `featureFlags` block is additive — removing it doesn't affect any other collection's rules).

---

## Wave A — Slice 3: JIT extraction + identityLinks model

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. Firestore rules for the two new collections are **not deployed** (deliberately deferred to the controlled staging/live certification step, per explicit instruction, alongside `featureFlags`' rules from Slice 2).

### 1. JIT provisioning extraction

Moved the SSO callback's inline Phase B(3/4)+C block (resolve-existing-user or JIT-provision-new-user) into `src/lib/auth/sso-jit-provisioning.ts::resolveOrProvisionFirebaseUser()`. The callback route (`src/app/api/auth/sso/callback/route.ts`) shrank from 294 to 196 lines and now just calls the extracted function and branches on `.ok`.

**Design choice**: the extracted function returns `{ok:true, uid} | {ok:false, errorPage}` rather than deciding the redirect itself — building the actual `NextResponse` stays a route-handler concern, matching how `verifySsoWorkspaceAccess()` already separates "business logic result" from "HTTP response shaping." `auditFailure()` is intentionally duplicated (5 lines) between the route and the new file rather than shared, to keep this specific diff minimal and behavior-preservation-focused — noted as a reasonable future cleanup, not bundled in here.

**Proof behavior was preserved** (not just asserted): `scripts/verify-sso-jit-extraction.mts` diffs the extracted function against the **actual last-committed pre-extraction route file** (via `git show HEAD:...`), not just the new code in isolation. 47 checks — every audit-reason string, every redirect target, the exact rollback call, the fail-closed return-count (7 failure paths, 2 success paths), and confirmation that the downstream session-cookie-creation file (`exchange-bridge-token/route.ts`) was never touched. First run caught 4 real discrepancies, all confirmed as harmless refactor artifacts (parameter renaming, `getAdminAuth()` called inline vs. a cached local var — verified functionally identical by reading `lib/firebase/admin.ts`, which returns a cached singleton either way) rather than real regressions — the test was fixed to tolerate those specific, verified-safe differences while still catching anything else. All 47 checks pass.

### 2. `identityLinks` model

`src/types/identity-links.ts` + `src/lib/auth/identity-links-service.ts`. Storage: `identityLinks/{clerkUserId}` (doc ID = clerkUserId → free uniqueness), `identityLinksByFirebaseUid/{firebaseUid}` (reverse index, same trick for firebaseUid uniqueness), `identityLinkAttempts/{auto}` (append-only audit log, mirrors the existing `ssoAuditEvents`/`ssoLoginAttempts` pattern).

- **Idempotent create**: `createIdentityLinkIdempotent()` runs inside one Firestore transaction — identical re-run of the same pairing is a no-op; a conflicting pairing on either ID is returned to the caller, never silently overwritten.
- **Never links by email**: `emailAtLinkTime` is stored for audit display only — no function reads it back as a comparison/lookup condition (verified by `verify-identity-links.mts` 2a–2c).
- **Status**: `active | revoked | superseded`. **Migration state**: `not_started | in_progress | complete | failed`, tracked separately from status.
- **Failure recording**: `recordIdentityLinkFailure()` — attempt-log only (no link doc exists yet at the point this fires), never accepts/logs a secret or token.

Regression coverage: `scripts/verify-identity-links.mts`, 25 checks, all passing.

### 3. Dry-run + single-user backfill tooling

`scripts/backfill-identity-link.mts`. **Deliberately narrow scope**: links exactly one explicitly-named user per invocation. There is no loop/batch code path in the file at all — not disabled by a flag, genuinely absent. Dry-run is the default; `--execute` is required to write anything; an already-linked user is a no-op (idempotent).

**Real gap, named rather than hidden**: a full batch backfill needs a bulk "list eligible Clerk users with an active entitlement" source. That data lives in Ascend Intelligence's `entitlements` table and has no callable endpoint today — building one would mean writing new Ascend-side code, which this slice's instructions explicitly deferred until the `dev`/`main` divergence (Slice 1 finding) is resolved. **Bulk backfill is blocked on that, not on anything in this slice.**

### Verification run this slice

| Check | Result |
|---|---|
| `npx tsx scripts/verify-sso-jit-extraction.mts` | ✅ 47/47 |
| `npx tsx scripts/verify-identity-links.mts` | ✅ 25/25 |
| Existing `scripts/verify-*.mts` regression scripts | 7 of 10 fail with an identical, **pre-existing** `server-only` module-guard error when dynamically importing `firebase-admin`-dependent modules via `tsx` — confirmed pre-existing (not caused by this slice) by reproducing the identical failure via `git stash` against the clean committed state. `verify-cta-popup-fixes.mts` (doesn't touch Firebase-dependent modules) passes. Worth a dedicated fix later — these scripts' invocation method appears to have broken independent of Ascend OS work — but out of scope for this slice per "no new warnings/errors introduced." |
| `npx tsc --noEmit` | ✅ Clean |
| `pnpm lint` | ✅ Zero new issues (same 32 pre-existing problems as Slice 2's baseline, none in any Slice 3 file) |
| `pnpm build` | ✅ Clean |

### Firestore rules deployment — still deferred

`identityLinks/{clerkUserId}`, `identityLinksByFirebaseUid/{firebaseUid}`, and `identityLinkAttempts/{attemptId}` are added to `firestore.rules` (Admin-SDK-only, same pattern as `featureFlags`) but **not deployed**, per this slice's explicit instruction — bundled with `featureFlags`' rules deploy into the controlled staging/live certification step once Workspace Mapping v2 makes the whole identity foundation actually usable end-to-end.

### Dependency on the Ascend branch divergence

Unchanged from Slice 2 — Ascend-side work stays paused. This slice's only Ascend-adjacent gap (bulk-eligible-user enumeration for the backfill tool) is explicitly blocked on that resolution, not worked around.

## Wave A — Slice 4: Workspace Mapping v2

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. Firestore rules for the three new collections are **not deployed** — grouped with `featureFlags` and `identityLinks*`'s rules for the same later controlled deployment step.

### Repository-truth confirmation pass (before writing code)

Re-confirmed against live source rather than assumed from the architecture docs:

| Item | Confirmed value |
|---|---|
| `SubAccountRole` | `"admin" \| "collaborator"` only — `"agencyOwner"` is a claims-based shortcut synthesized by `requireSubAccountMember()`, never a stored `SubAccountMemberDoc.role` value |
| `SubAccountStatus` | `"active" \| "archived"` only — **no `"suspended"` at the SubAccount level.** Confirms the Workspace Mapping's own `status: "suspended"` is a mapping-layer-only construct with no corresponding SubAccountDoc field flip — consistent with the architecture docs' data-ownership design (suspension ≠ touching the underlying SubAccount), not a contradiction requiring correction |
| `AgencyDoc.ownerUid` | Confirmed field name |
| Ascend `businessProfiles` schema | **Confirmed no `isPrimary`/`isCanonical`/`primaryProfile` field exists anywhere** — directly verified by grepping the schema file. This makes the "never auto-select a primary profile" instruction not just a policy choice but the only technically honest option: there is no data-driven signal to select from even if auto-selection were wanted |
| `divinex_workspace_mappings` fields | Unchanged from Phase 0/Slice 1 findings — `clerkUserId, leadstackSubAccountId, leadstackRole, leadstackFirebaseUid, provisioningAllowed, connectionStatus` |

**No contradiction between the architecture docs and live code was found this slice** — the docs' design held up under direct verification. The one naming deviation (`ownerFirebaseUid` instead of the earlier draft's `ownerUserId`) was already specified in this slice's own instructions, not discovered as a correction.

### Model and collections

`src/types/workspace-mappings.ts` + `src/lib/workspace/workspace-mappings-service.ts`. Storage:
- `workspaceMappings/{workspaceId}` — main doc, `workspaceId` is a generated UUID (not derived from `flowSubAccountId`)
- `workspaceMappingsBySubAccount/{flowSubAccountId}` → `{workspaceId}` — reverse index; doc-ID-as-uniqueness-constraint gives `flowSubAccountId` uniqueness for free (same trick as Slice 3's `identityLinksByFirebaseUid`)
- `workspaceMappingAttempts/{auto}` — append-only audit log

Fields exactly as specified in this slice's instructions: `workspaceId, flowSubAccountId, agencyId, ownerFirebaseUid, primaryAscendBusinessProfileId, linkedSecondaryAscendBusinessProfileIds, status, provisioningStatus, mappingVersion, lastReconciliationResult, createdAt, updatedAt`.

### Invariants — how each of the 10 required ones is actually enforced

| # | Invariant | Enforcement |
|---|---|---|
| 1 | One `flowSubAccountId` → one mapping | Doc-ID uniqueness on `workspaceMappingsBySubAccount/{flowSubAccountId}` |
| 2 | One Workspace → exactly one canonical SubAccount | `flowSubAccountId` is a single required field on `WorkspaceMappingDoc`, not an array — structurally can't hold more than one |
| 3 | No primary/secondary overlap | `validateNoPrimarySecondaryOverlap()` (pure), called by every mutation that touches profile links |
| 4 | Secondary IDs deduplicated | `dedupeSecondaryProfileIds()` (pure, `Set`-based), called on every write path that touches the array |
| 5 | Archived mappings stay queryable | `archiveMapping()` only flips `status`, never deletes; confirmed by structural test 3c (no `.delete()` call exists anywhere in the service file) |
| 6 | Idempotent creation | `createMappingIdempotent()` — same-owner re-create is a no-op (`created: false`); different-owner is a rejected conflict, never merged |
| 7 | Idempotent, retry-safe reconciliation | `reconcileMapping()` re-reads live state every call, writes only `lastReconciliationResult` (+ optionally `agencyId`) — safe to run any number of times |
| 8 | Conflicts never silently overwrite | Every conflict path (`create`, `attach primary over an overlap`, etc.) returns `{ok: false, reason}` and the transaction never reaches a write |
| 9 | Version increments on every material change | Centralized in the shared `withMapping()` helper's transaction — every one of the 6 mutating functions routes through it, confirmed structurally (test 2b, all 6) |
| 10 | Append-only audit event on every create/conflict/relink/status-change/archive/restore/reconciliation | `logAttempt()` called from every one of those paths — confirmed structurally (test 6, 5 distinct outcomes checked) |

### A real design upgrade made mid-slice: pure mutation logic, not just validation

Initially the profile-attach/promote/add/remove logic was written inline inside each service function's Firestore-transaction callback. Refactored during this slice into pure, Firestore-free functions in `workspace-mapping-invariants.ts` (`computeAttachPrimary`, `computeAddSecondary`, `computeRemoveSecondary`, `computePromoteSecondaryToPrimary`) that the service layer now just calls and applies. This is what makes the **genuine unit tests** below possible — real function calls with real assertions on the actual mutation logic (e.g., "promoting a secondary moves the old primary into the secondary list, nothing is lost"), not just checking that certain source-text patterns exist.

### Authorization — human-session vs. service-to-service, explicitly separated

`src/lib/workspace/workspace-mappings-authz.ts` wraps read/reconcile operations with Flow's **existing** `requireSubAccountMember()` (unchanged, not reimplemented) before delegating into the core service. `workspace-mappings-service.ts` itself has zero import of `require-tenancy` or `NextResponse` — confirmed structurally (test 9e) — so it's impossible for a future caller to accidentally treat the unauthenticated service layer as if it were already access-checked. Migration/reconciliation scripts call the core service directly with `actingAsUid: "system:migration-tool"` / `"system:reconciliation-tool"` audit markers.

### Migration tooling

1. **Dry-run** (`scripts/dry-run-workspace-mapping-migration.mts`) — reads source rows from an **input JSON file**, not live Ascend Postgres (same constraint and same reasoning as Slice 3's backfill tool — no safe way to query Ascend live while its branch divergence is unresolved). The Flow-side checks (sub-account existence, identity-link existence) ARE real, live Firestore reads against this repo's own data. Reports every category the instructions required: eligible, missing sub-account, missing identity link, multiple primary candidates, duplicate `flowSubAccountId`, invalid role/status, requires manual review. **Writes nothing** — confirmed structurally (test 10a).
2. **Single-mapping migration** (`scripts/migrate-single-workspace-mapping.mts`) — one explicit source mapping per run, no loop/batch code path exists, dry-run by default, requires an **explicit** `--primary-profile-id` or `--no-primary-profile` flag (refuses to proceed on an unstated primary), idempotent (checks for an existing mapping first).
3. **Reconciliation** (`scripts/reconcile-workspace-mapping.mts`) — thin CLI wrapper around `reconcileMapping()`. Confirms the Flow sub-account exists, agency relationship, owner membership; reports drift; `--repair-safe-drift` auto-corrects **only** the `agencyId` mismatch case (Flow SubAccount is unambiguously authoritative there) — ownership/membership drift is reported only, never guessed, regardless of the flag (confirmed structurally, test 5d).

**No production batch migration was executed or built this slice**, per explicit instruction.

### Primary-profile selection — the explicit correction, implemented literally

`classifyMigrationRow()` (pure, unit-tested) has **no code path that selects a primary profile automatically under any circumstance** — 2+ candidates always classify as `multiple_primary_candidates` with all candidates surfaced for manual review, confirmed by a unit test that deliberately includes a more-recently-updated second candidate and asserts it is NOT auto-selected. This is stronger than "the default behavior avoids auto-selecting" — the capability to auto-select doesn't exist in the function at all.

### Tests

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-workspace-mapping-invariants.mts` | **Genuine unit tests** — real function calls, real assertions, zero Firebase imports | ✅ 27/27 |
| `scripts/verify-workspace-mappings-service.mts` | Structural/source-level (Firestore-dependent code, same necessary constraint as Slice 3) | ✅ 34/34 |
| `scripts/verify-sso-jit-extraction.mts` (Slice 3) | Regression | ✅ 47/47 — **fixed during this slice**: was diffing against a floating `git show HEAD:...`, which broke once Slice 3's own commit became HEAD (compared the extraction against itself). Re-pinned to the specific pre-extraction commit hash (`4c92849`) so it stays meaningful indefinitely, not just at the moment it was written. Not a real regression — a test-infrastructure bug, found and fixed. |
| `scripts/verify-identity-links.mts` (Slice 3) | Regression | ✅ 25/25, unaffected |
| Other pre-existing `verify-*.mts` | — | Same 7-of-10 pre-existing `server-only` module-guard failures as Slice 3, confirmed unrelated to this slice (unchanged root cause) |
| `npx tsc --noEmit` | — | ✅ Clean (one real, self-inflicted generic-inference bug in `withMapping<T>()` found and fixed mid-slice — see below) |
| `pnpm lint` | — | ✅ Zero new issues |
| `pnpm build` | — | ✅ Clean |

**A real type bug found and fixed by tsc, not by the test scripts**: `withMapping<T>()`'s original signature let the mutate callback return either the outer `WorkspaceMappingResult<T>` or a bare `{doc, value}` shape, which confused TypeScript's generic inference into widening `T` to `null | undefined` at several call sites (4 real `tsc` errors). Fixed by introducing a dedicated, narrower `MutateOutcome<T>` type for the callback contract, distinct from the outer result type. Genuine tsc-caught defect, not a false positive — worth naming since the other "failures" caught during this and the prior slice were mostly test-assertion issues, and this one wasn't.

### Firestore rules — still deferred

`workspaceMappings/{workspaceId}`, `workspaceMappingsBySubAccount/{flowSubAccountId}`, `workspaceMappingAttempts/{attemptId}` added to `firestore.rules`, Admin-SDK-only. **Not deployed.**

### Dependency on the Ascend branch divergence

Unchanged — Ascend-side work stays paused. This slice's Ascend-adjacent gap (the dry-run tool needing source rows as file input rather than a live Postgres query) is the same category of gap as Slice 3's, blocked on the same resolution.

### Remaining gap before the next slice

The dry-run migration tool's live Flow-side checks work today; a *real* production dry run still needs someone to actually export the `divinex_workspace_mappings` rows + candidate business profiles from Ascend into the expected input JSON shape — that export step itself depends on the Ascend branch divergence being resolved, same as Slice 3's bulk-enumeration gap.

## Wave A — Slice 5: Unified Workspace Permission Evaluator

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. One new collection (`workspacePermissionAudit`) added to `firestore.rules`, **not deployed**.

**Minor correction to the Slice 3 ledger entry**: re-running all pre-existing `verify-*.mts` scripts this slice found **9 of the original 10 fail** with the known `server-only` module-guard error (`verify-cta-popup-fixes.mts` is the only one that passes) — Slice 3's entry said "7 of 10." Same root cause, same pre-existing/unrelated status, just a wrong count recorded at the time. Corrected here rather than silently left wrong.

### Audit findings (no contradictions with the architecture docs — everything held up)

| Item | Confirmed |
|---|---|
| `requireSubAccountMember` / `requireSubAccountAdmin` / `requireAgencyOwnerAny` | Exact shapes reused as-is (already read in full during Slice 1/3) |
| Firestore rules helpers | `isAgencyOwner()` (0 reads, claim-only), `canAccessSub()` (any active member — read tier), `canAdminSub()` (admin or owner — structural tier) — confirms exactly the two-tier + owner-shortcut model this evaluator's compatibility mapping is built on |
| `lib/auth/territory-filter.ts` | Real, existing resource-level conditional-restriction mechanism (`loadEffectiveTerritoryScope`, `territoryGate`) — reused for `resourceContext.territoryId`, not reimplemented |
| Real agency feature-gate fields | **15 exist**, not the ~9-10 prose-summarized in `CLAUDE.md`'s table — grep-confirmed against `src/types/tenancy.ts`: `aiSuiteEnabledByAgency, apiAccessEnabledByAgency, broadcastsEnabledByAgency, communityEnabledByAgency, customDomainsEnabledByAgency, emailDomainEnabledByAgency, funnelCheckoutEnabledByAgency, funnelsEnabledByAgency, getLeadsEnabledByAgency, metaInboxEnabledByAgency, missedCallTextBackEnabledByAgency, outboundVoiceEnabledByAgency, socialPlannerEnabledByAgency, websiteEnabledByAgency, whatsappEnabledByAgency`. No shared "check this gate" read helper exists — every route reads the field directly (`sub.xEnabledByAgency === true`); this evaluator follows the same convention rather than inventing a wrapper the codebase doesn't otherwise use. |
| `lib/billing/status.ts::effectiveBillingState()` | Real, pure, reusable — confirms Client Billing v1's real lapsed/grace/pending/comped states and, critically, that **the agency owner is never walled** (direct quote from `CLAUDE.md`'s Client Billing section) — this evaluator's billing check reuses this function and preserves that exact exemption |
| `lib/auth/require-admin.ts` | A **separate, legacy/global** `Role`/`MemberStatus` system, distinct from `SubAccountRole` — not the same axis as Workspace permissions. Noted as out of scope, not folded into this evaluator. |

### Permission registry

`src/types/workspace-permissions.ts` — **53 permissions**, exactly the list from this slice's instructions, type-safe (`WorkspacePermission` union + `isWorkspacePermission()` type guard). No route or script may reference a permission as a bare string literal outside this file.

### Compatibility role mapping

`src/lib/permissions/workspace-permission-compat.ts` — pure, generated from two named exception lists rather than 53×3 hand-written entries:

| Tier | Rule | Permissions |
|---|---|---|
| `agencyOwner` | Everything | All 53 (matches today's real unrestricted agency-wide authority) |
| `admin` | Everything except agency-scoped | All 53 except `agency.manage` (matches `canAdminSub`'s real ceiling) |
| `collaborator` | Read + core CRM operations | Everything NOT in the `ADMIN_OR_ABOVE` list (26 permissions — billing, member management, deletions, publishing, sending, Stripe, domains, API, agency, `zeno.execute`, `assessments.run`, memory writes/approvals, `recommendations.approve`, `reports.export`) |

**Honesty note recorded per this slice's own instruction**: this is not a permission-by-permission audit of every route's exact current guard (that would mean reading dozens of files this slice didn't touch) — it's the verified two-tier Firestore-rules pattern applied consistently with domain judgment, erring toward the more restrictive option (deny for collaborator) wherever precise verification wasn't done. **Proven monotonic by a real unit test**: collaborator's allowed set is always a strict subset of admin's, admin's always a subset of agency owner's — mechanically guarantees no tier accidentally gains what a higher tier lacks.

### Evaluation algorithm

`src/lib/permissions/evaluate-workspace-permission.ts`, exact required order (source-verified in this order, not just documented):
1. Validate the permission key (`isWorkspacePermission`) — unknown strings denied, not evaluated.
2. Resolve caller identity (`resolveAuthedCaller(uid)`, new — see extraction below) — never trusts a caller-supplied role.
3. Confirm sub-account exists + caller has active access (`resolveSubAccountAccess`, new — the **extracted**, not reimplemented, core of the existing `requireSubAccountMember`).
4. If a Workspace Mapping v2 record exists (Slice 4), confirm it isn't archived — its absence is normal, never a denial on its own.
5. Entitlement/feature-gate requirements: Client Billing lapsed state (agency owner exempt, matches real behavior) + the permission's real feature-gate requirement, if any.
6. Role-to-permission compatibility mapping.
7. Deny by default — exactly one allow return-point in the whole function, structurally confirmed.

### A real, in-scope extraction: `require-tenancy.ts`

The core evaluator must not import `NextResponse` (explicit requirement), but `requireSubAccountMember` — the existing tenancy check this evaluator must reuse, not reinterpret — returns `NextResponse` on failure. Extracted the NextResponse-free core (`resolveSubAccountAccess`, `resolveAuthedCaller`) directly into `lib/auth/require-tenancy.ts`, with `requireSubAccountMember` becoming a thin wrapper that maps the new typed reasons back to the exact original status codes/messages. Same discipline as Slice 3's SSO/JIT extraction: characterization test (`scripts/verify-require-tenancy-extraction.mts`, diffs against the specific pre-extraction commit `6032270`) proves every original status code, error message, and the agency-owner-shortcut-before-membership-read ordering survived unchanged. 21/21 checks pass.

### Entitlement / feature-gate behavior

`src/lib/permissions/workspace-permission-requirements.ts` — only maps permissions to gates that **actually exist and actually gate that behavior today**: `api.manage→apiAccessEnabledByAgency`, `broadcasts.send→broadcastsEnabledByAgency`, `stripe.connect→funnelCheckoutEnabledByAgency`, `funnels.create/publish→funnelsEnabledByAgency`, `websites.create/publish→websiteEnabledByAgency`, `domains.manage→customDomainsEnabledByAgency`, `zeno.advise/execute→aiSuiteEnabledByAgency`. **Deliberately unmapped, not invented**: `assessments.*`, `memory.*`, `recommendations.*` — Ascend Intelligence has no Flow-side gate at all today. The `RequiredAscendTier`/`ascendTier` type exists as a named future extension point (the natural signal: an active Workspace Mapping v2 record) but is never set on any requirement this slice — confirmed by a unit test.

### Authorization wrappers

`src/lib/permissions/workspace-permission-wrappers.ts` — exactly three entry points, all delegating to the one core evaluator:
1. `requireWorkspacePermission(request, input)` — human session, extracts uid from the existing `x-user-uid` header convention, returns a generic (never internally-detailed) error to HTTP callers on denial.
2. `evaluateServiceToServicePermission({representedUid, ...})` — `representedUid` is a required field, not optional; a shared secret alone can never imply blanket authorization, matching this slice's explicit requirement. Defensively rejects an empty string before ever calling the evaluator.
3. `evaluateZenoCapabilityPermission({representedUid, ...})` — a named, typed stub for the future Zeno execution bridge (not built, not wired up anywhere yet) so that future slice has an entry point to call rather than inventing one under time pressure.

### Audit behavior

`src/lib/permissions/workspace-permission-audit.ts` — every denial gets a structured `console.warn` (cheap, always observable). A named `HIGH_RISK_PERMISSIONS` list (`billing.manage, stripe.connect, api.manage, agency.manage, orders.refund, members.manage, zeno.execute, domains.manage, integrations.manage`) additionally gets a persistent, append-only Firestore row on **every** evaluation (allow or deny) — for these specific actions, knowing who was allowed matters as much as who was denied. Routine reads (`contacts.read`, `workspace.read`, etc.) never produce a persistent row, confirmed by a unit test that they're absent from the high-risk list.

### Tests

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-workspace-permission-registry.mts` | **Genuine unit tests** (real calls, real assertions, zero Firebase import) | ✅ 60+/60+ — registry completeness, agencyOwner-unrestricted, admin-minus-agency.manage, collaborator allow/deny lists, **monotonic hierarchy proof**, malformed-role deny-by-default, real-vs-invented entitlement mapping |
| `scripts/verify-workspace-permission-evaluator.mts` | Structural (Firestore-dependent evaluator/wrappers/audit) | ✅ 27/27 — no NextResponse import, evaluation order, never-trust-caller-role, never-cross-workspace, deny-by-default single-allow-path, reuse (not reimplementation) of billing/territory/mapping logic, sensitive-data non-leakage, service-to-service representedUid enforcement, audit tiering |
| `scripts/verify-require-tenancy-extraction.mts` | Regression/characterization | ✅ 21/21 |
| Slice 3 SSO/JIT, identity-links | Regression | ✅ 47/47, 25/25, unaffected |
| Slice 4 invariants, service | Regression | ✅ 27/27, 34/34, unaffected |
| Other pre-existing `verify-*.mts` | — | 9 of 10 fail with the identical pre-existing `server-only` error (count corrected above); confirmed unchanged by this slice |
| `npx tsc --noEmit` | — | ✅ Clean |
| `pnpm lint` | — | ✅ Zero new issues |
| `pnpm build` | — | ✅ Clean |

Two genuine test-assertion mistakes were found and fixed while writing this slice's own tests (not false alarms about the *code* — both were errors in the test I'd just written): a miscounted permission total (53, not the 52 I first typed) and a comment-string false-positive on the "no NextResponse import" check (my own explanatory comment contained the word "NextResponse"). Both fixed to check the real thing rather than relaxed to pass.

### Risks

- The collaborator compatibility mapping (documented above) is a reasoned application of a verified pattern, not a route-by-route audit — flagged as the one place this slice's confidence is "high, not certain." Any future slice that touches a specific domain's real routes should verify and correct if it finds a mismatch, per the "record contradictions" instruction.
- `workspacePermissionAudit`'s Firestore rule is added but not deployed — no live enforcement change yet, consistent with every prior slice.

### Deferred / explicitly not done this slice

Per instructions: no unified shell, no persisted-membership migration to the future seven-role matrix, no Zeno execution wiring (stub only), no authentication changes, no Ascend-side work (still paused on the branch divergence).

## Wave A — Slice 6: Unified Entitlements & Workspace Access Composition

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. One new collection (`workspaceEntitlementAudit`) added to `firestore.rules`, **not deployed**.

### Audit findings (no contradictions with the architecture docs)

| Item | Confirmed |
|---|---|
| Two REAL, existing usage-tracking systems | `lib/ai-suite/usage.ts` (per-day `{messages, actions}` counters, `subAccounts/{id}/aiSuiteUsage/{day}` or agency-scoped) and `lib/comms/usage.ts` (per-user monthly `{email, sms}` counters, `usage/{uid}`). **Both tracking-only, zero enforcement** — confirms `CLAUDE.md`'s own "No enforcement in MVP" claim rather than contradicting it. Neither is wired into this slice's usage engine (no real limit exists to compare against) — named as the natural future data sources. |
| `PLAN_GATE_KEYS` | 14 entries — exactly Slice 5's 15 real gate fields minus `getLeadsEnabledByAgency` (correctly excluded, that feature is parked). Confirms Slice 5's gate-field audit was accurate. |
| Two SEPARATE subscription axes | `AgencyDoc.subscriptionStatus` (the agency owner's own platform subscription — Free/Pro/Scale) vs. `SubAccountBilling.status` (Client Billing v1 — the agency charging ITS clients). Slice 5 already correctly used the per-workspace one (`effectiveBillingState`); this slice's evaluator reuses the same one, deliberately not touching the agency-level axis (out of scope, a higher-level concern than workspace entitlements). |
| `BillingPlanDoc.gates: PlanGates` | Confirms plans already bundle feature gates today (Client Billing v1) — this slice's registry doesn't re-derive from the Plan doc directly, since the SubAccountDoc's own gate fields are already the resolved/applied source of truth (same convention Slice 5 uses). |
| No "CRM-only vs Full Ascend" field anywhere | Re-confirmed (already found in Slice 5). The only real signal is an active Workspace Mapping v2 record (Slice 4) — that's what `effectiveTier` actually uses, nothing invented. |

### Canonical entitlement model

`src/types/workspace-entitlements.ts` — `WorkspaceTier` (`crm_only`/`full_ascend`), `WorkspaceModule` (25 modules, exactly the list from this slice's instructions), `WorkspaceAddon` (4, all future/inactive), `UsageLimitType` (8), `WorkspaceUsageStatus`, `WorkspaceCapability`, `WorkspaceEntitlementRegistryEntry`. Reuses Slice 5's `RequiredFeatureGate` type rather than a second gate-name system — see the one real, needed extension below.

### Registry

`src/lib/entitlements/workspace-entitlement-registry.ts` — all 25 modules, each declaring `requiredTier`, `requiredFeatureGate` (Slice 5's real, verified fields only), `usageLimitType`, `addonSupport`, `metered`, `optional`. Flow-owned CRM modules (10) have no tier/gate requirement at all — they work CRM-only, confirmed real. Ascend-owned modules (7: `ascend_intelligence`, `business_memory`, `growth_scan`, `cro_audit`, `blueprints`, `business_timeline`, `recommendations`) require `full_ascend`, no invented Flow gate. `communities`/`courses` share one real gate (`communityEnabledByAgency`, confirmed same underlying service file per the Phase 1 blueprint's own finding).

### A real, additive extension to Slice 5's shared type

`communityEnabledByAgency` is a real, verified gate field (was already part of Slice 5's own 15-field audit list) that Slice 5's `RequiredFeatureGate` union just didn't happen to include, since none of its 53 permissions needed it. `tsc` caught this immediately (a genuine compile error, not a test failure) when the registry tried to use it. Extended `src/types/workspace-permissions.ts`'s `RequiredFeatureGate` union to add it — purely additive, re-ran all of Slice 5's tests afterward to confirm zero impact (all still pass).

### Evaluation algorithm

`src/lib/entitlements/evaluate-workspace-entitlements.ts`, no `uid` parameter — **entitlements are a property of the Workspace, not the caller** (the key conceptual distinction from Slice 5's per-user permissions). Order:
1. Missing/archived sub-account → deny every module (`workspace_inactive`/`workspace_archived`).
2. Archived Workspace Mapping v2 (Slice 4, reused) → also deny every module.
3. Effective tier: an ACTIVE mapping → `full_ascend`; anything else → `crm_only`.
4. Billing state (`effectiveBillingState`, reused) — a `lapsed` state denies every module **except for the agency owner**, mirroring the real, documented BillingGuard exemption (matches Slice 5's identical exemption).
5. Per module (all 25): tier requirement → feature-gate requirement → usage limit (mechanism only, never fires today — no real limit exists) → allow.
6. Deny by default for anything unrecognized (`unknown_module`).

### A real design improvement made mid-slice (mirrors Slice 4's pattern)

The per-module decision logic (`evaluateModule`) never actually touched Firestore itself — it only read plain data already fetched by the caller. Extracted into `src/lib/entitlements/workspace-entitlement-decision.ts` (no Firebase import at all) so it's genuinely unit-testable, same discipline as Slice 4's `computeAttachPrimary`/etc. extraction.

### A real bug found and fixed mid-slice (not a false positive)

The first draft of `denyAll()` looped over all 25 modules calling the per-decision audit logger — for the three blanket-deny reasons (which are in the persistent-audit list), that would have written **25 Firestore rows for one archived-workspace check**, exactly the "excessive write traffic" this slice's own instructions warn against. Caught during design review before ever being tested, not by a failing test. Fixed by splitting the audit module into `logEntitlementDecision` (per-module, console-only, never persists) and a separate `logWorkspaceLevelDenial` (one persistent row per blanket-deny evaluation, called once by `denyAll()`, never from inside the per-module loop) — structurally confirmed by a dedicated test.

### Billing composition

Reuses `lib/billing/status.ts::effectiveBillingState()` verbatim — no reimplementation. `lapsed` → deny-all except agency owner. `comped`/`active`/`grace`/`pending` all pass through to per-module evaluation (this slice doesn't further distinguish them at the entitlement layer — that's Client Billing's own existing UI concern, not duplicated here).

### Feature-flag composition

Note: this slice composes **feature GATES** (`*EnabledByAgency`, agency-controlled product toggles), not Slice 2's progressive-rollout **feature FLAGS** (`featureFlags` collection, internal staged-rollout mechanism) — the two are different axes, confirmed not to overlap in this slice's scope. No entitlement in this slice depends on a Slice 2 flag; that flag system gates internal Ascend OS shell rollout, not customer product access.

### Usage abstraction

`src/lib/entitlements/workspace-usage.ts` — `computeUsageStatus(type, used, limit)`, `isUsageWithinLimit()`. `limit: null` = unlimited, the only state that exists in the repository today for every usage type (confirmed by audit — no real plan limit is enforced anywhere). Engine only, per explicit instruction — no real limit value invented.

### Upgrade recommendation model

`src/lib/entitlements/workspace-upgrade-recommendations.ts` — `buildUpgradeRecommendation()`, pure. Returns `null` for an allowed decision. For a blocked one, pulls `requiredTier`/`addonSupport` straight from the registry (never invents beyond what's declared) and a human-readable `upgradePath` string keyed by denial reason. No checkout integration, no pricing, no Stripe call anywhere in this file.

### Wrappers

`src/lib/entitlements/workspace-entitlement-wrappers.ts` — four entry points, all delegating to the one core evaluator: human-session (`requireWorkspaceEntitlements`), server action (`getWorkspaceEntitlementsForServerAction`), service-to-service (`evaluateWorkspaceEntitlementsForService` — `representedUid` required, same non-bypassable discipline as Slice 5), and future Zeno/Ascend-bridge stubs (not wired up anywhere). **Every human-facing wrapper composes with Slice 5's `evaluateWorkspacePermission()` first** (`workspace.read`) — the required "compatibility with Slice 5" wiring, done once at the wrapper layer so no call site has to remember it.

### Audit behavior

Reuses Slice 5's philosophy exactly: per-module denials are console-only; only the three blanket, whole-workspace reasons get a persistent row, and only one per evaluation (see the bug-fix above).

### Tests

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-workspace-entitlements.mts` | **Genuine unit tests** (real calls, real assertions, zero Firebase import) | ✅ 47/47 — registry shape, tier/gate correctness per module, usage engine (unlimited/under/at/over), per-module decision logic (all branches), upgrade recommendations (allowed→null, tier-blocked, gate-blocked, non-tier/gate reason) |
| `scripts/verify-workspace-entitlement-evaluator.mts` | Structural (Firestore-dependent evaluator/wrappers/audit) | ✅ 27/27 — single registry/evaluator, no NextResponse import, no duplicated gate/billing logic, deny-by-default, the audit bug-fix, Slice 5 composition, service-to-service `representedUid` enforcement |
| All Slice 3, 4, 5 regressions | Regression | ✅ Unaffected (re-verified after the shared `RequiredFeatureGate` type extension specifically) |
| Other pre-existing `verify-*.mts` | — | Unaffected, not touched this slice |
| `npx tsc --noEmit` | — | ✅ Clean (after fixing the real `communityEnabledByAgency` type error — see below) |
| `pnpm lint` | — | ✅ Zero new issues (after fixing a real `no-assign-module-variable` error — see below) |
| `pnpm build` | — | ✅ Clean |

### Bugs found and fixed (both real, not false positives)

1. **`tsc`**: `communityEnabledByAgency` used in the registry before it existed in Slice 5's `RequiredFeatureGate` union — genuine compile error, fixed by the additive type extension described above.
2. **`pnpm lint`**: Next.js's `no-assign-module-variable` rule forbids binding a variable/parameter literally named `module` (shadows a reserved bundler identifier) — used as a loop variable, map callback parameter, and function parameter in three files. Renamed to `mod` throughout; object-literal keys (`{ module: mod, ... }`) and the `WorkspaceModule` type name are unaffected, only variable/parameter bindings changed.

### Risks

- No new risks beyond what Slices 4/5 already carry (this slice composes their outputs, introduces no new write path to customer data).
- The registry's tier/gate assignments for a handful of modules (`reports`, `automation`, `email` metering) are reasoned defaults consistent with the verified data-ownership split, not independently verified against every real route — same "high confidence, not certainty" caveat Slice 5 recorded for its own compatibility mapping.

### Deferred / explicitly not done this slice

Per instructions: no billing migration, no Stripe changes, no Ascend changes, no real usage limit values, no add-on catalog, no checkout integration, no unified shell, no Firebase cutover, no Zeno execution.

## Wave A — Slice 8.5: Unified Shell Stabilization & Browser Certification

**Status:** ✅ Complete, with one explicitly disclosed limitation. Committed to `dev` only. Not merged to `main`. Not deployed. No Firestore rules changed. No production data touched. Full detail in `docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md` — this entry summarizes; that document is the durable certification record.

### The one limitation, stated plainly

This slice's instructions called for live browser certification against real authenticated sessions, including creating one scoped test workspace + feature-flag doc. Mid-slice, this session confirmed — via the user cross-checking a screenshot of their Render dashboard's env vars against this repo's local `.env.local` — that both point at the SAME Firebase project (`ascend-crm-jvm`), and that project is the one and only real backend behind the live deployment (one Render service exists, `ascend-crm-db9e7`). Per repository discipline ("do not modify production data"), no signup, login, or Firestore write was performed against it. Everything else in this slice's 20-section scope was completed: static/source audit, real defect fixes (with regression tests), a full Playwright test infrastructure with every checklist scenario written out (skip-guarded, not faked as passing), and the 30 tests that don't require a real session were run live for real. See the certification doc's "Final recommendation" for the exact follow-up a human with write access should run.

### Shell truth re-confirmed (not assumed from Slice 8's own report)

Re-read every file in `src/lib/shell/`, `src/types/ascend-shell.ts`, and `src/app/app/layout.tsx` from scratch against this slice's certification checklist. The mode-resolution/composition logic itself (decideShellMode, buildShellNavigation, resolveShellContext) had zero defects — only the UI layer built on top of it did. One additional structural finding worth recording: `resolveShellContextForLayout()` is always called with no options from `layout.tsx`, so there is **no client-controllable workspace-id input anywhere in the `/app/*` surface** — the "manual URL manipulation with an unauthorized Workspace ID" attack this slice's checklist asks to certify has no surface to test against the shell itself (Flow's existing `/sa/[subAccountId]/*` routes remain the real, already-tested authorization boundary, Slice 5, unmodified).

### Real defects found and fixed (reproduced by rigorous source audit, not a live browser, given the credential constraint above — each is an objective code property, not a judgment call, and each now has both a regression test and a corresponding live Playwright assertion ready to run)

1. **Mobile navigation was completely absent.** The Slice 8 `<aside>` was `hidden ... md:flex` with zero alternative below 768px — a real mobile customer had no way to reach any lifecycle section. Fixed: new `AscendMobileNav` (Sheet-based drawer, mirrors the existing Flow sidebar's own desktop-aside + mobile-Sheet split exactly) + a new shared `AscendShellSidebarContent` so desktop and mobile can never render different navigation (single source of markup, not two hand-maintained copies).
2. **No user menu / no logout path existed anywhere in the shell.** Fixed: new `AscendUserMenu`, reusing the EXISTING `signOutUser()` (`lib/firebase/auth.ts`) — not a second sign-out implementation.
3. **No `aria-current` on the active nav link.** Fixed.
4. **Locked nav items weren't keyboard-discoverable** — a non-focusable `<div>` with a `title`-only tooltip (invisible to screen readers, unreachable by keyboard). Fixed: `role="button" tabIndex={0} aria-disabled="true"` with the reason exposed via `aria-label`.
5. **No skip-to-content link.** Fixed.
6. **`prefers-reduced-motion` not honored.** Fixed via a scoped, additive `@media` block under `.theme-ascend`.

None of these fixes touch any file outside `src/components/shell/`, `src/app/app/layout.tsx`, or the purely-additive `.theme-ascend` CSS block — every file Slice 8 proved untouched remains untouched (re-verified this slice, see Verification below).

### Test infrastructure built (repository's first)

No test framework existed anywhere in this repo before this slice (confirmed by audit). Added, scoped to shell certification only: `@playwright/test` + `@axe-core/playwright`, `playwright.config.ts` (chromium-desktop + chromium-mobile projects, auto-starts `pnpm dev`), `e2e/fixtures/test-accounts.ts` (env-var-driven, zero hardcoded credentials, covers all 11 named roles/states), `e2e/fixtures/auth.ts` (logs in through the REAL Firebase login form, no shortcuts), `e2e/README.md` (exact operator setup: provisioning accounts, creating a Workspace Mapping v2 record via Slice 4's CLI, scoping the `unified_shell` flag to one test workspace via Slice 2's existing admin route at `single_workspace` stage — never `ga` — and the rollback drill), and 9 spec files under `e2e/shell/` covering every certification checklist section.

### What ran live vs. what's skip-guarded

30 tests ran for real against a live `pnpm dev` server (both desktop and mobile Playwright projects): every unauthenticated `/app/*` route redirect, redirect-loop absence, redirect-path preservation, the real Firebase login form's rendering + keyboard navigation, and an axe accessibility scan of `/login` (zero critical/serious violations). 104 tests across the remaining 7 spec files cleanly `test.skip()` with a clear reason (missing `TEST_*` env vars) — never faked as passing. One genuine bug in the tests themselves was found and fixed during this process (a wrong assumption about the login form's tab order — the real order is email → "Forgot password?" button → password, which is reasonable DOM order, not a defect; the test's expectation was wrong, not the app).

### Tests

| Suite | Result |
|---|---|
| `scripts/verify-shell-8-5-fixes.mts` (new) | ✅ 16/16 — one regression check per fixed defect |
| `e2e/shell/unauthenticated-entry.spec.ts` + `accessibility.spec.ts` | ✅ 30/30, run live |
| Remaining 7 `e2e/shell/*` files | 104 tests, cleanly skipped (credentials not available in this environment) |
| All Slice 3-8 regression suites (14 scripts) | ✅ Unaffected |
| `npx tsc --noEmit` | ✅ Clean (typechecks the new `e2e/` and `playwright.config.ts` too — confirmed via `tsconfig.json`'s `**/*.ts` include) |
| `pnpm lint` | ✅ Same 32 pre-existing problems, zero new (two new warnings were introduced and fixed during this slice's own test-writing, then reconfirmed at baseline) |
| `pnpm build` | ✅ Clean |
| 9 pre-existing broken `verify-*.mts` scripts (unrelated `server-only` guard issue) | Reconfirmed identical, unaffected |

### Risks closed

- Mobile users of a future Full Ascend rollout would have had zero navigation — closed.
- No logout path inside the shell — closed.
- Baseline keyboard/screen-reader accessibility gaps in the new shell's own chrome — closed.

### Risks remaining (see the certification doc's "Remaining known seams" for full detail)

- No Ascend-branded full-screen editor/module chrome — every module and builder handoff still drops into unmodified Flow CRM styling with a visible seam (the single largest remaining cohesion gap).
- No "Back to Ascend" affordance inside Flow's existing dashboard layout.
- Duplicate identity/entitlement resolution per `/app/*` page request (performance-only, previously disclosed in Slice 8's own ledger).
- **Live authenticated-flow certification itself remains outstanding**, pending a human with write access to the real Firebase project running the exact steps in `e2e/README.md`.

### Files changed

New: `playwright.config.ts`, `e2e/fixtures/test-accounts.ts`, `e2e/fixtures/auth.ts`, `e2e/README.md`, `e2e/shell/*.spec.ts` (9 files), `src/components/shell/ascend-mobile-nav.tsx`, `src/components/shell/ascend-user-menu.tsx`, `src/components/shell/ascend-shell-sidebar-content.tsx`, `scripts/verify-shell-8-5-fixes.mts`, `docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md`. Modified: `src/components/shell/ascend-shell-nav.tsx` (a11y fixes), `src/app/app/layout.tsx` (mobile nav + user menu + skip link wiring), `src/app/globals.css` (reduced-motion, additive), `package.json` (`@playwright/test`/`@axe-core/playwright` dev deps + `test:e2e`/`test:e2e:safe` scripts), `pnpm-lock.yaml`.

### Go/no-go for Slice 9

**Conditional go.** Shell code correctness, fail-closed security properties, and baseline accessibility/mobile/logout completeness are verified. Slice 9 can safely build on `AscendShellContext`/`resolveShellContext()` as-is. The one open item — live authenticated-flow certification — should run in parallel with or just before Slice 9, using the exact `e2e/README.md` steps; it does not block Slice 9's own code from being written, but should complete before any real customer rollout.

## Wave A — Slice 8: Unified Ascend Next.js Shell

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. Not deployed. No new Firestore collection (none needed — the shell composes existing collections + Slices 2/5/6/7's existing evaluators). `unified_shell`/`unified_navigation` (Slice 2's already-registered flag IDs) both default OFF (no `featureFlags/{id}` doc exists yet), so **the entire `/app/*` route group is unreachable — every request bounces to the existing CRM experience — until an operator explicitly creates and enables the flag doc.** Every existing dashboard/agency/sub-account file confirmed byte-for-byte untouched.

### Audit findings (repository truth — see the numbered items below for the exact files/logic this slice builds on top of, never duplicates)

| Item | Confirmed |
|---|---|
| Root layout / theming | `src/app/layout.tsx` wraps `Providers` (ThemeProvider `attribute="class" defaultTheme="system"`, sonner `Toaster`), fonts (Geist Sans/Mono + Instrument Serif). `src/app/globals.css` already has a scoped-theme-class precedent (`.theme-green`, `.theme-leadstack`, `.marketing-accent`) this slice's `.theme-ascend` block follows exactly. |
| Error/loading/not-found | Only `src/app/error.tsx` + `src/app/not-found.tsx` exist, both root-level. **No `loading.tsx` anywhere in the app**, no dashboard-specific overrides. Not extended by this slice (out of scope). |
| Middleware | `src/middleware.ts`'s `authMiddleware` protects everything not in `PUBLIC_PATHS`/`PUBLIC_PATH_PATTERNS` by default — confirmed the ONE existing host-based logic is `customDomainRewrite()` (Funnels custom domains), with a documented fail-closed-on-ambiguity incident pattern this slice's `decideShellMode()` deliberately mirrors. `/app/*` was **not** added to either public list, so it inherits the exact same session-cookie gate as every other dashboard route — no middleware changes were needed or made. |
| Dashboard shell | `(dashboard)/layout.tsx` (client component) renders `Sidebar` + `Header` + `BottomTabBar` + `CommandPalette` + `ZenoLauncher`; `SubAccountProvider`/`BillingGuard` mount one level deeper, in `sa/[subAccountId]/layout.tsx` only — agency-level pages never have sub-account context. |
| Sidebar gating pattern | `sidebar.tsx` already has the EXACT dual-gate shape this slice's navigation model reuses: role-based hide (agency section only for owner/multi-membership) vs. entitlement-based "Locked" row (`broadcastsEnabledByAgency` etc., default hidden unless the agency owner explicitly un-hides it). This slice's `buildShellNavigation()` reproduces this same visible-vs-locked shape, but driven by Slice 5's real permission registry + Slice 6's real entitlement engine instead of the hand-rolled per-feature gate fields — confirmed by audit to be **the first UI-adjacent code to consume either engine** (zero `.tsx` files imported `lib/entitlements/` or used `roleHasPermission` before this slice). |
| Ascend↔Flow links | Exactly ONE exists today: a plain external `<a href={NEXT_PUBLIC_ASCEND_APP_URL}>DivineX Home</a>` in the sidebar footer. This slice reuses the same `NEXT_PUBLIC_ASCEND_APP_URL` env var (already documented, already wired) as the authoritative "Ascend domain" hostname for `decideShellMode()` — not a new env var. |
| Zeno | **Fully built, live today** — sidebar nav item, agency nav item, `/ai-suite` pages, a persistent floating "Ask Zeno" launcher (`components/ai-suite/zeno-launcher.tsx`) pathname-coupled to `/sa/*`/`/agency/*`. This slice deliberately does NOT reuse `ZenoLauncher` inside `/app/*` (its pathname matching doesn't recognize the new route group and would misbehave) — instead the new shell exposes a `capabilities.canUseZeno` boolean (driven by Slice 5's real `zeno.advise` permission) plus a plain link into the workspace's existing `/sa/{id}/ai-suite` page. `ZenoLauncher` itself is unmodified. |
| Tier/mode-driven UI | Confirmed **did not exist anywhere** before this slice — `WorkspaceTier` (Slice 6) had zero rendered-UI influence. This slice is the first consumer. |
| Legacy flat-route redirect | `LegacyRedirect` (`src/components/legacy-redirect.tsx`) is the existing precedent this slice's `decideShellFallbackRoute()` follows for the same "bounce to first membership's sub-account, or `/agency` if none" shape — reused as a pattern, not imported directly (that component is client-side/`useAuth()`-driven; this slice's fallback route decider is a pure function driven by the already-resolved `IdentityContext`, used from a Server Component). |
| Billing paywall | `BillingGuard` mounts one level below the shared dashboard shell (wraps only `sa/[subAccountId]` children) — sidebar/header/tab-bar are never blocked by a lapsed subscription. Unmodified, unconsulted by this slice (the shell's `full_ascend` gate is orthogonal to billing-lapsed state; a future slice can decide whether `/app/*` should also mount `BillingGuard`). |
| Onboarding/first-run | `/agency/get-started` exists (a tabbed orientation page) but **no automatic redirect to it exists anywhere** — confirmed absent from middleware and every layout. Not built by this slice (out of scope; the spec did not ask for first-run detection). |
| Design tokens (Architecture spec) | `--jade: 158 64% 45%`, `--indigo: 239 84% 67%`, `--cobalt: 217 91% 60%` are the Architecture spec's LOCKED values (Locked Decision 4, Section 8) — used verbatim in `resolveShellBranding()`, not reinvented. |

**No contradiction with the architecture spec found.** One clarification worth recording: the spec's Locked Decision 1/2 ("Full Ascend customers use `app.divinex.io`... CRM-only customers may continue on `crm.divinex.io`") is realized in this slice as ONE Next.js deployment (this repo) serving both hostnames — `decideShellMode()` branches on the incoming request's `Host` header, the same mechanism `customDomainRewrite()` already uses for Funnels custom domains — rather than two separate deployments. No DNS/hosting change was made or is needed for this slice (feature-flagged off by default; hostname branching only matters once `app.divinex.io` is actually pointed at this deployment).

### Shell modes

`ShellMode = "full_ascend" | "crm_only"` (`src/types/ascend-shell.ts`). No third "internal/operator" mode — the spec's internal Ascend operator console lives in the untouched Ascend Intelligence repo, explicitly out of scope.

### Shell-mode resolver — fail-closed by design

`src/lib/shell/decide-shell-mode.ts`::`decideShellMode(signals)` — pure, unit-tested (10 genuine tests). `"full_ascend"` requires ALL THREE: (1) the request's hostname equals the configured Ascend hostname (`NEXT_PUBLIC_ASCEND_APP_URL`, reused — not a new env var), (2) the caller's workspace entitlement tier (Slice 6, real, never guessed) is genuinely `"full_ascend"`, (3) the `"unified_shell"` progressive-rollout flag (Slice 2, reused) is on for this caller/workspace. Any missing/ambiguous signal falls through to `"crm_only"`. A `devOverride` signal is honored ONLY when `isProduction === false` — asserted first, so a leftover override can never fire in production even if accidentally left set. The function itself never reads `process.env`/`next/headers`/Firestore — the orchestrator (`resolve-shell-context.ts`) gathers every signal first, keeping the decision genuinely pure and testable.

### Canonical shell context

`src/types/ascend-shell.ts`::`AscendShellContext` — composes Slice 7's `IdentityContext` unchanged with `navigation`, `branding`, `rollout`, `capabilities`. `src/lib/shell/resolve-shell-context.ts`::`resolveShellContext(uid, options?)` is the single composer (structurally verified: `server-only`, reuses `resolveIdentityForShell` — never a duplicated identity/session/workspace lookup — reuses `isFeatureFlagEnabled` for both `unified_shell` and `unified_navigation`, reuses the existing `resolveCustomBrand()` for `crm_only` branding, delegates every decision to a pure function). `src/lib/shell/shell-context-wrappers.ts` mirrors Slice 7's wrapper discipline exactly: `resolveShellContextForLayout()` (reads `x-user-uid` via `next/headers`, the same header every API-route auth helper already reads from a `Request` object), `resolveShellContextForServerAction(uid)`, and a service-to-service `resolveShellContextForService({representedUid})` stub for Slice 9+/Zeno (representedUid required, never optional — same discipline as Slices 5-7).

### Lifecycle navigation — the first real UI consumer of Slices 5 & 6

`src/lib/shell/build-shell-navigation.ts`::`buildShellNavigation(workspace)` — pure, unit-tested. The eight sections (Home/Identify/Create/Launch/Grow/Optimize/Scale/Settings) each map to a `{permission, module}` requirement (`LIFECYCLE_REQUIREMENTS`, explicitly documented in the file as a **new Slice 8 product decision, not a discovered fact** — the audit confirmed no such mapping existed anywhere to preserve). Gating reproduces the existing sidebar's exact dual-gate shape: missing the PERMISSION hides the section entirely (role-based); having the permission but the workspace lacking the MODULE renders it visible-but-locked with a reason (entitlement-based) — now driven by real `roleHasPermission()` (Slice 5) + `WorkspaceEntitlementSummary.allowedModules` (Slice 6) instead of hand-rolled gate fields. Zeno is deliberately excluded from this list (global capability, not a primary nav item, per spec).

### Branding — additive, not a restyle

`src/lib/shell/resolve-shell-branding.ts` — pure. `crm_only` mode passes through Flow's EXISTING `resolveCustomBrand()` result unchanged (zero visual change for CRM-only customers). `full_ascend` mode carries the Architecture spec's locked jade/indigo/cobalt tokens. `globals.css` gained one new, purely additive `.theme-ascend` block (verified via `git diff` containing zero deletion lines) — scoped to the new `/app/*` shell frame only; no existing screen carries this class, so nothing existing changes visually.

### Route structure

`src/app/app/layout.tsx` — the shell frame. Resolves context via the wrapper (never the raw composer), redirects (never renders Ascend UI) whenever `mode !== "full_ascend"` or no context resolves at all, using the pure `decideShellFallbackRoute()` (→ `/login`, the caller's existing `/sa/{id}/dashboard`, or `/agency` — mirroring `LegacyRedirect`'s existing fallback shape). `/app/*` was not added to `PUBLIC_PATHS`, so it's protected by the existing session-cookie gate with zero middleware changes. Eight placeholder pages (`/app/{home,identify,create,launch,grow,optimize,scale,settings}`) each link into the closest existing, unmodified Flow surface (stable routing into existing functionality, per the spec) — explicitly not the final Home dashboard, not Ascend Intelligence, not the Zeno execution bridge, not a builder rewrite.

### Tests

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-shell-decisions.mts` | **Genuine unit tests** (real calls, real assertions, zero Firebase/next import) | ✅ 25/25 — `decideShellMode` (10, incl. the production-ignores-override case), `buildShellNavigation` (7, incl. the hide-vs-lock distinction), `resolveShellBranding` (4), `decideShellFallbackRoute` (4) |
| `scripts/verify-shell-composition.mts` | Structural | ✅ 41/41 — pure files stay pure, one composer, wrapper reuse, layout gates before rendering, `/app/*` not exposed as public, **9 existing dashboard/shell files diffed byte-for-byte against the pre-Slice-8 commit and confirmed unchanged**, globals.css change proven purely additive |
| All Slice 3-7 regressions (11 suites) | Regression | ✅ Unaffected |
| `pnpm build` | — | ✅ Clean; confirmed all 9 new `/app/*` routes compiled |
| `npx tsc --noEmit` | — | ✅ Clean |
| `pnpm lint` | — | ✅ Zero new issues (same 32 pre-existing problems, unrelated `.cjs` script) |

### Bugs found and fixed (in this slice's own test-writing, not the shipped code)

1. Shell-quoting crash in the byte-diff structural test: `execSync("git show ...")` broke on the parenthesized path `src/app/(dashboard)/layout.tsx` (shell interprets `(` as a syntax token). Fixed by switching to `execFileSync("git", [...])`, which passes arguments without shell interpretation.
2. Another comment-string false positive (same recurring class as Slices 5-7): the "pure functions stay pure" check flagged `decide-shell-mode.ts` because its OWN doc comment explains the "no next/headers, no process.env" invariant using those exact words. Fixed by stripping comments before the substring check.

### Risks

- The `LIFECYCLE_REQUIREMENTS` permission/module mapping is a first-pass Slice 8 design choice, explicitly documented as revisable once Slice 9 defines what each section actually renders — revising it doesn't require touching the gating mechanism itself.
- Each of the 8 placeholder pages independently calls `resolveShellContextForLayout()` (in addition to the layout's own call), meaning identity/entitlement/flag resolution runs twice per request today. Acceptable for a placeholder-page foundation slice; flagged here as a Slice 9 optimization opportunity (pass shell context down via a request-scoped mechanism instead of re-resolving per page).
- `BillingGuard` is not mounted under `/app/*` — a billing-lapsed full_ascend workspace is not currently paywalled inside the new shell. Not a regression (this route group is unreachable without the flag anyway) but worth deciding explicitly before any real rollout.

### Deferred / explicitly not done this slice

Per instructions: no Ascend Intelligence integration, no final Home dashboard, no Zeno execution bridge, no builder rewrite, no global restyle of existing Flow screens, no Firestore rules deploy, no production auth/billing changes, no Ascend Intelligence repository changes.

## Wave A — Slice 7: Unified Identity & Session

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. One new collection (`identityAuditEvents`) added to `firestore.rules`, **not deployed**. **Every existing login/logout/SSO/JIT file confirmed byte-for-byte untouched** — not just claimed, proven by a structural test that diffs each one against the pre-Slice-7 commit.

### Audit findings (no contradictions with the architecture docs)

| Item | Confirmed |
|---|---|
| Clerk in Flow | **None exists.** Clerk lives entirely on Ascend's side of the SSO bridge — Flow only ever sees a `clerkUserId` string in the exchange payload (Phase 0). "Identity provider" in this repo is always Firebase; what varies is *provenance* (native vs. SSO-originated), not the authenticating system. |
| Session creation | `lib/firebase/auth.ts::createSessionCookie(user)` is the **one real chokepoint** — used identically by `signInWithEmail`, `signUpWithEmail`, and the SSO finish page (`/auth/sso/finish`, confirmed by direct read: "identical to what the normal login form does"). Exchanges a Firebase ID token for the `__session` cookie via `GET /api/login`. |
| `/api/login`, `/api/logout` | **No route files exist for either** — both are handled entirely inside `next-firebase-auth-edge`'s `authMiddleware` (`loginPath`/`logoutPath` config in `middleware.ts`), which intercepts before reaching app code. Nothing to extract here; there's no app-level login route to characterize. |
| Session cookie config | Exact, confirmed: name `__session`, `httpOnly: true`, `secure` in production only, `sameSite: "lax"`, `maxAge: 12 days`, signed with `COOKIE_SECRET_CURRENT`/`_PREVIOUS` (rotation pair). |
| Session validation | `authMiddleware`'s `handleValidToken` sets `x-user-uid`/`x-user-email` request headers from the decoded token — the exact header convention every auth helper since `require-tenancy.ts` (and now Slices 5-7) already reads. |
| Refresh behavior | `/api/auth/refresh-claims` — explicit, client-triggered re-mint of custom claims after a membership change (not a silent background refresh loop); the ID token's own ~60-minute ceiling is standard Firebase behavior, not custom-configured. |
| Impersonation / support login | **Confirmed absent** — the only "impersonat" string matches in the whole `src/` tree are unrelated prose in two comments (webhook-spoofing risk descriptions), not real logic. |
| "Remember me" | **Confirmed absent** — no such UI or persistence exists. |
| Multi-workspace membership | `userMemberships/{uid}/subAccounts/{saId}` — the EXISTING denormalized index CLAUDE.md documents as powering the sub-account switcher — is real and reused directly for workspace-candidate resolution, not reinvented. |
| No "last active workspace" signal | Confirmed absent from every relevant type (`UserDoc`, `UserSubAccountMembership`) — same "never invent a selection signal" finding as Slices 4 and 6, now a third time in a row. |

### Canonical identity model

`src/types/identity.ts` — `IdentityContext` (= `IdentityResolutionResult`, one type not two independently-evolving ones), `AuthenticatedUser`, `SessionIdentity`/`SessionState`/`SessionMetadata`, `IdentityProvider` (always `"firebase"` today — kept as a union for Slice 8+'s future work, not expanded here), `IdentitySource` (`native_signup`/`sso_jit_provisioned`/`migration_backfilled`/`unknown` — derived from Slice 3's `identityLinks.linkSource`, fails closed to `unknown` for any unrecognized value), `WorkspaceSelection`/`WorkspaceIdentity`/`WorkspaceIdentityStatus`, `IdentityMigrationState` (representation only, three states, no function moves an identity between them).

### Canonical session model

A session, in this model, is `SessionIdentity` — `state` (`active`/`no_session`/`account_inactive`) + the resolved `AuthenticatedUser` + `SessionMetadata` (provider/source/identity-link presence). It is composed, once, inside `resolveIdentity()` from the already-verified `uid` the middleware hands every request — this slice adds no new session-creation path, only a read-side composition over the existing one.

### Workspace resolution algorithm

`src/lib/workspace-selection.ts` (pure): explicit `workspaceId` always wins; exactly one `userMemberships` candidate auto-selects; zero candidates → `none_available`; **2+ candidates with no explicit request never auto-picks one** — no "most recently active" fallback exists anywhere to base one on, confirmed by this slice's own audit. The full candidate list is always returned regardless, so a future switcher UI (Slice 8) never has to re-query it.

### Identity composition algorithm

`src/lib/identity/resolve-identity.ts`, source-verified order:
1. `resolveAuthedCaller(uid)` (Slice 5, reused) — inactive/missing account → `session.state = "account_inactive"`, no workspace, done.
2. `getIdentityLinkByFirebaseUid(uid)` (Slice 3, reused) → identity source + migration state.
3. Workspace candidates from `userMemberships/{uid}/subAccounts` (existing collection, read directly).
4. `decideWorkspaceSelection()` (pure, this slice).
5. If a workspace was selected: `resolveSubAccountAccess()` (Slice 5, reused) for role/membership status.
6. `evaluateWorkspaceEntitlements()` (Slice 6, reused) — **also** independently re-validates archived-SubAccount/archived-mapping state, since `resolveSubAccountAccess` alone does not check `SubAccountDoc.status` (confirmed, existing, unmodified behavior — Slice 6 already layers this check on top, and this slice reuses that result rather than adding a third independent read of the same field).
7. `allowedPermissions` computed via the **pure** `roleHasPermission()` (Slice 5) over all 53 registered permissions — zero extra Firestore reads beyond what resolving `effectiveRole` already required.

A billing-lapsed workspace stays `status: "active"` (the caller genuinely is an active member) with `entitlements.blockedModules` reflecting the paywall — kept as a distinct concern from workspace archival/inactivity, which are structural/membership states, not commercial ones.

### Migration foundation

`src/lib/identity/identity-migration-state.ts` (pure) — `deriveIdentitySource()` and `deriveMigrationState()`, both representation-only. `unlinked_ascend_pending` exists as a named future state with **no data source populating it yet** — flagged explicitly rather than wired to a guess.

### Audit behavior

Reuses the exact philosophy from Slices 5/6: only five meaningful event types ever logged (`login`, `logout`, `workspace_resolution_failure`, `identity_conflict`, `session_anomaly`) — **no "resolution succeeded" event exists**, confirmed structurally, since `resolveIdentity()` will eventually run on most authenticated requests once wired into routes (Slice 8+) and logging every success would be exactly the noisy session logging this slice's instructions warned against. `recordLoginEvent`/`recordLogoutEvent` are audit-only hooks a caller invokes *after* an existing flow completes — confirmed structurally that neither function body creates a session itself.

### Tests

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-identity-resolution.mts` | **Genuine unit tests** (real calls, real assertions, zero Firebase import) | ✅ 12/12 — workspace selection (all 5 scenarios), identity-source derivation (all 4 branches incl. fail-closed unknown), migration-state derivation |
| `scripts/verify-identity-resolver.mts` | Structural (Firestore-dependent resolver/wrappers/audit) | ✅ 30/30 — one resolver, no NextResponse import, no credential-verification call, composition-not-duplication across Slices 3/4/5/6, **8 existing files diffed byte-for-byte against the pre-Slice-7 commit and confirmed unchanged**, wrapper reuse, audit event-type discipline |
| All Slice 3-6 regressions | Regression | ✅ Unaffected |
| Other pre-existing `verify-*.mts` | — | Unaffected, still 9 of 9 on the known pre-existing `server-only` issue |
| `npx tsc --noEmit` | — | ✅ Clean (after fixing a real import-path error — see below) |
| `pnpm lint` | — | ✅ Zero new issues |
| `pnpm build` | — | ✅ Clean |

### Bugs found and fixed (real, not false positives)

1. **`tsc`**: `MemberStatus` imported from `@/types/tenancy`, but it actually lives in `@/types/firebase` (there's also an unrelated same-named type in `@/types/community` — confirmed the barrel `@/types/index.ts` only re-exports the `firebase.ts` one, so no real ambiguity once imported correctly). Fixed by importing from the `@/types` barrel, matching `require-tenancy.ts`'s own existing convention.
2. Two more comment-string false positives in this slice's own test-writing (same recurring class as Slices 5/6 — an explanatory comment naming the exact thing being checked for absence). Both fixed to check actual code (specific function bodies / import statements) rather than whole-file substrings.

### Risks

- None new. This slice adds no write path to session/auth state — every mutation-capable primitive it touches (identityLinks, Workspace Mapping, permission/entitlement evaluation) was already built and audited in Slices 3-6; this slice only composes reads.

### Deferred / explicitly not done this slice

Per instructions: no shell, no customer migration, no Clerk removal, no production auth cutover, no billing changes, no Ascend changes. `IdentityMigrationState`'s `unlinked_ascend_pending` and `IdentityProvider`'s room for a future non-Firebase value are named but unpopulated placeholders for Slice 8+.

## Wave A — Slice 9: Unified Intelligence Integration (Home + Identify)

**Status:** ✅ Complete. Committed to `dev` only. Not merged to `main`. Not deployed. No Firestore rules changed, no new collection. Ascend Intelligence repository untouched (per instruction — confirmed, no file outside this repo was written).

**This slice began from a discontinuity worth recording**: the session that received this slice's instructions had no memory of Slices 2-8.5 being built — they were completed in a separate, parallel effort. Before writing any code, this session re-derived the full picture from `git log`, this ledger, `ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md`, and direct reads of the Slice 7/8 output (`types/identity.ts`, `types/ascend-shell.ts`, `lib/shell/shell-context-wrappers.ts`, `app/app/layout.tsx`) before treating anything as "already built." No contradiction was found between this re-derivation and the ledger's own account — Slices 2-8.5 are exactly as documented above.

### Audit findings — Ascend Intelligence integration surface (Task 1)

Grounded in TWO independent Explore passes into `DivineX-Business-Intelligence/artifacts/api-server/src` and `artifacts/divinex/src` completed earlier in this same session (before this slice's instructions arrived, while producing an unrelated architecture blueprint draft) — not re-derived from this slice's own prompt language, which turned out to diverge from reality in two places:

| Real, confirmed (route mounted, `requireAuth`/Clerk-gated) | This slice's client targets |
|---|---|
| `GET /zeno/business-profiles/:id/dashboard-summary` | Growth Score + latest Assessment |
| `GET /zeno/cro-audits` | CRO Audit summary + nested Recommendations |
| `GET /zeno/memory` | Business Memory summary |
| `GET /zeno/growth-timeline/:businessProfileId` | Growth Timeline |
| `GET /zeno/reports` | Recent Intelligence / Reports |

**Contradiction #1 (recorded, not silently resolved)**: this slice's own task list names "Recommendations" as a first-class, independent Ascend read surface. No standalone `/recommendations` endpoint exists anywhere in Ascend's route mounts (confirmed by direct read of `routes/index.ts`/`routes/zeno.ts`/`routes/growthScan.ts`). Recommendations are real, but live nested inside a CRO audit response's `recommendations` field. `Recommendation` is modeled for that nested shape; there is no `listRecommendations()` client method, because that would be an invented endpoint.

**Contradiction #2 (recorded)**: "Zeno read APIs" is listed as a distinct surface. Zeno's own endpoint (`POST /zeno/chat`) is chat/action, not a read API — and per this session's own earlier audit, Zeno has NO tool-calling mechanism at all (no `tools` array is ever passed to the Anthropic/OpenAI call; it's a context-stuffed single-shot chatbot). The genuinely read-only Zeno-adjacent surfaces are `/zeno/memory` and `/zeno/timeline`/`/zeno/growth-timeline/:id` — both are in the client; there is no fictional "Zeno read" endpoint.

**Auth gap (recorded, not worked around — this is the load-bearing finding of the whole slice)**: `ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md` Section 6 ("API Contract Strategy") explicitly states the Flow→Ascend service-to-service contract is "Not implemented by this document — this is the Phase 1 checklist, pending product-owner approval." No service-account/API-key mechanism exists on Ascend's side today — confirmed by direct source read: its only non-Clerk auth path is a dev-only bypass header, explicitly disabled in production. **This means the two new env vars this slice introduces (`ASCEND_INTELLIGENCE_API_URL`, `ASCEND_INTELLIGENCE_API_SECRET`, named to mirror the proven `ASCEND_SSO_EXCHANGE_URL`/`ASCEND_SSO_SHARED_SECRET` shape) are not set anywhere, and every Ascend Intelligence read will report `status: "unavailable"` / `reasonCode: "not_configured"` until the real contract is specified and configured.** This is not a placeholder standing in for something real — it is the honest, currently-correct state of the system, and it's exactly why the master prompt's own card-state checklist requires a first-class "unavailable" state for every card.

### Types built (Task 2)

`src/types/intelligence.ts` — zero runtime imports (pure data). `IntelligenceFieldStatus` (`ok/cached/stale/unavailable/timeout/empty`) + `WithMeta<T>` wrap every intelligence-derived field independently, so a partial outage never blanks the whole dashboard. `GrowthScore`, `GrowthAssessment`, `Recommendation`, `CroAuditSummary`, `GrowthTimelineEntry`, `BusinessMemorySummary`, `IntelligenceReportSummary`, `IntelligenceSnapshot`, `BusinessHealthSummary` (Flow-sourced), `HomeDashboardData`, `IdentifyDashboardData`.

### Intelligence client (Task 3)

`src/lib/intelligence/ascend-intelligence-client.ts` is the ONE file in the codebase that calls `fetch()` against an Ascend host — structurally enforced (`verify-intelligence-slice9-structure.mts` check 1a). Composed from three smaller files, each independently reusable/testable:
- `ascend-intelligence-config.ts` — the not-configured gate (see auth-gap finding above).
- `ascend-intelligence-retry.ts` — pure retry/backoff/error-normalization logic, mirrors the bounded-retry shape already proven in `lib/import/ghl/client.ts`'s `ghlFetch()` rather than inventing a new convention. Retries on 429/5xx/network-level failure, never on 4xx, capped at 2 retries with exponential-ish backoff.
- `intelligence-cache.ts` — in-memory, per-process, two-tier TTL (2min fresh / 30min stale-but-usable), same accepted tradeoff as `lib/funnels/checkout-rate-limit.ts`.

Every public client method returns `WithMeta<T>`, never throws for a known failure mode (not-configured, timeout, upstream error, unparseable body) — falls back to a stale cache entry when one exists, otherwise fails closed to `unavailable`/`timeout`. Response parsers are defensive (accept either a bare object or `{data: ...}` envelope — the real response shape has never been observed live, given the auth gap; this is the one thing genuinely unknown rather than unverified, stated plainly in the client's own header comment).

### Composition layer (Tasks 4, 6, 9)

- `compose-business-health.ts` — Flow-side operational data (revenue/pipeline/leads/tasks/appointments), computed server-side against `contacts`/`deals`/`tasks`/`events` directly. **New, necessary code** — the existing `sa/[subAccountId]/dashboard` page computes its KPIs client-side via Firestore `onSnapshot`, which a Server Component composer can't reuse; no reusable server-side equivalent existed before this slice. Never throws — a Firestore failure here degrades to `unavailable`, never blocks the rest of the page.
- `resolve-intelligence-snapshot.ts`::`composeIntelligenceSnapshot()` — resolves workspaceId → `primaryAscendBusinessProfileId` via Slice 4's `getMappingBySubAccountId()` (reused, not reimplemented), then fetches all 5 client resources in parallel (`Promise.all`). A workspace with no Workspace Mapping v2 record (the normal case for most sub-accounts today) returns every field `unavailable`/`no_linked_business_profile` — a real, expected state, not an error.
- `compose-home-dashboard.ts` — Flow operational data + Ascend intelligence fetched IN PARALLEL (`Promise.all` across the two composers, not sequential) — structurally guarantees an Ascend outage never delays the CRM half, satisfying "never block the page because Ascend is unavailable" as an architectural property, not just a documented intent.
- `derive-next-action.ts` — pure, ranks available recommendations (impact × inverse difficulty); returns `null` when nothing qualifies rather than fabricating one. There is no dedicated "next action" endpoint on Ascend's side (see Contradiction #1) — this is a genuine, disclosed client-side derivation.
- `compose-identify-dashboard.ts` — intelligence-only (no Flow operational data), its own composer so Identify can resolve independently of Home.
- `intelligence-wrappers.ts` — the three sanctioned public entry points (`resolveHomeDashboard`, `resolveIdentifyDashboard`, `resolveIntelligenceSnapshot`), each re-checking `workspace.read` via Slice 5's real evaluator BEFORE calling its compose* function — same defense-in-depth discipline as every prior slice's wrapper layer, deliberately redundant with the `/app/*` shell's own gate. Plus a `resolveIntelligenceSnapshotForService({representedUid, workspaceId})` stub for the future Zeno bridge, same `representedUid`-required discipline as Slices 5-8.

### Home + Identify UI (Tasks 5, 6, 7)

Replaces Slice 8's placeholder pages. `src/components/ascend/*` — 8 new card components (`MetricCard`, `GrowthScoreCard`, `RecommendedNextActionCard`/`RecommendationsListCard`, `GrowthTimelineCard`, `BusinessMemoryCard`, `BusinessHealthCard`, `LatestAssessmentCard`/`AssessmentHistoryCard`/`ReportsCard`/`BlueprintSummaryCard`), all sharing one `AscendCardShell` (reuses the `--glass-1/2/3` tokens already defined in `.theme-ascend`, Slice 8) and one `IntelligenceStatusBadge` (renders `cached`/`stale`/`unavailable`/`timeout`/`empty` — `ok` renders nothing, the data speaks for itself). `BusinessHealthCard` deliberately does NOT invent a numeric "health score" — no such derived metric exists in either system's real data; it uses a plain qualitative label instead, consistent with this effort's repeated anti-fabrication findings elsewhere in the codebase. `BlueprintSummaryCard` is deliberately minimal (shows only `recommendedFunnel`, the one blueprint-adjacent field the dashboard-summary response actually carries) rather than inventing full blueprint content this slice's client was never built to fetch.

"Loading" (the master prompt's 6th required card state) is handled at the route level — `/app/home/loading.tsx` and `/app/identify/loading.tsx`, the first `loading.tsx` files anywhere in this app (Slice 8's own audit confirmed none existed) — since the whole payload is composed server-side before the page body renders; there's no per-card independent client fetch to show a spinner for.

### Audit support (Task 10)

`intelligence-audit.ts` — `console.warn` for every cache hit/miss, fetch success/timeout/failure, and not-configured event. Never logs business/user content — only shape-level facts (resource label, status, duration, cache state), same discipline as Slices 5-7's audit modules.

### Tests (Tasks 11, 12)

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-intelligence-slice9-unit.mts` | **Genuine unit tests** — real calls, real assertions, dependency-injected fetch (zero real network calls) | ✅ 22/22 — cache fresh/stale/miss, retry/backoff/error-normalization (all branches), next-action ranking (incl. empty→null), client not-configured gate, successful fetch+parse+cache, cache-hit-avoids-refetch, failure-with-no-cache→unavailable, 500 genuinely retried then fails closed, unparseable JSON→unavailable not a crash, genuinely-empty upstream data→`ok` with empty summary (not `unavailable`) |
| `scripts/verify-intelligence-slice9-structure.mts` | Structural | ✅ 62/62 — single fetch chokepoint, no other file constructs a `/zeno/` path or reads the shared secret, no `"use client"` component references the secret or imports the client directly, wrapper→compose* call order for all 3 entry points, service wrapper `representedUid` enforcement, pure files stay import-free, cache module never imports Firebase, CRM composer never imports the intelligence cache, every card renders the status badge, pages call the wrapper layer never the raw composer |
| All 24 pre-existing `verify-*.mts` scripts (Slices 2-8.5 + Flow's own funnel/design-strategy suites) | Regression | ✅ 24/24, all passing. **Correction to a risk this ledger previously recorded**: Slices 3-8.5 repeatedly noted "9 of 10 pre-existing scripts fail with a `server-only` module-guard error." Re-running the full set this slice with the established `NODE_OPTIONS="--conditions=react-server"` invocation, every script passes — that failure was specific to how those scripts were being invoked in whatever environment recorded it, not a real code defect. Recorded here as a correction, not silently left stale. |
| `npx tsc --noEmit` | — | ✅ Clean on first run |
| `pnpm lint` | — | Found and fixed one small real pre-existing warning while auditing (`verify-checkout-ghl-audit.mts`'s unused mock parameter, from an unrelated earlier session turn — not part of this slice's own new files). Back to the exact documented baseline (32 problems: 2 errors, 30 warnings), zero new from any Slice 9 file. |
| `pnpm build` | — | ✅ Clean; confirmed `/app/home` and `/app/identify` both compiled as dynamic routes |

### Bugs found and fixed (in this slice's own test-writing, not the shipped code)

Same recurring class every prior slice has hit: a structural check (10d) initially flagged `identify/page.tsx` for "importing the raw composer directly" — it was matching this file's OWN doc comment, which mentions `compose-identify-dashboard.ts` by name to explain the architecture. Fixed by checking for an actual `import` statement pattern instead of a bare substring, same fix Slices 5-8 each independently arrived at for their own version of this false positive.

### Risks

- **The Ascend Intelligence connection is not live** — this is the slice's central, disclosed limitation, not a defect. Every card will show real `unavailable` states in any environment until `ASCEND_INTELLIGENCE_API_URL`/`ASCEND_INTELLIGENCE_API_SECRET` are actually specified (Architecture Spec Section 6, still pending product-owner approval) and configured on both sides. The client, composition, caching, and UI are all fully real and ready the moment that contract exists — nothing about this slice needs to be revisited to go live, only configured.
- The Ascend response-envelope shape (bare object vs. `{data: ...}`) and exact field names beyond what this session's earlier source-code Explore passes confirmed are unverified against a live payload — the client's parsers accept either shape and degrade to `null`/defaults on any mismatch rather than crash, but should be re-verified against a real response the first time live connectivity exists.
- `compose-business-health.ts`'s Firestore queries assume composite indexes exist for `contacts(subAccountId, createdAt)` and `events(subAccountId, startAt)` — both already required by other existing Flow features per `CLAUDE.md` (leads map, booking availability respectively), so this is reusing existing index coverage, not introducing a new dependency — but the contacts query is defensively wrapped to degrade to 0 rather than fail the whole summary if that assumption is ever wrong in a given deployment.

### Deferred / explicitly not done this slice

Per instructions and per honest scope: no live Ascend connectivity test (nothing to test against — the service contract doesn't exist yet), no full Blueprint Studio content (only the one field the real dashboard-summary response carries), no Growth Timeline pagination beyond the first page, no Zeno execution bridge (the service-to-service stub is named, not wired up), no Create/Launch/Grow/Optimize/Scale section work (out of this slice's scope).

### Go/no-go for Slice 10

**Conditional go**, same shape as Slice 8.5's handoff. Everything buildable without live Ascend connectivity is done and verified. Before Slice 10 (or before treating Home/Identify as customer-ready), someone with authority over the Architecture Spec's Section 6 needs to actually specify and provision the Flow→Ascend service auth contract — this is a product/security decision, not an engineering one, and no amount of further Flow-side work substitutes for it.

## Wave A — Slice 10: Secure Intelligence Service Bridge & Live Data Certification

**Status: Partial — by explicit user decision, not silently scoped down.** Flow-side bridge hardening, the full authentication/authorization/envelope/observability contract, security audit, and tests are complete and committed to `dev`. **Live certification and the Ascend-side implementation did not happen this slice** — the Ascend Intelligence repository's `main`/`dev` branch divergence (first found in Slice 1, re-confirmed unchanged at the start of this slice: `main` at `c7422b0`, `dev` at `3c4d3e8`, still no reconciliation) makes it unsafe to write service-auth middleware to either branch without knowing which one is actually deployed to `app.divinex.io`. Asked the user directly rather than guessing; they chose "stop and let me check first" — so **zero lines of code were written to the Ascend Intelligence repository this slice**, per instruction and per this slice's own "prove it, document it, stop — instead of inventing" discipline.

### Repository-truth audit (Task: "audit both repositories")

Re-confirmed (not re-derived from assumption) via direct source read of Ascend's current `main` checkout:

| Item | Finding |
|---|---|
| Global auth | `app.use(clerkMiddleware(...))` — applied to every request, not opt-in |
| Per-route auth | `requireAuth`/`requireRole`/`requirePermission` (`middlewares/auth.ts`), all resolving `getAuth(req)?.userId ?? getDevUserId(req)` — the dev bypass is hard-disabled by `NODE_ENV === "production"` inside the function itself |
| Service-account/API-key mechanism | **Confirmed, again, does not exist anywhere.** No precedent to extend — this is genuinely new surface area |
| Existing failure-response shape | Ad hoc `res.status(401).json({error: "Unauthorized"})` — a loose `{error: string}` convention, not a formal envelope |
| Only proven service-to-service pattern in the whole system | The live Ascend→Flow SSO bridge: static `Authorization: Bearer <shared secret>`, no signing, no JWT, no mTLS |

**Full audit findings, the auth contract design, and the "repository decides" reasoning are written up in the new `docs/architecture/INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md`** — this ledger entry summarizes; that document is the durable contract record (mirrors how `SLICE_8_5_SHELL_CERTIFICATION.md` relates to its own ledger entry).

### Authentication contract (Task 5)

Static Bearer shared secret (`ASCEND_INTELLIGENCE_API_SECRET`, already reserved by Slice 9, still unset on both deployments) + a required `X-Intelligence-Business-Profile-Id` header — the secret proves the caller is Flow's backend; the header states which business profile's data is being requested. Chosen by repository truth, not preference: it's the *only* service-to-service pattern that has ever been built and proven in this system (the SSO bridge). No HMAC signing, JWT, or mTLS — those have zero precedent here and would be exactly the invented compatibility layer this slice's discipline forbids.

### Authorization model (Task 6)

Specified for the Ascend side (not built): verify secret (constant-time compare) → require the header non-empty → look up the business profile → **"workspace validation" scoped honestly** — Ascend has no workspace concept of its own (no `workspaces`/`agencies` table, re-confirmed), so the real check available to it is business-profile existence, not a Flow-workspace re-derivation (Flow already did that hard check via Slice 4/5 before ever calling Ascend). Documented explicitly so a future implementer doesn't assume Ascend re-derives Flow's authorization decision.

### Service bridge implementation (Task 7) — Flow side, real and committed

`ascend-intelligence-client.ts` (Slice 9, hardened this slice): now sends `X-Intelligence-Business-Profile-Id` on every request, and parses responses envelope-aware-first — if the body matches the formal `{ok, data, error}` shape, its `ok`/`error.code` fields are authoritative (even over a 2xx HTTP status, matching the contract doc's "a misconfigured proxy could rewrite a status code but not the body" reasoning); unrecognized error codes degrade to `internal_error` rather than leaking an arbitrary upstream string. Falls back to Slice 9's original bare/`{data}` parsing for anything that doesn't match the envelope shape — the real response shape has never been observed live, so both paths are genuinely needed, not speculative over-engineering.

### Response envelope (Task 8)

Specified in full in the contract doc: `{ok: boolean, data: T | null, error: {code, message} | null}`, 5 error codes (`unauthorized`, `business_not_found`, `workspace_mismatch`, `not_found`, `internal_error`). Flow's client validates incoming codes against this exact set — an out-of-contract code never reaches the UI as a raw string.

### Payload validation changes (Task 9)

None to the parsers themselves — Slice 9's defensive field-by-field parsing (accepts either envelope-nested or bare data, degrades to null/defaults on any mismatch) already satisfies "never force the backend to match fake assumptions." What changed is WHERE the envelope's `ok`/`error` gets read before those parsers ever run (see Service bridge implementation above).

### Home / Identify certification (Tasks 10, 11)

**Not live-certifiable this slice — stated plainly, not glossed over.** There is no reachable Ascend endpoint to certify against (`ASCEND_INTELLIGENCE_API_URL`/`_API_SECRET` remain unset; the Ascend-side receiver doesn't exist on any branch). Re-verified instead: Slice 9's fail-closed behavior is unchanged and still structurally guaranteed (`compose-home-dashboard.ts`'s `Promise.all` still runs Flow-ops and Ascend-intelligence in parallel, independent failure domains) — Flow operational data will render correctly regardless of Ascend's live status; every intelligence card will show a real `unavailable` state, not a mock value, not a crash. This satisfies the "fail-closed behavior" requirement honestly; it does not satisfy "verify live" against real Growth Score/Revenue/etc. data, because that data doesn't exist to verify against yet.

### Security audit (Task 12)

Structural, in `scripts/verify-intelligence-slice10-bridge.mts` (checks 9a-9g): client never reads/forwards a Firebase session cookie or uid to Ascend (confirmed by source-text absence, not just intent); client never references anything Clerk-related (consistent with Slice 7's finding that Flow has no Clerk code anywhere); the shared secret is not a `NEXT_PUBLIC_*` var (never build-time-inlined into the browser bundle); the config module carries `"server-only"`; neither Home nor Identify page source references the secret; no workspace crossover — `checkWorkspaceRead(uid, workspaceId)` and the composer it guards always receive the identical `workspaceId`, structurally confirmed by regex over the actual wrapper source, not just described.

### Performance (Task 13)

Unchanged from Slice 9 — timeouts (8s), bounded retry with backoff (max 2, capped at 4s), two-tier TTL cache (2min fresh / 30min stale), all already built. This slice added the header + envelope parsing without touching any of that logic — re-confirmed unaffected by re-running Slice 9's own retry/backoff/cache unit tests unchanged (see Tests below).

### Observability (Task: required audit events)

Ascend-side events (`bridge_auth_success/failure`, `permission_denied`, `business_missing`, `workspace_mismatch`) are specified in the contract doc but cannot be implemented here — they belong to code that doesn't exist yet. Flow-side equivalents, actually built: `bridge_request_sent`, `bridge_envelope_ok`, `bridge_envelope_error` (carries the error code), added to `intelligence-audit.ts` alongside Slice 9's existing `cache_hit`/`cache_miss`/`fetch_timeout`/`fetch_failure`/`not_configured`.

### Tests (Task 14)

| Suite | Kind | Result |
|---|---|---|
| `scripts/verify-intelligence-slice10-bridge.mts` | **Genuine tests** — real calls, dependency-injected fetch, zero network | ✅ 31/31 — envelope ok:true parses nested data correctly, all 5 documented error codes map through with the code preserved, an unrecognized code degrades to `internal_error` rather than leaking a string, bare/legacy shapes still parse (backward compatibility), the required header is actually sent with the correct value, contract doc structural checks (6 required sections + discloses the branch divergence + states no Ascend code was written), client/audit source-level checks, 7 security-property checks |
| `scripts/verify-intelligence-slice9-unit.mts` (22) + `-structure.mts` (62) | Regression | ✅ 84/84 unaffected by this slice's client changes |
| All other pre-existing `verify-*.mts` (24) | Regression | ✅ 24/24, unaffected |
| `npx tsc --noEmit` | — | ✅ Clean |
| `pnpm lint` | — | ✅ Exact documented baseline (32: 2 errors, 30 warnings), zero new |
| `pnpm build` | — | ✅ Clean |

### Bugs discovered / fixed

None new this slice (Slice 9's own client logic was extended, not debugged — no defect found in the pre-existing code while doing so).

### Remaining risks

1. **The central, disclosed limitation, unchanged from Slice 9's own handoff, now compounded by a second blocker**: intelligence data is not live. Previously blocked only on the auth contract being unspecified (now resolved — see the contract doc); now additionally blocked on the Ascend repo's branch divergence, which must be resolved before ANY code (this contract's receiver, or anything else) can safely land on the Ascend side.
2. The envelope shape this slice designed has never been validated against a real Ascend response — the client handles both the envelope and legacy shapes defensively, but the actual shape Ascend ships (if it doesn't follow this spec exactly) may need a follow-up parser adjustment.
3. `docs/architecture/INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md` is a Flow-repository-only document — whoever implements the Ascend side needs to be handed this doc directly (it doesn't exist on the Ascend repo, by design, since nothing was written there).

### Deferred / explicitly not done this slice

Per the user's explicit decision: no Ascend-side service authentication middleware, no Ascend-side verification/authorization/business-profile-lookup/response-envelope/audit-logging code, no live certification of Home/Identify against real Growth Score/Revenue/Timeline/Memory/Recommendations/Reports/Assessment data (nothing to certify against). All of the above are fully specified and ready to implement the moment the branch question is resolved.

### Go/no-go for Slice 11

**No-go on live data, go on continuing Flow-side work that doesn't depend on Ascend connectivity.** The bridge contract is complete and ready. The actual blocker — Ascend's branch divergence — is a repository-hygiene/product decision entirely outside this slice's or Slice 11's control. Recommend either: (a) a slice dedicated to resolving the Ascend branch divergence itself (comparing the two branches' real diffs, deciding which reflects production, reconciling), separate from any further Ascend OS feature work, or (b) continuing Create/Launch/Grow/Optimize/Scale section scaffolding (same placeholder→real pattern as Slice 8, zero Ascend dependency) while that decision is made elsewhere. Per this slice's explicit instruction, stopping here — not beginning Slice 11.

## Wave A — Slice 10.5: Ascend Repository Reconciliation & Secure Bridge Completion

**Status: Complete, both repositories.** Resolved the branch-divergence blocker that stopped Slice 10 from certifying live, built the real Ascend-side receiver, wired the live bridge end to end, and — discovered mid-slice, not planned for — corrected a significant, real defect in Slice 9/10's Flow-side types and parsers, which had been built against guessed response shapes that turned out not to match reality once the real Ascend query/route code was read directly.

### Step 1-2: Repository audit + reconciliation (both repos)

`git cherry main dev` (patch-content comparison, not commit hashes) on `DivineX-Business-Intelligence` showed **zero** commits on `dev` not already patch-equivalent to a commit on `main` — confirmed by a manual byte-for-byte spot-check (`diff` of one matched commit pair, excluding hash-only lines, empty) rather than trusting the tool alone. **Correction to Slice 1's own finding, recorded not silently fixed**: the "~60 commits at risk" framing was a raw commit-count comparison; at the patch-content level, `main` is a strict content superset of `dev` — there is no real work on `dev` that doesn't already exist on `main`. `render.yaml` (`branch: main` for both the `ascend-bi-api` web service and the `ascend-onboarding-cron` job) then gave definitive, non-inferential proof of which branch is actually deployed, and the user independently confirmed "main is live." Reconciliation strategy: adopt `main` as sole authoritative branch; no merge was needed (nothing to merge — `main` already contains everything real on `dev`); `dev` left untouched, no destructive action taken on it this slice. Full audit table (9 commits genuinely unique to `main`, all additive or a clean revert, zero conflicts) is in the plan file (`rosy-finding-summit.md`) and was not duplicated into this ledger to avoid drift between two copies of the same audit.

### Step 5-8: Ascend-side implementation (real, committed to `main`)

Built on `DivineX-Business-Intelligence` `main`, following the extraction discipline this whole effort established (Flow's own SSO JIT / require-tenancy extractions): pulled the 5 bridge queries' logic out of the pre-existing Clerk-gated `/zeno/*` handlers into `artifacts/api-server/src/lib/intelligenceQueries.ts` so BOTH the existing Clerk-gated routes and the new service-auth-gated routes run the identical code — never two copies. `routes/zeno.ts`'s handlers now call the extracted functions; behavior-preservation proven via characterization tests diffing against the pre-edit commit (`c7422b0`), not assumed.

- **`middlewares/serviceAuth.ts`** — `requireServiceAuth`: constant-time Bearer-secret compare (length check before `timingSafeEqual`, mirroring `routes/sso.ts`'s proven live pattern — read first, per the plan's own instruction, before writing this), requires `X-Intelligence-Business-Profile-Id` non-empty and numeric, confirms the profile exists via `businessProfileExists()`, attaches `req.serviceContext`. `sendEnvelope`/`sendEnvelopeError` implement the exact `{ok,data,error}` contract from `INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md`. Every auth decision writes one row to the existing `ssoAuditEvents` table (`bridge_auth_success`/`bridge_auth_failure`) — reused, not duplicated into a second audit table for the same kind of event.
- **`routes/internalIntelligence.ts`** — mounted at `/internal/intelligence/*`, `requireServiceAuth` applied router-wide, never mixed with Clerk auth on the same route (structurally verified — see Tests below). `businessProfileId` comes exclusively from `req.serviceContext`, never re-parsed from a query/route param — the `:id`/`:businessProfileId` path segments exist only to satisfy Express route matching and are never read by any handler, so a caller cannot use them to request a profile other than the one the auth header authorized.

### Step 9: Live bridge — not yet exercised (needs deployment env vars, outside this slice's reach)

`ASCEND_INTELLIGENCE_API_URL`/`ASCEND_INTELLIGENCE_API_SECRET` still need setting on both deployments (Render for Ascend, Vercel for Flow) — this is deployment configuration the user controls via hosting dashboards this session has no access to. Both sides are code-complete and independently tested against injected fakes; nothing architectural blocks Step 9 from succeeding once the env vars are set. Recorded here as the honest current state, not deferred silently — see "Remaining risks" below.

### A real bug found and fixed — Slice 9/10's Flow-side types and parsers were built on guessed, wrong shapes

While extracting the Ascend-side queries, their real return shapes were read directly from the live route handlers for the first time (Slices 9-10 had never had Ascend-side source to read, and reasoned from the architecture spec's prose instead — an honest gap, not negligence, but a gap all the same). The real shapes differed from Slice 9's guesses in five ways, all now corrected in `src/types/intelligence.ts` and `src/lib/intelligence/ascend-intelligence-client.ts`:

1. **Wrong request paths entirely.** The Slice 9 client targeted `/zeno/*` (Clerk-session-gated — a Flow backend service call could never authenticate against it) instead of the real bridge's `/internal/intelligence/*` (service-auth-gated). This alone would have made the whole bridge non-functional regardless of any other correctness.
2. **`dashboard-summary` is flat, not nested.** Slice 9 invented a nested `growthScore: {overallScore, primaryConstraint, categoryScores, scannedAt}` object; the real endpoint returns flat fields (`latestGrowthScore`, `scoreLabel`, `primaryConstraint`, `hasScan`, …) with no per-category breakdown at this level.
3. **`/internal/intelligence/memory` returns a different, simpler concept than assumed.** Slice 9's header comment described it as backed by a rich, governed `platform_memory` table (`BusinessMemorySummary{totalCount,approvedCount,recentItems}`). Direct read of the real query (`getMemoryForProfile`) shows it queries `zenoMemory` instead — a recommendation/status action-items list (`{recommendation, status: pending|in_progress|completed|skipped}`), a genuinely different, simpler table. Recorded as a correction in the types file, not silently swapped.
4. **Growth timeline is one comparison object, not a list of events.** Slice 9 invented `GrowthTimelineEntry[]` (a chronological event list); the real endpoint returns a SINGLE `growthTimelines` row — one scan-to-scan comparison (`businessEvolution`, `categoryDeltas[]`, `recommendationProgress[]`) — and 404s (`not_found`) when fewer than 2 scans exist, which the corrected client now surfaces as a real `"empty"` state rather than `"unavailable"`.
5. **CRO audit recommendations use Title-cased fields and no standalone id.** The real `CroAuditRecommendation` (from `croAuditEngine.ts`) carries `impact: "High"|"Medium"|"Low"` (not lowercase), `fix`/`fixWithZeno`/`fixContext` (not `title`), and no `id` field — a recommendation is identified by position within an audit. `reports` also uses `reportType` (not `kind`) and `shareToken` (not `shareUrl`).

Fixed by rewriting `types/intelligence.ts` (all 5 models) and `ascend-intelligence-client.ts` (paths + all 5 parsers), then cascading through every consumer: `resolve-intelligence-snapshot.ts` (now derives `recommendations` from the newest CRO audit's `recommendations` array, sorted server-side by the bridge query), `derive-next-action.ts` (ranks `CroAuditRecommendation[]` by Title-cased impact/difficulty), all 8 `src/components/ascend/*.tsx` card components (prop shapes + rendered fields), and both `/app/home` and `/app/identify` pages. `GrowthTimelineCard` was redesigned from a chronological-event list to a scan-comparison view to match what the real endpoint actually returns. `INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md`'s endpoint table was rewritten to the real paths/shapes; its Slice 10 "why the Ascend side isn't built yet" section replaced with the Step 1-2 reconciliation summary above.

### Step 10: Security audit (structural, both repos)

Ascend side: 16 tests in `artifacts/api-server/src/tests/intelligenceBridge.test.ts` (see Tests below) cover every `requireServiceAuth` failure mode via real supertest HTTP calls (not isolated function calls), envelope-shape purity, and structural Clerk-avoidance. Flow side: re-ran Slice 10's own `verify-intelligence-slice10-bridge.mts` security checks (9a-9g) unchanged in substance — one test (9b, "client never references Clerk") false-positived against this slice's own explanatory doc comment ("NOT the Clerk-gated `/zeno/*` paths") — the same recurring self-inflicted test-bug class this whole effort has hit in Slices 5-8 (Flow) and now this slice (Ascend, `intelligenceBridge.test.ts`'s own equivalent check hit the identical bug independently). Fixed the same way both times: strip comments before the substring check, not the source.

### Step 11: Performance (both repos)

No new query patterns introduced. Ascend's extracted functions are byte-identical to what `zeno.ts` already ran (proven via characterization tests, not assumed) — same query count, same indices, no new N+1s. Flow's client still fires the same 5 parallel `Promise.all` requests as Slice 9 — this slice corrected paths and shapes, not the request pattern.

### Tests

| Suite | Kind | Result |
|---|---|---|
| `artifacts/api-server/src/tests/intelligenceBridge.test.ts` (Ascend repo) | **Genuine tests** — real HTTP-level middleware-chain tests via supertest, `@workspace/db` mocked per the existing `planLimits.test.ts` convention | ✅ 16/16 — 6 `requireServiceAuth` failure/success modes, 2 pure envelope-helper tests, 3 structural (never mixes Clerk auth, `router.use(requireServiceAuth)` applied, `businessProfileId` always from `serviceContext`), 4 characterization (extraction preserved behavior, exact score-label thresholds survived, the untouched multi-profile branch of `/zeno/cro-audits` left alone) |
| Ascend repo full suite (`pnpm --filter @workspace/api-server run test`) | Regression | ✅ 88 total pass (72 pre-existing + 16 new) |
| Ascend repo typecheck/build (`build.mjs`, esbuild entry-point bundling, no monorepo-wide typecheck in the real deploy path) | — | ✅ Clean; 8 pre-existing, unrelated typecheck errors in standalone scripts confirmed unchanged (not in the deploy build's compile graph) |
| `scripts/verify-intelligence-slice9-unit.mts` (Flow repo, rewritten) | **Genuine tests**, corrected for real shapes | ✅ 31/31 — cache, retry/backoff, next-action ranking against real `CroAuditRecommendation`, client method names/paths/envelope handling against the real bridge contract incl. the `growth-timeline` not_found→`"empty"` case |
| `scripts/verify-intelligence-slice9-structure.mts` (Flow repo) | Structural, one section corrected | ✅ 61/61 — endpoint-path list updated to `/internal/intelligence/*` (correction: this slice's own re-run found the true count is 61, not the 62 recorded in Slice 9's original entry — that earlier figure was already imprecise, not something this slice's edits changed) |
| `scripts/verify-intelligence-slice10-bridge.mts` (Flow repo, rewritten) | **Genuine tests**, corrected for real shapes + contract doc | ✅ 31/31 — envelope handling against the real `dashboard-summary` shape, growth-timeline empty-state handling, contract-doc structural checks against the Slice 10.5 revision, security checks (9b fixed for the comment false-positive) |
| All other pre-existing Flow `verify-*.mts` (24) | Regression | ✅ 24/24, unaffected |
| `npx tsc --noEmit` (Flow repo) | — | ✅ Clean |
| `pnpm lint` (Flow repo, targeted + full) | — | ✅ Zero errors, zero new warnings |
| `pnpm build` (Flow repo) | — | ✅ Clean, `/app/home` + `/app/identify` compile |

### Bugs discovered / fixed

1. **The Slice 9/10 type/parser mismatch documented in full above** — the most significant finding this slice, would have silently defeated the entire Home/Identify intelligence surface (every field parsing to `unparseable_response`/`unavailable`) the moment the bridge went live, without this correction.
2. The recurring "own doc comment triggers a naive substring test check" bug, hit independently on both repos this slice (Flow's `verify-intelligence-slice10-bridge.mts` check 9b; Ascend's `intelligenceBridge.test.ts`'s "structural" describe block) — fixed the same way in both places (strip comments before checking), consistent with every prior occurrence of this bug class across the whole multi-slice effort.

### Remaining risks

1. **Live bridge (Step 9) and certification (Step 12) still require deployment-side env var configuration** (`ASCEND_INTELLIGENCE_API_URL`/`ASCEND_INTELLIGENCE_API_SECRET` on both Render and Vercel) — outside this session's reach. Both sides are code-complete and ready the moment those are set.
2. The corrected parsers are defensive (return `null`/empty on any shape mismatch) but have only been exercised against hand-constructed fake payloads matching the shapes read from source — not a real live response. A first live certification pass may still surface a field-level surprise (e.g. a jsonb column whose actual runtime content differs subtly from its TypeScript interface), though the request PATH and TOP-LEVEL shape are now confirmed correct by direct source read, which is the part that would have failed completely before this slice.
3. `dev` on the Ascend repo is now confirmed redundant (100% patch-content subset of `main`) but was left untouched this slice, per the plan's explicit "no destructive action regardless" constraint — cleanup is the user's call, not made unilaterally here.

### Deferred / explicitly not done this slice

Step 9 (setting real env vars on live deployments) and Step 12 (live certification against real Growth Score/Revenue/Timeline/Memory/Recommendations/Reports data) — both require actions on hosting dashboards outside this session's access, consistent with every prior slice's "cannot deploy or configure production infra directly" boundary.

### Go/no-go for the next slice

**Go, fully — with one outstanding external action.** Both repositories are code-complete, tested, and reconciled. The single remaining step to real live data is the user setting `ASCEND_INTELLIGENCE_API_URL`/`ASCEND_INTELLIGENCE_API_SECRET` on both deployments — a five-minute task once they're ready, not an engineering blocker. Per the master prompt's explicit instruction, stopping here — not beginning another slice.

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
