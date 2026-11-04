# Live verification of the 08f68f3 release — 2026-11-04

Verified against the **deployed** build on both hosts (`crm.divinex.io`,
`app.divinex.io`, both reporting `08f68f3` / `main` / `ascend-crm-x2j3`), not
against source. Source-structural passes are recorded separately because this
session had already produced two cases today where reading the diff was wrong.

## Result

| Bug | Claim | Verdict |
|---|---|---|
| 001 | Home wayfinding links render unconditionally | **PASS (live)** — all four in the MAIN region, coexisting with a live CRO recommendation, which was the exact retest-FAIL condition. All four destinations resolve 200. |
| 002 | Zeno can scan the workspace's own website | **PASS (live)** — `/api/ai-suite/chat` returns `type=proposal`, `capability=scan_business_website`. Confirm-gated, so nothing crawled. |
| 003 | "Continue with Zeno" uses the canonical form | **FAIL (live) → fixed, awaiting deploy.** See below. |
| 004 | Chat history survives "New chat" | **PASS (live)** — sent a uniquely marked message, started a new chat, reopened history, the prior conversation was still listed by its marker. |
| 008 | Attaching a lead magnet fills blank thank-you copy | **PASS (live)** — headline/message/SEO all filled from the humanized filename plus the funnel name; nothing auto-saved; operator told it is editable. |
| 009 | A lead magnet can be detached | **PASS (live)** — remove control present, field cleared server-side, and removal did **not** cascade into deleting the stored file (documented behaviour). |
| 010 | Asset Studio deliverables export as PDF | **PASS (live)** — 3/3 assets returned real `%PDF-` bytes (24–26KB) at `application/pdf`; a bogus asset id returns 404 rather than a PDF. |
| 011 | Testimonials remediation | **not tested** — tracker excludes it ("website feature not in use"). Untouched. |
| 012 | Funnel Orders back-arrow | **PASS (live)** — Orders loads, the back-arrow resolves and lands on the funnels list, not "Page not found". Ascend-side `/create` target resolves 200. |
| 013 | Hydration sweep | **PASS (live)** — 14/14 pages clean across both hosts, console errors included. |

## BUG-003 — the one real defect found

`/zeno` is an Ascend path. The funnels list renders in **both** shells, and on
`crm.divinex.io` a bare `/zeno` is not Zeno at all: it falls through to the
legacy stub that redirects to the caller's **first** membership.

Measured before the fix: clicking "Continue with Zeno" from
`/sa/73BcuAKXx5mWSDQYVdj1/funnels` landed on
`/sa/MEYB8CbWlE5fxAn3TJOp/dashboard` — a **different workspace** — with
`?funnel=` dropped.

`verify-funnels-navigation` assertion 12a required the literal
`/zeno?funnel=${f.id}`, so it passed for as long as the link was broken for
every Flow user. It now asserts the behaviour by executing the resolver.

`EXACT_MAP["/ai-suite"]` was also stale at `"/scale"`, which is now a bare
redirect to `/intelligence` — so any Flow Zeno link resolved into the Ascend
shell landed on Intelligence. Nothing else called `saPath("/ai-suite")`.

Fix committed as **`24941c3`**, a clean fast-forward on `08f68f3`.
`tsc` and `eslint` clean; `verify-zeno-link-shell-aware.mts` 12 checks + 3
mutation proofs; 13 related suites re-run green. **Not deployed** — the push
to `main` was refused as a production deploy and needs the owner.

## Harness defects found by mutation-testing the harness

Both of these would have produced a confident, wrong report.

- The wide hydration check's not-found detection matched Next's default
  "This page could not be found". This app ships its own "Page not found" at
  HTTP 404, so the check was dead code: a mutation pointing at a bogus route
  **passed**. Now keyed on status plus the real string, and the mutation fails
  as it should.
- `innerText` returns CSS-uppercased text, so a case-sensitive match for
  "Quick start" reported BUG-001 as failing while it worked. The same run also
  matched the sidebar's own "Ask Zeno", which would have been a false pass had
  the card genuinely been missing. Now case-insensitive and scoped to `main`.

## Pre-existing failures, not caused by this work

Confirmed failing at `08f68f3` with all changes stashed:

| Suite | Cause |
|---|---|
| `verify-shell-render` | needs a dev server on `:3114` (ECONNREFUSED) |
| `verify-unified-navigation` | expects JSON, receives an HTML page |
| `verify-shell-safety` | refuses to run, negative fixture missing |
| `verify-shell-composition` | exits non-zero, no assertion reported |
| `verify-shell-decisions` | **stale against the current nav IA** — looks for a `crm` section id, but the registry is home/create/leads/agents/performance/intelligence/settings, and its fixtures predate `agents` so the "all sections unlocked" assertion also fails. A `!` assertion turns the miss into a TypeError. |

`verify-shell-decisions` is worth fixing on its own: while it fails, nobody can
tell whether navigation gating has regressed. Left alone here because Priority 2
is expected to change that IA.

## Test residue

None. The 008/009 subject funnel is back to draft with no lead magnet and no
saved thank-you copy; the uploaded asset was removed through
`deleteFunnelAsset()`; the BUG-004 probe conversation was deleted.

## Deployment-config findings from `/api/agency/health` (live, owner-side)

Not code. Both would be easy to misreport as product defects.

- **Twilio is erroring, not merely unconfigured.** `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` are all present, but the live
  credential check returns **`Twilio /Accounts returned 401`**. The shared-sender
  SMS path and the Speed-to-Lead SMS step both run on these, so agency-level SMS
  is down until the token is rotated. Sub-accounts with their own dedicated
  Twilio credentials are a separate path and are not covered by this check.
- **`FIRECRAWL_API_KEY` is still absent**, so BUG-037 remains blocked exactly as
  the tracker says. Nothing else depends on it; "Refresh KB" is the only caller.

Also reported missing, consistent with those features being off: `meta`,
`vapi`, `mapbox`.
