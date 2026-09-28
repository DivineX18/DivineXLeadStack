# Development lock: Ascend + Flow

**Status: LOCKED**
**Date: 2026-09-28**
**Certified by: automated verification against production. No step here is human-verified.**

Deployed and verified commits:

| Repo | Service | Host(s) | Commit |
|---|---|---|---|
| DivineX-Business-Intelligence | divinex-business-intelligence | ascend.divinex.io | `f6a4286` |
| DivineXLeadStack | ascend-crm-x2j3 | crm.divinex.io, app.divinex.io | `71d3911` |

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

## Reopening rules

Active Ascend development is locked. Development reopens only for:

1. a production incident
2. a customer-reported bug
3. a security issue
4. a payment or provisioning failure
5. measured customer behaviour showing a real problem
6. deliberately approved roadmap work

The next source of truth is real customer behaviour.
