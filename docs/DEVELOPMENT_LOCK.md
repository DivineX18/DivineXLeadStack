# Development lock: Ascend + Flow

**Status: LOCKED**
**Date: 2026-09-28** (reopened once the same day, see *Reopening 1*)
**Certified by: automated verification against production. No step here is human-verified.**

Deployed and verified commits:

| Repo | Service | Host(s) | Commit |
|---|---|---|---|
| DivineX-Business-Intelligence | divinex-business-intelligence | ascend.divinex.io | `f6a4286` |
| DivineXLeadStack | ascend-crm-x2j3 | crm.divinex.io, app.divinex.io | `c4bc6d9` |

Both verified by reading `/api/version` on the live host, not by trusting a
green deploy.

## What was certified

### Growth Scan (the acquisition path)

Four fresh production scans through the deployed engine, on four materially
different businesses. Tokens are recorded so the evidence can be re-read:

| Business | Type | Score | Seconds | Token |
|---|---|---|---|---|
| Basecamp | SaaS, self-serve trial | 69 | 91 | `462295b8` |
| Stripe Press | Ecommerce, books | 63 | 92 | `eddcbdc9` |
| Roto-Rooter | Local service | 70 | 118 | `e8387aa0` |
| I Will Teach You To Be Rich | Coaching | 67 | 108 | `d0cc5269` |

Closed in this pass:

- **Grammar corruption.** The integrity rewriter substituted a phrase written
  for the object of an instruction into any position the noun appeared,
  including the subject of a finding. Three of four reports carried word
  salad ("A any guarantee or risk reversal you actually offer is present").
  Now zero.
- **"Revenue Leak".** An unsupported revenue-loss claim, six occurrences
  across four reports. Now zero.
- **Lead-magnet format.** Was "Free Guide" on 4 of 4, including a business
  whose own quiz the scan had already detected. Now Demo / Assessment /
  Calculator / Download, chosen per business.
- **Recommended CTA.** The report UI had rendered a "Recommended CTA" row
  since before this work and the engine had never populated it, so it had
  never once appeared. Now present on all four and specific to each.
- **Mobile.** Every report scrolled sideways (scrollWidth 460 against a 390
  viewport) and the only conversion button on the free report hung off the
  edge. Now scrollWidth equals viewport at 1440, 390, 375, 360 and 320.
- **Domain input.** `basecamp.com` was rejected in production. Bare domains
  and `WWW.UPPERCASE.COM` now normalise; `javascript:`, `data:`, `file:`,
  `mailto:` and `ftp:` are refused (they previously passed `z.string().url()`,
  which accepts every URI scheme).
- **Timing.** No page now promises 60 or 90 seconds. Measured 91-118s against
  copy reading "in just a few minutes".

### Flow public identity

Flow and Ascend are one Next app on two hosts, and `brandForProduct` swapped
only the product NAME. Flow's own copy was the other product's story:
"The Growth Operating System", "One intelligent platform to amplify your
message", "Run your business. Amplify your impact."

Flow now leads with what happens to an enquiry after it arrives. The shared
lifecycle heading ended on Ascend's verb ("to understood") and on the Flow
surface now ends on the close. `/features` and `/pricing` ask a different
question per surface in their title, description, h1 and lede.

Ascend was verified byte-unchanged on every page touched.

Measured sentence overlap against the Ascend surface, before -> after:

| Page | Before | After |
|---|---|---|
| Homepage | 54% | 50% |
| Features | 90% | 84% |
| Pricing | 78% | 75% |
| Industries hub | 82% | 79% |

Industry DETAIL pages were already differentiated and were not touched:
Flow targets "CRM for X", Ascend targets "X: Zeno Growth Diagnosis", with
distinct h1s, descriptions and self-referential canonicals.

SEO on crm.divinex.io: 9 unique titles, 9 unique descriptions, 9/9
self-canonical, none canonicalising to app.divinex.io.

Responsive QA: 24 of 24 page/width combinations clean at 1440/390/375/360,
no overflow, no leaked Ascend copy, no placeholders, zero console errors.

## Known, non-blocking

- **Body duplication remains** on `/features` (84%), `/pricing` (75%) and the
  industries hub (79%) versus app.divinex.io. The framing now differs per
  surface; the feature cards and comparison table do not, because they
  describe the same shipped software and Ascend genuinely contains Flow's
  execution layer. Forking ~45 feature descriptions per surface is a content
  project, not a pre-lock edit. Both hosts are indexable and self-canonical,
  so this is a ranking-quality risk between two owned domains, not a broken
  acquisition path.
- **One residual integrity rewrite** on the Stripe Press report: "Reviews,
  any guarantee or risk reversal you actually offer, and client logos are
  present on the site." Grammatical, wordy, in a comma list. Not the word
  salad class that was fixed.
- **Stripe Press lead magnet** targets authors wanting to publish rather than
  readers buying books. Format is right, audience is arguable.
- **Report header CTA is 36px tall**, below the 44px tap-target guideline.
  Pre-existing, fully visible at every width, not a regression.
