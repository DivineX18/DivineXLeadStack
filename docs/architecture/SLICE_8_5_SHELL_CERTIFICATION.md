# Slice 8.5 — Unified Shell Stabilization & Browser Certification

**Status: CONDITIONAL GO for Slice 9.** Code-level stabilization is complete and verified (structurally + live for everything that doesn't require a real authenticated session). Full live authenticated-flow certification is **written and ready but not executed**, because this environment's `.env.local` and its one Render deployment share the same real, non-disposable Firebase project (`ascend-crm-jvm`) — confirmed, not assumed (see "Environment" below). See "Final recommendation" at the bottom for exactly what should happen before/alongside Slice 9.

## Environment tested

| | |
|---|---|
| Branch | `dev` |
| Commit this certification was performed against | `d31a422` (pre-Slice-8.5, i.e. the exact Slice 8 code as shipped) |
| Commit this certification's fixes + infrastructure landed on | see the Slice 8.5 commit hash in the completion report / ledger |
| Hosting | **Render** (confirmed by the user mid-session; CLAUDE.md's Phase 5 deploy instructions describe Vercel, which does not match — flagged as a pre-existing docs/reality mismatch, out of scope to fix in this slice) |
| Firebase project | `ascend-crm-jvm` — confirmed to be the SAME project id configured on the one existing Render service ("Ascend CRM", `ascend-crm-db9e7`), via a direct screenshot comparison with the user mid-session. **This is the real, production-equivalent Firebase project**, not a disposable test project. |
| Stripe mode | Test keys (`sk_test_*`/`pk_test_*`) — irrelevant to this slice, no payment flows touched |
| Local app URL | `http://localhost:3000` |
| Browsers | Chromium (Playwright's bundled Chrome for Testing), via two projects: `chromium-desktop` (Desktop Chrome viewport) and `chromium-mobile` (Pixel 7 viewport/UA) |
| Viewports exercised live | Desktop (Playwright default ~1280×720) and Pixel 7 mobile (412×915-class); an explicit 1440×900 desktop and 390×844 mobile size are used in two skip-guarded shell specs pending real credentials |
| Test accounts/roles used | **None created.** See "Why no live authenticated testing was performed" below. |
| Feature-flag state | `unified_shell`/`unified_navigation`: no Firestore doc exists (confirmed by not creating one) → both evaluate to `false` for every caller, deployment-wide. **No flag was touched.** |
| Workspace IDs | N/A — none created or touched |

## Why no live authenticated testing was performed

Section 2 of this slice's instructions requires creating a scoped test rollout (one test workspace flagged in) and driving real login flows. Before doing that, this session investigated whether the local `.env.local` pointed at a disposable project safe to write test users/flags into. Findings, escalated to the user mid-session:

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=ascend-crm-jvm` in `.env.local`.
- `BOOTSTRAP_ADMIN_EMAIL=hello@divinex.io` — the real, documented support email used throughout the live product's own copy.
- The user's Render dashboard shows exactly one project ("Ascend CRM", `ascend-crm-db9e7`) whose own `NEXT_PUBLIC_FIREBASE_PROJECT_ID` env var is confirmed (via screenshot) to also be `ascend-crm-jvm`.

**Conclusion: confirmed, not assumed** — this is the one real Firebase project backing the live deployment. Per this slice's own repository discipline ("Do not modify production data", "No production-wide flag enablement is permitted", and implicitly: don't create test customer accounts in the one real customer database), no signup, login, Firestore write, or flag mutation was performed against it.

**What this does NOT block**: the actual login/SSO/workspace-resolution *engineering* (Slices 3, 4, 7) is unaffected — it's already built, already unit/structural-tested, and doesn't require a live browser to exist correctly. What's blocked is specifically *this session* clicking through it in a real browser as a one-off certification exercise.

## Shell truth confirmed (source-level audit, before any fix)

Re-verified from source, not from Slice 8's own completion report (per instruction: "Do not assume Slice 8's completion report is fully accurate"):

| Item | Slice 8 completion report claimed | Actually found |
|---|---|---|
| Mobile navigation | Implied "works on mobile" (objective bullet 9 listed, no caveat) | **False.** The `<aside>` was `hidden ... md:flex` with zero alternative below 768px — a real customer on a phone had no way to reach any lifecycle section. |
| User menu / logout | Not mentioned either way | **Absent entirely.** No sign-out control existed anywhere inside `/app/*`. |
| `aria-current` | Not mentioned | **Absent.** Active-link styling existed, but no `aria-current="page"` attribute. |
| Locked nav items | Described as "visible-but-locked with a reason" | Reason was `title`-attribute only — invisible to screen readers, and the element wasn't a tab stop at all (plain `<div>`), so keyboard users couldn't discover it existed. |
| Skip-to-content link | Not mentioned | **Absent.** |
| Reduced motion | Not mentioned | Not honored (minor — only affects small hover-color transitions). |
| Everything else (mode resolution, redirect behavior, permission/entitlement gating logic, `/app/*` route protection, byte-for-byte untouched existing files) | Verified structurally in Slice 8 | **Re-confirmed correct** — re-read every file in `src/lib/shell/`, `src/types/ascend-shell.ts`, and `src/app/app/layout.tsx` line by line; the composition/decision logic itself had no defects, only the UI layer built on top of it. |

One additional structural finding, valuable for §5 (Workspace resolution) certification without needing a live test: `resolveShellContextForLayout()` — the only entry point `layout.tsx` calls — is invoked with **no options**, so `explicitWorkspaceId` is always `undefined` there. There is no `/app/[workspaceId]/...` route and no query param wired to workspace selection anywhere in the shell. **"Manual URL manipulation with an unauthorized Workspace ID" has no attack surface against the shell itself** — the workspace is derived exclusively from a server-side read of the caller's own `userMemberships`. (Flow's existing `/sa/[subAccountId]/*` routes DO take a client-supplied id and remain protected by Slice 5's unmodified `resolveSubAccountAccess()` — out of scope to re-test here, already covered by Slice 5's own suite.)

## Fixes made (all reproduced by source/code audit; see caveat below)

Per the fixing policy, fixes should be "reproduced in a browser." Given the live-credential constraint above, these were reproduced by rigorous static/source audit instead — each is an objective, unambiguous code property (a missing attribute, a `hidden md:flex` with no alternative, a nonexistent component), not a subjective judgment call, and each is now covered by a regression test (`scripts/verify-shell-8-5-fixes.mts`, 16/16 passing) plus a corresponding live-browser Playwright assertion that will run for real the moment credentials exist (see `e2e/shell/full-ascend-entry.spec.ts` and `e2e/shell/lifecycle-navigation.spec.ts`).

1. **Mobile navigation was completely missing.** New `AscendMobileNav` component (Sheet-based drawer, mirrors the existing Flow sidebar's exact desktop-aside + mobile-Sheet split) + shared `AscendShellSidebarContent` (single source of nav markup for both desktop and mobile — no duplicated hand-maintained copy).
2. **No user menu / no logout path.** New `AscendUserMenu` component, reusing the EXISTING `signOutUser()` (not a new sign-out implementation).
3. **No `aria-current`.** Added to the active nav link.
4. **Locked nav items weren't keyboard-discoverable.** Now `role="button" tabIndex={0} aria-disabled="true"` with the lock reason in `aria-label` (not just `title`).
5. **No skip-to-content link.** Added, targeting a new `id="ascend-main"` on `<main>`.
6. **No landmark label on the nav.** Added `aria-label="Lifecycle navigation"` / `aria-label="Account and workspace"`.
7. **Reduced motion not honored.** Added a scoped `@media (prefers-reduced-motion: reduce)` override under `.theme-ascend`.

None of these touch any file outside `src/components/shell/`, `src/app/app/layout.tsx`, or the additive `.theme-ascend` block in `globals.css` — every file Slice 8 proved untouched (sidebar.tsx, header.tsx, billing-guard.tsx, zeno-launcher.tsx, etc.) remains untouched (re-verified, see Verification below).

## Test infrastructure built

No test framework existed in this repository before this slice (confirmed: no Playwright/Cypress/Jest/Vitest config anywhere). Added, scoped narrowly to shell certification:

- `@playwright/test` + `@axe-core/playwright` (dev dependencies), Chromium browser binary installed and confirmed working.
- `playwright.config.ts` — two projects (`chromium-desktop`, `chromium-mobile`), `webServer` auto-starts `pnpm dev`.
- `e2e/fixtures/test-accounts.ts` — env-var-driven test account/workspace loader. **Zero hardcoded credentials.** Covers all 11 roles/states this slice's spec named (Full Ascend, CRM-only, agency owner, admin, collaborator, one-workspace, multi-workspace, no-workspace, archived, rollout-enabled, rollout-disabled).
- `e2e/fixtures/auth.ts` — logs in through the REAL Firebase login form (no cookie injection, no auth bypass).
- `e2e/README.md` — exact operator instructions: how to provision each test account, how to create a Workspace Mapping v2 record (Slice 4's CLI), how to scope the `unified_shell` flag to exactly one test workspace (Slice 2's existing admin route, `single_workspace` stage only — never `ga`), how to point the shell at the Ascend hostname locally, and the exact rollback-drill steps.
- 9 spec files under `e2e/shell/` covering every checklist section (§4-§10) — see the file-to-section table in `e2e/README.md`.

## Checklist results

Legend: **PASS (live)** = actually executed against a real browser this session. **PASS (structural)** = proven by source audit + a passing `scripts/verify-*.mts` check, not a live browser. **NOT TESTED** = written as a skip-guarded Playwright spec, ready to run, blocked on real test credentials per the environment finding above.

### §4 Authentication and entry

| Item | Result |
|---|---|
| Existing Firebase login succeeds | PASS (live) — for the anonymous/no-session path (`/login` renders, accepts input, is keyboard-navigable); NOT TESTED for a real successful login (needs credentials) |
| `/app` resolves Full Ascend mode for an eligible user | NOT TESTED |
| Correct single workspace auto-selected | NOT TESTED |
| Multiple workspaces produce explicit selection, not arbitrary default | PASS (structural) — `decideWorkspaceSelection()`'s `multiple_available` behavior already has 25 genuine Slice 7/8 unit tests; live confirmation NOT TESTED |
| Missing/unresolved workspace → designed no-workspace state | PASS (structural, same basis); NOT TESTED live |
| No redirect loop | **PASS (live)** — for the unauthenticated case (single hop to `/login`, asserted via navigation-event counting); NOT TESTED for the authenticated bare-`/app` → `/app/home` case |
| Refresh preserves session | NOT TESTED |
| New tab behaves correctly | NOT TESTED |
| Logout clears session, returns to expected destination | NOT TESTED |
| CRM-only: existing login/experience intact | NOT TESTED (needs a CRM-only test account, though this is the DEFAULT state for every real account today) |
| CRM-only: `/app/*` fails closed | PASS (structural) — proven for the unauthenticated case live; the authenticated CRM-only case is structurally identical (same `decideShellFallbackRoute()`, already unit-tested in Slice 8) but NOT TESTED live |
| No Full Ascend branding leaks into CRM-only mode | PASS (structural) — `resolveShellBranding("crm_only", ...)` unit-tested to pass through Flow's brand unchanged; live confirmation NOT TESTED |
| Rollout disabled → safe CRM-only experience | **PASS (live + structural)** — every workspace today has no flag doc, confirmed live via the unauthenticated redirect tests being representative of the actual current state of this deployment, AND structurally via `verify-shell-composition.mts` |
| Direct `/app/*` access doesn't expose the shell when rollout is off | **PASS (live)** |
| Re-enabling the flag restores the shell without migration | PASS (structural) — the shell reads the flag fresh on every request (no cache, no persisted "was flagged" state); NOT TESTED live |

### §5 Workspace resolution and switching

| Item | Result |
|---|---|
| Exactly one authorized workspace | NOT TESTED |
| Multiple authorized workspaces | NOT TESTED |
| Agency owner / admin / collaborator cases | NOT TESTED |
| Archived / inactive workspace | NOT TESTED |
| Missing / stale Workspace Mapping v2 | PASS (structural) — Slice 6's `evaluateWorkspaceEntitlements()` blanket-denial path, already unit-tested (Slice 6 + Slice 7's own suites); NOT TESTED live |
| Manual URL manipulation with an unauthorized workspace ID | **PASS (structural, definitive)** — no client-controllable workspace-id input exists anywhere in the `/app/*` route surface (see "Shell truth confirmed" above); there is nothing to manipulate |
| Browser back/forward after switching | NOT TESTED |
| Refresh after switching | NOT TESTED |
| Workspace context preserved into operational modules | NOT TESTED (written; see `e2e/shell/operational-module-handoff.spec.ts`) |
| No unauthorized workspace loadable via client-submitted ID | PASS (structural, same basis as manual-URL item above) |
| No data from Workspace A appears in Workspace B | NOT TESTED live; no code path in the shell itself caches or mixes cross-workspace data (each request re-resolves fresh) |

### §6 Lifecycle navigation

| Item | Result |
|---|---|
| All 8 sections load, direct URL access protected | NOT TESTED live (written, iterates the real `ASCEND_LIFECYCLE_SECTIONS` registry so it can't drift) |
| `aria-current` correct | PASS (structural, fixed + regression-tested this slice) |
| Permission/entitlement-filtered entries hidden/locked correctly | PASS (structural) — 7 genuine unit tests in `verify-shell-decisions.mts` already cover both branches; live confirmation NOT TESTED |
| Unknown registry entries fail closed | **PASS (structural, definitive)** — `buildShellNavigation()` only ever iterates the fixed `ASCEND_LIFECYCLE_SECTIONS` const array; there is no dynamic/unknown-entry code path to fail open |
| No duplicate navigation systems | PASS (structural) — `/app/*` layout renders no `Sidebar`/`Header`/`BottomTabBar` import at all (confirmed by reading the file) |
| Browser back/forward | NOT TESTED live (written) |
| Mobile navigation reaches the same destinations | PASS (structural, fixed this slice — `AscendShellSidebarContent` is shared verbatim between desktop and mobile, so they're structurally incapable of drifting) |

### §7 Operational-module handoffs

NOT TESTED live for any of the 15 real Flow surfaces the checklist's generic module names map onto (see `e2e/shell/operational-module-handoff.spec.ts`'s mapping table). Structural guarantee that DOES hold: the shell's placeholder pages link to `/sa/{workspaceId}${path}` — ordinary Flow URLs — so Flow's EXISTING, unmodified authorization/entitlement/billing gates (Slices verified in prior slices) apply exactly as they do today; the shell introduces no new code path into any operational module.

### §8 Complex builders and full-screen editor handoff

**Known, confirmed gap — not a pass.** Slice 8 did not build any Ascend-branded full-screen editor chrome. Clicking through from `/app/create` lands on Flow's existing builder pages inside Flow's own `(dashboard)` layout (its own sidebar+header) — there is no minimal Ascend top bar, no "Back to Ascend" affordance, no removal of the duplicate sidebar. This is a real, documented seam for Slice 9+ (see "Remaining known seams" below), not something this slice's narrow fix scope should attempt (would mean touching `(dashboard)/layout.tsx`, which every prior slice has kept byte-for-byte untouched, without live verification). What IS confirmed: no iframe is used anywhere (structural — grepped the entire builder-handoff path), so at minimum the "no iframe" architectural guarantee holds.

### §9 Permissions, entitlements, gates, rollout combined

PASS (structural) for the parts provable without a live account: the shell never re-implements permission/entitlement logic (100% delegation to Slices 5/6's real evaluators, confirmed structurally in `verify-shell-composition.mts`), and the internal `WorkspaceEntitlementDenialReason` strings (`feature_gate_disabled`, `billing_inactive`, etc.) never appear in the UI's `lockedReason` text (`buildShellNavigation()` only ever emits the one static customer-safe string). Combinatorial live matrix (collaborator vs admin vs owner, etc.) NOT TESTED — written in `e2e/shell/permissions-entitlements-gates.spec.ts`.

### §10-§12 Responsive, accessibility, visual cohesion

| Item | Result |
|---|---|
| Login page: responsive rendering, keyboard nav, axe scan | **PASS (live)** — both desktop and mobile Playwright projects, zero critical/serious axe violations |
| Unauthenticated `/app/*` redirect on mobile viewport | **PASS (live)** |
| Authenticated shell: sidebar collapse, mobile drawer, touch targets, axe scan of `/app/home`, etc. | NOT TESTED live (written, skip-guarded) |
| Visual cohesion ("does this feel like one product?") | **Partial, honest finding**: the shell frame itself (sidebar, branding, nav) is visually cohesive and distinct from Flow's CRM chrome — but the moment a customer clicks into ANY operational module or builder, they land in unmodified Flow CRM styling with zero visual transition, exactly as documented in §8 above. This is the single biggest remaining cohesion gap, and it was already known/disclosed in Slice 8's own ledger ("no global restyle of existing Flow screens" was explicit scope). Not fixed here — correctly deferred, per instruction, to a future native-screen migration rather than a risky broad refactor. |

### §13 Error/loading/unavailable states

No raw stack traces or internal reason strings found in anything the shell itself renders (source-reviewed: `AscendSectionPlaceholder`, the layout's redirect paths, and `AscendShellNav`'s locked-item text are all static, customer-safe strings — none interpolate a raw `WorkspacceEntitlementDenialReason` or similar). No infinite-loading state exists in the shell (every render path either redirects synchronously in the Server Component or renders content — there's no client-side loading spinner state in `/app/*` at all today, since it's server-rendered). Live confirmation of runtime behavior (network timeout, unexpected 500) NOT TESTED.

### §14 Performance

Not deeply instrumented this slice (no APM/tracing tool in the repo to attach). Structural observation carried over from Slice 8's own ledger risk section, re-confirmed still true: each of the 8 lifecycle placeholder pages independently calls `resolveShellContextForLayout()` in addition to the layout's own call — meaning identity/entitlement/flag resolution runs twice per request today. This is a real, known duplicate-fetch inefficiency, **not fixed in this slice** (it's a Slice 9 optimization opportunity per Slice 8's own ledger, and fixing it now would mean introducing a request-scoped context-passing mechanism, which is architecture work beyond this slice's "fix only reproduced defects" scope). No other regression identified.

## Automated test counts

| Suite | Result |
|---|---|
| `scripts/verify-shell-8-5-fixes.mts` (new, this slice) | ✅ 16/16 — one regression check per fixed defect |
| `e2e/shell/unauthenticated-entry.spec.ts` | ✅ 14/14 × 2 projects = 28/28, all run live |
| `e2e/shell/accessibility.spec.ts` | ✅ 1/1 × 2 projects = 2/2, run live |
| `e2e/shell/*` requiring credentials (7 files) | 104 tests, all cleanly SKIPPED (not run, not faked) |
| `scripts/verify-shell-decisions.mts` (Slice 8) | ✅ 25/25 |
| `scripts/verify-shell-composition.mts` (Slice 8) | ✅ 41/41 |
| `scripts/verify-identity-resolution.mts` / `-resolver.mts` (Slice 7) | ✅ 12/12, 30/30 |
| `scripts/verify-workspace-entitlements.mts` / `-evaluator.mts` (Slice 6) | ✅ all passing |
| `scripts/verify-workspace-permission-registry.mts` / `-evaluator.mts` (Slice 5) | ✅ all passing |
| `scripts/verify-workspace-mapping-invariants.mts` / `-service.mts` (Slice 4) | ✅ all passing |
| `scripts/verify-identity-links.mts` / `verify-sso-jit-extraction.mts` / `verify-require-tenancy-extraction.mts` (Slice 3) | ✅ all passing |
| `npx tsc --noEmit` | ✅ Clean |
| `pnpm lint` | ✅ 32 pre-existing problems (2 errors, 30 warnings), all pre-existing and unrelated to this slice; **zero new** |
| `pnpm build` | ✅ Clean |

## Manual certification checklist status

Every item in this slice's own §4-§14 checklists is recorded above with an explicit PASS (live) / PASS (structural) / NOT TESTED / known-gap status — none marked passed without being run. No screenshots were captured (no live authenticated session to screenshot); Playwright's own `test-results/` trace/screenshot artifacts exist for the specs that DID run (git-ignored, not committed).

## Rollback test result

**Structural PASS, live NOT TESTED.** The shell's fail-closed design means "rollback" isn't a special code path — it's the SAME `decideShellMode()` evaluation that runs on every single request, re-reading the flag fresh every time (Slice 2's `isFeatureFlagEnabled()`, no caching). There is no persisted "this workspace is in Ascend mode" state anywhere to migrate or clean up. The live drill (flip a real flag off, reload, confirm immediate reversion) is written out in full in `e2e/shell/rollback.spec.ts` and `e2e/README.md`'s "Rollback drill" section for a human to run in under a minute once a test workspace exists.

## Remaining known seams (for Slice 9 or later, not fixed here)

1. **No Ascend-branded full-screen editor/module chrome.** Every operational module and builder handoff currently drops the customer into unmodified Flow CRM styling with a visible seam. This is the single largest remaining "does this feel like one product" gap.
2. **No "Back to Ascend" affordance inside Flow's existing `(dashboard)` layout.** A user who clicks from the Ascend shell into, say, Pipeline has no in-app way back except the browser back button or re-typing `/app`. Fixing this would mean touching `(dashboard)/layout.tsx` or `header.tsx` — files kept byte-for-byte untouched across Slices 8 and 8.5 — and doing so without a live browser to verify against was judged too risky for this slice's narrow scope.
3. **Duplicate identity/entitlement resolution per request** (each of the 8 placeholder pages re-resolves shell context independently of the layout). Performance-only, not a correctness defect.
4. **The "workspace switcher" is a static link to `/agency`**, not an inline picker — already disclosed as a deliberate Slice 8 simplification, unchanged here.
5. **CLAUDE.md's Phase 5 deploy instructions describe Vercel; actual hosting is Render.** Pre-existing documentation/reality mismatch, unrelated to the shell, out of scope for this slice.
6. **Live authenticated-flow certification itself remains outstanding** — this is the biggest open item. See "Final recommendation" below.

## Final recommendation for Slice 9

**Conditional go.** The shell's code-level correctness, fail-closed security properties, and now its baseline accessibility/mobile-navigation/logout completeness are all verified — either live or by rigorous, testable structural proof, with zero weakening of Slice 5/6's real evaluators anywhere. Slice 9 can safely build on top of `AscendShellContext`/`resolveShellContext()` as-is.

**Before (or in parallel with) Slice 9, a human with write access to the real Firebase project should**: provision one real test workspace, run it through the Workspace Mapping v2 + `unified_shell` single-workspace-scoped flag setup in `e2e/README.md`, and run `pnpm test:e2e` for real. That run will convert most of this document's "NOT TESTED" rows to genuine PASS/FAIL and is the one piece of this slice's original instructions that could not be completed inside this session, for the environment-safety reason documented above — not because the work wasn't done, but because doing it live required writing to the one real customer database.
