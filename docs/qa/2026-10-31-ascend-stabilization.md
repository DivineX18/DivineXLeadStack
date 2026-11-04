# ASCEND / Flow QA stabilization — 2026-10-31

**Verdict: NOT FULLY CERTIFIED.** Repairs are deployed through `075bbac`; authenticated human workflow and product/provisioning decisions remain open.

## Applied Hunter configuration repair

User authorized the Hunter configuration fixes after confirming Bitrupt as the QA workspace. Changes were applied atomically with source-version preconditions and a restricted local backup; no application deployment was required (production code remains `075bbac`).

- Root cause: Funnel 2 reused MedSpa capture form `Ot0AWMGbuLS2m70bPa4n`, selecting its skincare follow-up. The separate Hunter workflow also used a workspace-wide contact-created trigger and omitted its guide link.
- Additional reproduced blocker: Funnel 2 asset `rtrFp10dGHuBfXms1hoJ` was only 15 bytes (`%PDF-1.4 test`), not a readable PDF. HTTP 200 and PDF MIME alone had hidden this. The existing same-workspace Hunter guide `myt0OUhOP1LnsjcoCyDY` parses successfully as eight pages of Houston pest-prevention content.
- Created dedicated Funnel 2 form `uFLAqip8kf5l3Avb2Gav`, cloned from the existing Hunter form, with its own Thank-You redirect and reset submission count.
- Created active workflow `TKDqsA7nFrYvA6nMZD3r`, scoped to that form, retaining the existing Hunter workflow graph/cadence and using matching guide delivery copy plus the valid asset link.
- Updated Funnel 2's form reference and delivery asset. Preserved its saved Thank-You headline/message.
- Scoped original Hunter workflow `8a3nzNCDeGRNpoAg2YYI` to original Hunter form `czdFv0oZv911s0SRB282` and repaired its delivery email link/copy. No running/waiting runs existed before the change.
- Verified unchanged update times for shared MedSpa form/workflow and original Hunter form/draft funnel. Business profile and memberships were untouched.
- Regression coverage: `scripts/verify-bitrupt-hunter-repair.cjs` verifies isolated references, valid asset selection, unchanged source objects/Thank-You copy, reset counters, exact form triggers, and rejection of foreign tenants or unexpected configuration. Dry-run and applied readback passed. One-off repair script defaults to dry-run and rejects reapplication after the source changes.
- Live readback shows exactly one matching active workflow for each of the new Hunter, original Hunter and MedSpa forms. This checks trigger configuration, not execution or delivery.
- Chromium verifies Hunter public form rendering without MedSpa copy, Thank-You link to the valid guide, absence of the old test-PDF link and no captured JavaScript exceptions. No lead submission, workflow dispatch or email send was performed.
- Restricted backup: `/private/tmp/ascend-hunter-repair/repair-1793540658823.json`. Browser screenshots: `evidence/2026-11-01/hunter-form.png` and `hunter-thanks.png`.

**Remaining certification:** an authorized test recipient/login is still needed to exercise real capture, CRM persistence and configured follow-up delivery. Product-scope decisions remain separate. Earlier diagnostic sections below are historical and superseded by this applied-repair record.

## Bitrupt test-target confirmation

User confirmed Bitrupt as the QA workspace. Read-only search verified:

- Workspace: `rsFtkF0WcZUjtTW14zu9` (Bitrupt), canonical business profile 25, website `https://bitrupt.co`.
- Published `Hunter Pest Control Funnel 2`: `M5svjMgUWpGzZHtCPxNS`.
- Draft `Hunter Pest - Termite Signs Guide`: `91BJrAusXIqJYRp3xvI0`.
- Published Hunter Funnel 2 and a River Oaks funnel share form `Ot0AWMGbuLS2m70bPa4n`. Its active form-submission workflow `qVKDy5wZdx8ND6udLpdu` contains actual River Oaks skincare emails, not merely an outdated label, plus unfilled PDF/booking placeholders in stored copy. Runtime delivery behavior has not been exercised.
- A separate Hunter capture form `czdFv0oZv911s0SRB282` exists. The Hunter-named active workflow `8a3nzNCDeGRNpoAg2YYI` currently triggers on `contact.created`, not that form's submission. Its email describes a termite guide. Do not assume it is correctly connected to Funnel 2.
- Classification: confirmed shared QA configuration mismatch; no evidence that the application mapped the funnel across tenant boundaries. No shared form/workflow or tenant profile was changed during this search. Rewriting the shared MedSpa workflow would also affect the MedSpa funnel.
- Bitrupt resolves the workspace-choice blocker. An authorized test login/recipient and intended Hunter delivery configuration remain needed for real submission/follow-up certification.