- **12b** crm.divinex.io Growth Scanner body reads "Flow" while its title
  reads "Ascend". Host-aware branding is intentional; the title is not
  host-aware.
- **12c** `growth_scan_started` GTM event did not fire in test. GTM itself is
  present and initialised on both hosts. Owner-side ads conversion wiring.
- **12d** `/funnels` resolves to `/create/funnels`; lifecycle IA sections do
  not match the locked IA. Both pre-existing, baseline-matched.
- **Client-side nav does not update `<title>`.** Direct loads are correct, so
  crawlers are unaffected.

## NOT VERIFIED, carried forward

- **Billing, trial and entitlement regression.** Unchanged from the previous
  certification. There is no safe existing mechanism to rerun it without
  production database or read-only credentials, which were not requested and
  not used. The previous certified baseline stands. No billing code was
  touched in this pass.
- **Staging.** `flow-growth-scan-staging` runs an old commit against a dead
  backend and cannot verify anything. Both deploys here went straight to
  production and were verified there.


## Reopening 1: Flow public-surface consolidation (2026-09-28)

**Why.** Flow and Ascend still read as the same public website. The cause was
structural, not cosmetic: crm.divinex.io and app.divinex.io are ONE Next app
on two hosts and their sitemaps were byte-identical, the same 25 URLs, both
indexable, 72-92% identical copy.

Worth recording because it inverts the premise the work started from. This
was not Flow cloning Ascend. It was one set of CRM-intent pages published
under two brands: Ascend's host served "CRM for Marketing & Creative Agencies
| Ascend" and "Resources | Ascend Guides on CRM, Pipeline & Follow-Up". Those
are Flow's pages wearing Ascend's name. Ascend is the certified flagship and
must not change, so consolidation happened on the Flow side.

**Scope.** Public marketing routes only. No application, billing,
entitlement, provisioning, pricing or Stripe change.

### Final Flow public architecture (9 URLs, was 25)

Kept and indexable: `/`, `/pricing`, `/features`, `/contact`, `/docs/api`,
`/terms`, `/privacy`, `/refund-policy`, `/responsible-ai`.

### Retired on Flow, 308 to the same path on Ascend

`/about`, `/faq`, `/implementation`, `/platform`, `/industries` (+5 industry
pages), `/resources` (+5 posts). Sixteen URLs. Each verified in production:
one hop, slug preserved, destination 200. All still serve unchanged on
Ascend.

Nothing was noindexed and nothing was deleted. A redirect to a live
equivalent was preferable to a noindexed duplicate that still has to be
maintained, and no route file was removed because Ascend still renders every
one of them.

### How

A per-page guard using the existing `resolveProductSurface`, not a host
string in `next.config` and not a branch in middleware: the auth path is not
where marketing logic belongs, and a hardcoded hostname is wrong the first
time a host changes. With no configured Ascend origin nothing redirects, so a
single-surface deployment behaves exactly as before.

The navbar and footer `product` prop is REQUIRED rather than defaulted. A
default silently gives one surface the other's navigation wherever a call
site forgets it; making it required turned that into 24 compiler errors,
which is how every call site was found.

### Verification

- Flow sitemap 25 -> 9, zero retired entries. Ascend unchanged at 25.
- Nine kept routes 200; nine retired routes 308 -> 200 in one hop.
- Zero orphan links from Flow's kept pages into retired routes. This needed
  three separate fixes: desktop nav, the mobile sheet, and the `/faq` link
  inside the shared FAQ section.
- Canonicals: all nine Flow pages self-canonical, none pointing at Ascend.
- **Ascend byte-compared against live production across 13 pages: 12
  word-identical, the 13th differing only by today's date inside JSON-LD.**
- Auth and application routes untouched; protected deep links still 307 to
  login carrying their redirect. `/buy` and `/thank-you` 404 exactly as they
  did in production before this change.
- Visual QA 16/16 clean at 1440/390/375/360: no overflow, no orphan links, no
  broken images, no stray Ascend copy, zero console errors.
- Regression matched baseline exactly: ia-consistency 1, funnels-navigation
  2, landing-page-quality 2, all pre-existing. Build, typecheck, lint clean.

### Known, non-blocking

- `/features` and `/pricing` still exist on both hosts and still share their
  feature cards and comparison table. They now ask a different question per
  surface in title, description, h1 and lede, but the underlying cards
  describe the same shipped software. This is the deliberate stopping point:
  Ascend genuinely contains Flow's execution layer, and forking ~45 feature
  descriptions is a content project, not a consolidation edit.
- Flow's `/features` title is still templated as "CRM, Pipeline & AI Agent
  Tools" on both surfaces. Changing Ascend's copy was out of scope.

## Reopening rules

Active Ascend AND Flow development is locked. Development reopens only for:

1. a production incident
2. a customer-reported bug
3. a security issue
4. a payment or provisioning failure
5. measured customer behaviour showing a real problem
6. deliberately approved roadmap work

The next source of truth is real customer behaviour.
