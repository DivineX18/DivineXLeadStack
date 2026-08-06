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