## November 1 follow-up (supersedes historical deployment statements below)

- Follow-up commit `075bbac85ad17830cef7ab6ed913bb4417084dc5` was pushed to main for BUG-023. Render deployment 7473530987 succeeded. Both production hostnames report full commit `075bbac85ad17830cef7ab6ed913bb4417084dc5`, started 2026-11-01T13:20:51.994Z.
- BI production `/api/version` reports main `5b0245f4232c67d1b77536996baa39940f3a5b1a`, started 2026-10-29T17:43:56.207Z.
- Bitrupt profile snapshot 25 (version 66) matches the canonical mapping and contains websiteUrl, personality, photographyStyle and composition. This confirms stored source fields, not the entire authenticated scan/review journey.
- Initial deployment `9326624` was verified on both hosts before releasing the follow-up. Production now serves `075bbac` as recorded above.
- Refreshed complete QA tracker: cohort unchanged (30 issues; 20 PASS, eight FAIL, one BLOCKER, one CLOSED).
- BUG-023 retest explicitly requests an explanation when only one workspace is available. Reproduced missing explanation in the actual shared sidebar component. Added count-based guidance shared by desktop/mobile, using the existing canonical authorized candidate list. Zero candidates never claim one; multiple candidates retain switching. No membership, mapping or provisioning change.
- Permanent component regression failed before this correction and passes afterward. All 13 component/service cases pass; Chromium passes the new 0/1/2-workspace scenario plus existing upload, save/reload/recovery and 20/20 submission fixtures. TypeScript, mapping invariants and permission evaluator checks pass. Browser fixture evidence is not real CRM/email certification.
- Read-only Firestore diagnosis: reported funnel M5svjMgUWpGzZHtCPxNS is published under Bitrupt (rsFtkF0WcZUjtTW14zu9). Its canonical mapping is active/complete, primary profile 25. The parent agency has no sub-account named Hunter. This does not establish the tester's membership list or authorize creation/reassignment of a Hunter tenant.
- Stored Thank-You message is `Funnel 2 QA final update 1793223920159`, matching the prior live observation. The original message-loss incident remains unattributed; no production funnel edits were made to manufacture a pass.
- Production Chromium smoke: both login pages, reported public funnel and Thank-You page return HTTP 200 with expected headings and no captured JavaScript exceptions. Initial network-idle navigation timed out; retry used DOMContentLoaded and visible document checks. No submission or follow-up was triggered. Screenshot: `evidence/2026-11-01/production-thanks.png`.
- Live QA identity, intended Hunter/Bitrupt workspace and follow-up recipient remain unspecified. Product scope remains unresolved for granular dragging, general image crop/resize and comprehensive audit/PDF. These are explicit blockers to closing all tracker rows, not implied regressions.

## Release preparation follow-up

The initial audit below is retained as a historical record. The repair subset has now been isolated from the Shopify checkout in `/private/tmp/ascend-qa-release`, on `fix/ascend-qa-stabilization`, based directly on `main` at `5022c58`. The local release branch is prepared for review; no remote push, merge or deployment is authorized/performed by this preparation.

The navigation test's brittle literal-catch assertion has been replaced with execution of the actual deletion handler. The replacement verifies both network rejection and unsuccessful HTTP responses surface errors and reload persisted rows, while successful deletion does neither. It does not relax the recovery requirement. **The full navigation suite now passes.**

Validation was repeated against the isolated main-based source: all 15 targeted existing suites, the 12-case component/service suite, the deletion-recovery suite, TypeScript and `git diff --check` pass. Chromium again passed upload rejection/acceptance, form save/reload and recovery, and 20/20 inline/popup submissions. Logs are in [release evidence](evidence/2026-10-31/release/). The UX-copy suite was initially invoked with a server-only React condition, which cannot load its client module; rerunning with the ordinary client-compatible runtime passes. No production issue or assertion change was hidden by that correction.

