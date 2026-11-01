# ASCEND / Flow — human QA retest package

**Deployed initial candidate:** `93266249b0ac7be9b63566d0b71baa610a93a49c` on production main; both app.divinex.io and crm.divinex.io verified November 1. A follow-up BUG-023 workspace-availability explanation is locally verified; capture its final deployed commit before testing that change.

## Before testing

The release owner must fill in the following before handing this package to testers:

| Required detail | Current state |
|---|---|
| Approved deployed candidate commit | Initial `9326624` verified live; follow-up candidate pending release |
| Test environment URL | Production app.divinex.io / crm.divinex.io; designated QA workspace still required |
| QA workspace ID and expected business/profile | Not provided; explicitly distinguish Hunter Pest Control from Bitrupt |
| Authorized QA user and role | Not provided; use the ordinary assigned role, not an owner impersonation |
| Second restricted user/workspace for isolation tests | Not provided |
| Authorized test email/phone recipient | Not provided; no inferred real customer recipient |
| Test funnel/form/workflow IDs | Create or designate only within the approved QA workspace |
| Expected follow-up action and timing | Record from actual enabled workflow configuration |

If a prerequisite is absent, mark its scenario **BLOCKED**, not PASS or FAIL. Record the URL, commit, user role, workspace ID, timestamp, and unique run marker for every run. Redact credentials and customer data from evidence.

## Priority repaired paths

| Bug | Reproduction and expected result | Evidence to attach |
|---|---|---|
| 017 | In a funnel section's image field, try a PDF via file selection and drag-and-drop. Both must show a format error without an upload POST or changing the image. Upload PNG/JPEG/WebP; valid images must save, reload and render. Separately verify that Files & Delivery still accepts a PDF. Try >4MB in the proxied image picker; its stated limit and error must agree. | Recording, upload network results, saved/reloaded image |
| 024 | Edit form name, field label and settings. Observe saving then autosave confirmation. Reload and verify values. Make rapid edits; success must wait for every write. Simulate a denied/failed write in the QA environment; the editor must not say all changes were saved. Reload, inspect persisted values, reapply changes and verify recovery. Offline may remain pending rather than reject; do not confuse queued writes with confirmed persistence. | Recording, failed and successful write results, post-reload values |
| 014 | Scan the QA business's own website, then open Brand & Assets in the same workspace. Check website URL and captured visual personality/photography/composition against the returned discovery data; verify readable multi-value fields. Do not require fields the scan did not extract. Follow review navigation and report exactly where it fails if it still fails. | Scan result, destination URL, workspace ID, review-page screenshot |
| 021 | Enter a unique Thank-You headline/message, save successfully, reload editor, publish as required, then load the public Thank-You URL in a fresh session. Both must show the new value. In a disposable fixture with a stale next-page link, clear that link and save/publish; it must not reject based on the old link. Try a foreign-workspace target; it must reject without writing. | PATCH payload/status/error, editor after reload, live page, tenant fixture IDs |
| 028 | Reuse a form with a deliberately stale redirect on an approved QA funnel. Submit via inline and popup CTA; the funnel's configured Thank-You/next-step route must win. Repeat at least 20 times with authorized test recipients, spaced to respect rate limits. Verify each successful capture reaches its intended route. Standalone forms must still honor their own configured redirect. A failed submission must stay on the form with an error. | Per-attempt status/URL table, screenshot, submission/contact/workflow IDs |

BUG-021's latest note says “no back button”, while its original acceptance concerns persistence. Record those as separate findings; a missing back button is not evidence that a successful save was lost. Obtain the latest recording/context before assigning a root cause to the original failure.

## Full workflow certification

1. Select the intended workspace. Verify its business name, profile, funnel/form list and authorized role. A website scan does not itself create a separate customer workspace.
2. Edit the funnel and its selected form. Save, reload, and compare all edited values. Preview must preserve context and must not create leads.
3. Publish the QA funnel. Record the successful response and deployed candidate commit. Verify the public page in a fresh browser session.
4. Submit the lead form using the authorized recipient and a unique run marker. Confirm the intended Thank-You route and message.
5. Verify the submission and CRM contact belong to the intended workspace. Record actual deduplication behavior for repeated submissions; do not assume one contact per submission.
6. Verify the configured workflow actually ran, and check the expected email/SMS/action and delivery link. A successful browser redirect is not evidence of delivery.
7. Repeat across inline/popup submissions, a fresh browser context, and error/retry cases. Record rate-limit responses separately from successful submissions and recovery.
8. With two genuinely restricted users, attempt to view/update the other workspace's funnel/form/profile and submit a foreign next-page target. All protected operations must deny access and preserve both tenants' data. Agency owners are not valid negative-access actors.

## Remaining acceptance/provisioning items

| Bug | Required resolution before closure |
|---|---|
| 001 | Retest new-user wayfinding with and without recommendations. Existing quick-start links should be visible. If a guided tour is required, supply the approved tutorial requirement; do not pass it based solely on link presence. |
| 023 | Verify that an account with exactly one authorized workspace sees the availability explanation in desktop/mobile navigation; zero must not claim one, and multiple must retain switching. Owner confirms whether Hunter should be a separately provisioned workspace and which QA user should access it. Verify actual memberships and canonical profile mapping. A single eligible workspace intentionally has no switch control; do not create a guessed mapping or grant access to make the test pass. |
| 018 | Product owner confirms whether granular within-section/freeform dragging was approved. Current editor supports section reordering. No freeform implementation is in this candidate. |
| 019 | Product owner identifies approved resize/crop/position controls and applicable sections. Current image-text left/right positioning is distinct from a general image editor. No general crop/resize implementation is in this candidate. |
| 014 PDF | Confirm the approved comprehensive audit/PDF-export requirement separately from brand discovery. No new PDF reporting system is in this candidate. |
| 011 | Tracker still says BLOCKER, with “Out of scope – website feature not in use”. Keep that explicit exclusion; this release does not modify Website Factory. |

## Previously passing regression cohort

Retest BUG-002–010, 012–013, 015–016, 020, 022, 025–028 and 030 against their tracker steps. BUG-028 receives the repeated-submission checks above despite its prior PASS. BUG-029 remains CLOSED under QA's operator-supplied-link resolution; smoke-test a real configured delivery link without reopening PDF generation scope.

For each case record: `Bug ID | candidate commit | workspace | role | steps | expected | actual | PASS/FAIL/BLOCKED | evidence URL`. Preserve the original tracker status until the actual candidate has been tested. A local fixture pass is supporting engineering evidence, not a substitute for human retest.

## Release decision

- Engineering checks run on the isolated main-based branch; detailed evidence is in `evidence/2026-10-31/release/` and the stabilization report.
- All new paths must pass their human acceptance steps and the authenticated workflow before production certification is granted.
- Any scope-excluded or blocked item must remain explicit in the sign-off. Do not mark the entire tracker resolved because the five repaired paths pass.
- Deployment requires approval of the concrete candidate, destination and test-target configuration. Rollback should restore the prior reviewed deployment artifact; this candidate includes no database/schema migration.
