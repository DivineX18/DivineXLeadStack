# Shell certification browser tests (Slice 8.5)

Playwright specs certifying the Slice 8 unified Ascend shell (`/app/*`) before Slice 9 begins. See `docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md` for the full certification record and `docs/architecture/PHASE_2_IMPLEMENTATION_LEDGER.md` for what was and wasn't run live during Slice 8.5 itself.

## Why most specs are skipped by default

This repo's local `.env.local` (and the one Render deployment, confirmed — same `NEXT_PUBLIC_FIREBASE_PROJECT_ID`) points at the real, non-disposable Firebase project. Slice 8.5 deliberately did **not** sign up test users, write `featureFlags` docs, or create `workspaceMappings` records against it. Every spec that needs a real authenticated session is written to be genuinely useful once run, but calls `test.skip(...)` with a clear reason when its env vars aren't set — never faked as passing.

## Running what's safe right now

No setup needed. These hit only public, unauthenticated routes and never write data:

```bash
npx playwright test e2e/shell/unauthenticated-entry.spec.ts e2e/shell/accessibility.spec.ts
```

## Running the full authenticated suite (operator setup)

### 1. Provision test accounts

Use the app's real signup/invite flow (never seed Firestore directly) to create the accounts you want to test. You don't need all of them — each spec file skips independently based on which env vars are set.

| Role | What it needs |
|---|---|
| Full Ascend eligible | A sub-account with an **active Workspace Mapping v2 record** (`WorkspaceTier: "full_ascend"` — see step 2) AND inside the `unified_shell` flag's `allowedWorkspaceIds` (step 3) |
| CRM-only | Any ordinary sub-account member — this is the default for every existing workspace (no mapping, no flag) |
| Agency owner | The bootstrap agency owner account, or any account with `agencyRole: "owner"` |
| Admin | A `subAccountAdmin` membership on a Full-Ascend-eligible workspace |
| Collaborator | A `subAccountCollaborator` membership on the same workspace, to exercise permission-hidden nav |
| One-workspace | An account with exactly one `userMemberships` entry |
| Multi-workspace | An account with 2+ `userMemberships` entries |
| No-workspace | An account with zero memberships (e.g. a removed member, or a brand-new signup with no invite accepted yet) |

### 2. Create a Workspace Mapping v2 record for the test workspace

`WorkspaceTier` only becomes `"full_ascend"` when an **active** mapping exists (Slice 6 — this is the one real, verified signal; there is no separate "tier" checkbox anywhere). Use the Slice 4 CLI (dry-run by default, requires `--apply` to write):

```bash
npx tsx scripts/migrate-single-workspace-mapping.mts \
  --clerk-user-id <a-real-clerk-user-id-with-a-resolved-identityLink> \
  --sub-account-id <your-test-sub-account-id> \
  --no-primary-profile \
  --apply
```

This requires a resolved `identityLinks` record for that `clerkUserId` first (Slice 3) — `scripts/backfill-identity-link.mts` creates one by hand if you don't already have a real SSO-linked account to use. Read both scripts' own doc comments before running against anything you care about.

### 3. Enable the `unified_shell` (and `unified_navigation`) flag for ONLY that workspace

Reuses the existing Slice 2 admin route — **never** set `rolloutStage` to `"ga"` for this exercise; `"single_workspace"` scoped to exactly the one test workspace id is the minimum-safe-rollout this slice's spec requires.

```bash
curl -X POST http://localhost:3000/api/platform/feature-flags \
  -H "Content-Type: application/json" \
  --cookie "__session=<a-real-agency-owner-session-cookie>" \
  -d '{
    "id": "unified_shell",
    "rolloutStage": "single_workspace",
    "allowedWorkspaceIds": ["<your-test-sub-account-id>"],
    "description": "Slice 8.5 shell certification - single test workspace only"
  }'
```

Repeat for `"unified_navigation"` if a spec needs it. This route is agency-owner-gated (`requireAgencyOwnerAny`) — grab the cookie from an authenticated browser session, or drive it through the (not-yet-built) admin UI once one exists.

### 4. Point the shell at the Ascend hostname

`decideShellMode()` also checks the request's `Host` header against `NEXT_PUBLIC_ASCEND_APP_URL`'s hostname. For a local run, either:
- Run Playwright against a `PLAYWRIGHT_BASE_URL` whose hostname matches `NEXT_PUBLIC_ASCEND_APP_URL`, or
- Set `ASCEND_SHELL_MODE_OVERRIDE=full_ascend` in `.env.local` (honored ONLY outside production — `decideShellMode()` asserts `isProduction === false` first, so this can never accidentally fire on a real deploy) to bypass the hostname check for local certification runs, leaving the entitlement-tier and rollout-flag checks live.

### 5. Set the test env vars and run

```bash
export TEST_FULL_ASCEND_EMAIL=... TEST_FULL_ASCEND_PASSWORD=...
export TEST_CRM_ONLY_EMAIL=... TEST_CRM_ONLY_PASSWORD=...
# ...see e2e/fixtures/test-accounts.ts for the full list...

npx playwright test
```

## Rollback drill (manual, ~30 seconds)

1. Confirm the test workspace currently reaches `/app/home` in Full Ascend mode.
2. `POST /api/platform/feature-flags` again with `rolloutStage: "off"` (or remove the workspace id from `allowedWorkspaceIds`) for `unified_shell`.
3. Reload `/app/home` with the SAME account — it should redirect to the existing `/sa/{id}/dashboard` immediately, with zero data changes (no migration, nothing to undo). This is `e2e/shell/rollback.spec.ts`'s skipped test, written out in full there.

## Test files

| File | Certification checklist section |
|---|---|
| `shell/unauthenticated-entry.spec.ts` | §4 (unauthenticated baseline) — runs live, no setup |
| `shell/accessibility.spec.ts` | §11 — automated axe scan, login page runs live; shell scan needs `TEST_FULL_ASCEND_*` |
| `shell/full-ascend-entry.spec.ts` | §4 Full Ascend eligible user |
| `shell/crm-only-fallback.spec.ts` | §4 CRM-only user |
| `shell/workspace-resolution.spec.ts` | §5 |
| `shell/lifecycle-navigation.spec.ts` | §6 |
| `shell/operational-module-handoff.spec.ts` | §7 |
| `shell/builder-handoff.spec.ts` | §8 |
| `shell/permissions-entitlements-gates.spec.ts` | §9 |
| `shell/rollback.spec.ts` | §4 rollout-disabled + rollback drill |