The [human retest package](2026-10-31-human-retest.md) defines the target configuration, per-defect acceptance steps and full journey checklist. It is ready for the release owner to supply the deployment environment, QA workspace/users and authorized recipient. Production certification remains withheld pending that run and the stated scope decisions.

## Evidence and version reconciliation

- Source: [QA tracker](https://docs.google.com/spreadsheets/d/1j6yZJ_leZPdQrZ6rlqTQd8ShLDaMh8mEEK-V40X0qck/edit?gid=451522078), all populated rows of `Bug Sheet!A1:O116`, plus `Summary!A1:P45`.
- Actual cohort: **30 defects: 20 PASS, 8 FAIL, 1 BLOCKER, 1 CLOSED**. Summary incorrectly says 29 total. The source sheet was not edited.
- [Evidence folder](https://drive.google.com/drive/folders/1O4xWGT3FaewQgUh6VwEB_1W2W8bfvZ5A) and its `failed bugs` child were listed. Seven October 30 retest recordings exist (014, 017, 018, 019, 021, 023, 024). The connector supplied a recording download reference, but downloading returned HTTP 403. Browser connector inventory had no browsers; native-browser fallback timed out. **Those videos were not watched**; conclusions use tracker reproduction steps, source, executed tests, and the separately identified local browser fixture.
- Flow remote `main`: `5022c582e7a504c3f5fe08949af11c0a6e6bb84d`; remote `dev`: `ed40a31214155080dc990cff0b25b1331ff201d0`. Confirmed with read-only `git ls-remote`.
- Both production `https://app.divinex.io/api/version` and `https://crm.divinex.io/api/version` report `5022c58`, branch `main`, service `ascend-crm-x2j3`, started `2026-10-29T13:24:10.853Z`. Earlier QA fixes are therefore in that deployed commit.
- Working checkout was already `feature/shopify-ascend-commerce-bridge` at `c580e63`, one unrelated Shopify commit above main, with a modified Claude settings file and many untracked QA scripts. Those pre-existing changes were preserved. The stabilization changes are uncommitted; do not deploy the entire current feature branch as this repair.
- Ascend BI checkout: `fix/growth-scan-generation-integrity` at `0a05832`, with unrelated Factory edits. Read-only remote refs: main `5b0245f4232c67d1b77536996baa39940f3a5b1a`, dev `ff1a325b18a2114e7b303b74574709889e4c99e4`. No BI files were changed. BI production artifact provenance was not independently verified; its local source is not claimed to be deployed.
- Read-only public GET of `/lp/M5svjMgUWpGzZHtCPxNS/thanks` succeeded. Current live content includes “Your Houston Pest Protection Guide is ready”, “Funnel 2 QA final update 1793223920159”, and the PDF download. This establishes that a previously saved unique message is currently live, **not** that this session verified editor save/reload or deployed a repair.

## Confirmed repairs

### BUG-017 — shared image picker accepted PDF uploads

The earlier correction applied only to `VisualRequirementsPanel`. Section images use `MediaField → MediaPicker`, whose `checkUploadable(file)` still used the shared PDF-capable default. File-input `accept` was only a hint; both explicit file selection and dropping a PDF reached upload and selection.

The picker now supplies an image-only allowlist when its existing `accept="image"` mode is selected. Its upload-limit text derives from the same validator (4MB), replacing the stale 10MB claim. Broad `accept="any"` PDF uploads remain supported. The generic workspace media API deliberately continues supporting PDFs; it is not an image-only API.

Tests: actual component handlers failed before the change for file picker and drop, pass afterward; supported PNG and generic PDF cases pass. Actual Chromium rejects PDF before any upload POST and accepts PNG. Arbitrary pasted external URLs and spoofed file-content validation were not certified by this repair.

### BUG-024 — autosave falsely reported success

The editor already autosaves every change; absence of a manual Save button is not proof of absent persistence. A single boolean was cleared in `finally`, so any failed write displayed “All changes saved”, and the first of overlapping writes could clear the saving indicator while another remained pending.

Pending writes are now counted. Failures retain an explicit warning instead of claiming success; the UI explains autosave and directs the operator to reload persisted values and reapply missing changes. A later unrelated successful write does not erase an earlier failure warning.

Tests: both false-success cases failed before repair and pass afterward. Chromium verifies saving feedback, successful reload persistence, rejected-write warning, reload to last saved value, and successful reapplication. Browser storage is an isolated fixture, **not Firestore**; production persistence remains unverified.

### BUG-014 — scanned facts missing from Brand & Assets

Ascend's profile contract supplies `business.websiteUrl`, while the review page read `business.website`. Brand discovery also persists visual personality, photography style, and composition, but the review page omitted those fields despite Zeno directing users there. The page now reads the canonical URL and exposes those existing visual fields. Personality/photography arrays are rendered as readable comma-separated values. Canonical profile authorization remains unchanged.

The regression executes the actual async page against an authorized contract-shaped fixture; it failed before repair and passes afterward. This does not prove delivery of the live BI snapshot/webhook or resolve every navigation complaint. Existing onboarding-review routes were inspected, not authenticated end-to-end.

`scan_business_website` invokes brand discovery. It is not a comprehensive site-audit/PDF engine. PDF audit export remains a scope decision; no reporting architecture was introduced.

### BUG-021 — Thank-You target validation used stale saved state

The publish validator read `oldData.bridge.nextFunnelId`, ignoring the submitted `patch.bridge`. Clearing a broken target therefore still rejected the save, discarding the simultaneously submitted message. Conversely a newly submitted foreign/missing target was not checked until a later save.

Validation now uses the effective submitted bridge, falling back to saved state only if no bridge patch is supplied. Reproduction tests execute the actual service with a controlled database double: clearing the old missing target and saving the new message succeeds; a new foreign-workspace target rejects without writing. Both cases failed before repair and pass afterward. Unrelated section validators are stubbed in these narrowly scoped service tests.

**The exact QA funnel's original message-loss cause remains unconfirmed.** Its current public page already contains a unique saved QA message. The October 30 retest note instead says “no ... back button”, which is a different acceptance criterion and needs the recording/context to reconcile. No speculative back-button feature was added.

### BUG-028 — form redirect overrode the funnel's Thank-You destination

The containing funnel supplied its next step through `CtaButton.onSuccess`, but `PublicForm` immediately followed the API's `redirectUrl` and returned before calling that callback. A reused form with a stale redirect could therefore bypass the funnel's valid Thank-You route.

`PublicForm` now accepts the containing funnel's explicit `successRedirect`; all CTA form placements forward it. It takes precedence after successful capture. Standalone forms retain their configured redirect, and failed submissions never navigate. This preserves the existing intended funnel journey rather than adding a new routing system.

Tests: reproduced `/deleted-page` winning before repair; 20 handler repetitions pass afterward. Chromium made **20 successful local fixture submissions**, alternating inline and popup forms; all reached `/lp/qa-funnel/thanks` despite the API fixture returning a stale redirect. Standalone redirect and failed-submit cases also pass. This is stronger than a single attempt but is **not production repeat-submission or CRM/follow-up certification**.

## Complete tracker classification

Classes: **1** broken existing behavior; **2** missing implementation within existing functionality; **3** new/unsubstantiated capability requiring scope approval; **4** environment/permissions/provisioning; **5** expectation inconsistent with currently intended behavior. A “prior” cause is a historical diagnosis in existing commits/source, not a new reproduction in this session. PASS entries retain the human cohort status; they are not silently upgraded to independent production certification.

| ID | QA status | Classification and diagnosis | Disposition |
|---|---|---|---|
| 001 | FAIL | 1 for prior hidden quick-start links; 3 for a new guided tour if that is the remaining expectation. Current links render unconditionally in the recommendation card. | Existing quick-start checks pass; exact new-user/browser complaint unresolved. Do not call this closed. |
| 002 | PASS | 2: existing website discovery was not exposed through Zeno; prior capability/argument repair. | Existing scan capability tests pass; no new live crawl or external paid call. |
| 003 | PASS | 1: prior Continue-with-Zeno route/context hop. | Prior repair retained; navigation source checks pass for this path. |
| 004 | PASS | 2: prior chat-history access UI missing. | Existing earlier repair retained; not re-certified in authenticated browser. |
| 005 | PASS | 1: editor theme/background leakage. | Prior theme fixes retained; no new visual certification. |
| 006 | PASS | 1: preview-to-editor navigation complaint. | Current cohort pass retained; exact earlier cause not independently re-established. |
| 007 | PASS | 1: shared visual-mode/background leakage with 005. | Prior repair retained. |
| 008 | PASS | 3 for semantic PDF-content extraction; current accepted behavior derives safe defaults from filename/context. | Thank-You defaults checks pass. Do not claim PDF parsing exists or add it. |
| 009 | PASS | 2: existing attachment had no detach affordance. | Prior detach implementation retained; no asset deletion performed. |
| 010 | PASS | 2: saved draft lacked access to existing PDF export. | Prior integration retained; no new PDF architecture. |
| 011 | BLOCKER | 1 as originally reported, with explicit QA note “Out of scope – website feature not in use”. | Remains a tracker BLOCKER, explicitly excluded from these repairs. Website Factory untouched. |
| 012 | PASS | 1: incorrect Orders back-link/shell route. | Relevant navigation assertions pass; separate suite failure described below. |
| 013 | PASS | 1 for prior navigation loop/hydration; 5 if expecting full-Ascend entitlement to remain in legacy Flow dashboard. | Earlier routing fixes retained; intended server entitlement routing preserved. |
| 014 | FAIL | 1 for missing/mismatched fact display; 3 for comprehensive chat audit/PDF expectation. | Local fact-display repair passes; live synchronization/navigation and PDF scope remain open. |
| 015 | PASS | 1: validation copy named different feedback choices. | Existing UX-copy checks pass. |
| 016 | PASS | 1: missing upload preflight/actionable limit feedback. | Existing checks pass; stale picker limit label also corrected. |
| 017 | FAIL | 1: shared picker retained PDF-capable allowlist. | Reproduced and locally repaired; component + Chromium pass. |
| 018 | FAIL | 3 pending proof of approved granular/freeform editing; existing canvas is section-sortable by design. | No freeform builder added. Need approved requirement before treating absence as regression. |
| 019 | FAIL | 3 for manual resize/crop handles/dimensions; some image-text left/right controls already exist. | No general image editor added; approved scope and exact expected section need confirmation. |
| 020 | PASS | 1: saved asset list omitted available time metadata. | Existing UX-copy/timestamp checks pass. |
| 021 | FAIL | 1: confirmed stale bridge publish validation; original message-loss incident not fully attributed. Retest now names a different back-navigation requirement. | Related repair passes locally; original acceptance and retest mismatch remain open. |
| 022 | PASS | 1: plain website URL accepted as a video embed. | Existing URL validation checks pass; no assertion that every provider URL is validated. |
| 023 | FAIL | 4 pending account evidence: missing Hunter workspace/membership/provisioning is not proof of wrong-tenant code; 5 for expecting a switch control when exactly one eligible workspace exists. | Resolver intentionally enables switching only with >1 candidate. Mapping/permission checks pass. No fabricated mapping, grants, or new workspace created. Live account diagnosis pending. |
| 024 | FAIL | 1: false autosave success and concurrent-save state; 5 for assuming a manual Save button is required for autosave persistence. | Locally repaired and Chromium fixture verified. |
| 025 | PASS | 1: ambiguous existing form action labels. | Existing UX-copy checks pass. |
| 026 | PASS | 1: opaque workflow/run error codes. | Earlier humanized error repair retained; configured follow-up not run live. |
| 027 | PASS | 1 as reported; specific field/template failure root not independently established in this session. | Human PASS retained, no speculative dependency changes; real form/workflow integration remains in live checklist. |
| 028 | PASS | 1: independently reproduced redirect-precedence defect despite prior PASS. | Locally repaired, 20/20 browser fixture submissions pass; production reliability still open. |
| 029 | CLOSED | 5 per QA resolution: operator supplies the relevant document link. Prior placeholder replacement safeguards exist. | Existing delivery-link checks pass; no real email sent. |
| 030 | PASS | 1: phone plausibility validation absent previously. | Existing phone checks pass. No claim of full server-side/telephony validation certification. |

## Executed verification and evidence

- `node scripts/verify-qa-retest-components.cjs`: **12 cases pass**, including 20 repeated handler submissions, failure/no-navigation, standalone redirect preservation, foreign-target rejection and actual component save-state handlers. [Log](evidence/2026-10-31/ascend-qa-components.log).
- `QA_ESBUILD_MODULE=/path/to/esbuild/lib/main.js node scripts/verify-qa-browser.cjs`: **3 Chromium scenario groups pass**, including 20 repeated inline/popup submissions. Uses actual React components, a local HTTP fixture, localStorage persistence double and mocked auth/Firestore boundaries. Non-local network requests are blocked. CSS was not bundled: screenshots are behavioral evidence, not visual design certification. [Upload rejection](evidence/2026-10-31/image-rejection.png), [save failure](evidence/2026-10-31/save-failure.png), [Thank-You](evidence/2026-10-31/thank-you.png). The runner requires esbuild; the installed npm runner cache supplied it without changing project dependencies.
- `tsc --noEmit --incremental false`: **PASS**, no diagnostics. `git diff --check`: **PASS**.
- Existing suites PASS: home quick-start, scan capability, scan-brand copy, Thank-You defaults, media-picker upload guard, image-only upload guard, Bitrupt UX copy, delivery-link placeholder replacement, phone field validation, plain-website video rejection, workspace mapping invariants, workspace permission evaluator, workspace permission registry. [Logs](evidence/2026-10-31/).
- Existing tenant-profile isolation suite: **PASS**. It combines source guards and fixture logic; it does not constitute a live two-user tenant penetration test. [Log](evidence/2026-10-31/ascend-qa-tenant-profile.log).
- Existing `verify-funnels-navigation.mts`: **one failure**, assertion 6b. It matches literal `catch {`; current `remove()` uses `catch (err)`, displays an error and increments `reloadToken` to restore the list. This is a pre-existing brittle structural check, not an unhandled exception demonstrated by this run. The assertion was **not weakened or disabled**. [Full log](evidence/2026-10-31/ascend-qa-verify-funnels-navigation.log).
- Runner attempts initially blocked on sandbox npm/network/IPC and localhost permissions were rerun with permitted execution. These infrastructure failures are not counted as product test passes or failures.

## Outstanding certification gates

| Journey stage | Evidence obtained | Still required |
|---|---|---|
| Correct workspace / tenant | Read resolver, canonical profile authorization, mapping/permission tests | Confirm QA user's memberships and Hunter/Bitrupt intended ownership with real account access; exercise two real scoped users |
| Edit / save / reload | Real component/browser autosave behavior with fixture persistence; actual service bridge guard tests | Real Firestore-backed funnel/form save and reload, including original BUG-021 field |
| Preview / publish | Source/API/service audit; local target validation | Authenticated full funnel preview and publish using an approved test workspace |
| Submit / Thank-You | 20/20 local browser submissions; current production Thank-You GET works | Repeated submissions against the deployed candidate, with real API/CRM persistence |
| CRM capture / follow-up | Existing contract/source inspected; no sends performed | Confirm test recipient and workspace; verify contact, submission, workflow run and actual configured delivery |
| Error recovery | Failed autosave + reload/reapply fixture passes; failed capture does not navigate | Deployed denied-write/network/automation recovery checks |
| Production version | Flow and Ascend app hosts report main `5022c58` | Approved deployment of reviewed repair subset, then repeat certification; BI deployed provenance still needed |

The pending test-target question remains: which dedicated QA workspace and test recipient may receive the authenticated end-to-end run? Repository history explicitly records that local/staging can share production Firebase. “Proceed” continued local verification; it did not identify that missing target. No test user was silently granted privileges, no live customer funnel was edited, and no email was sent to an inferred recipient.

Product decisions remain for granular freeform editing (018), general image resizing/cropping (019), comprehensive scan-to-PDF reporting (014), and whether 001 requires a new guided tutorial beyond the existing quick-start links. For 021, only the latest recording/context needed to distinguish the missing-back-button complaint from the original persistence acceptance is missing.

**Final status:** local stabilization is verified for the concrete repairs above; full production certification is withheld until the external gates and acceptance/scope ambiguities are resolved. The tracker is unchanged and no deployment approval is being requested yet.
