# Development lock: Ascend + Flow

**Status: LOCKED**
**Date: 2026-09-28** (reopened once the same day, see *Reopening 1*)
**Certified by: automated verification against production. No step here is human-verified.**

Deployed and verified commits:

| Repo | Service | Host(s) | Commit |
|---|---|---|---|
| DivineX-Business-Intelligence | divinex-business-intelligence | ascend.divinex.io | `f6a4286` |
| DivineXLeadStack | ascend-crm-x2j3 | crm.divinex.io, app.divinex.io | `7c089dd` |

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


## Reopening 2: booking notifications (2026-09-29)

**Why.** A customer-reported production incident, which is an explicit
reopen condition. A real prospect booked a call: the operator received no
notification, it was unclear whether the attendee received anything, and the
attendee could not reschedule or cancel.

**Three separate causes, all in code, none needing production data to prove.**

1. **The operator was never told.** The booking route notified the attendee,
   wrote the activity row, fired the automation trigger and emitted the
   webhook, and told the person whose calendar it lands on nothing. The only
   path that reached them was web push, which needs VAPID keys, a subscribed
   device, and on iPhone a home-screen install. Miss any one and a real
   booking arrives in silence. There is now an operator email on every
   booking, to the assigned host on a team page and otherwise the admins,
   carrying the attendee's details with Reply-To set to the attendee.

2. **The reschedule link could be empty.** `buildEventPublicUrl` returned ""
   whenever `NEXT_PUBLIC_APP_URL` was unset, and the confirmation email then
   rendered no "manage your booking" link at all. It now takes the origin of
   the request the booking was made on, so the link does not depend on env
   config and keeps the attendee on the host they booked with, which matters
   because this deployment answers on two.

3. **Failures were silent.** A failed confirmation send was a `console.warn`
   and the booking succeeded anyway, so nobody learned the customer got
   nothing. It is now an error, and the operator's email states plainly when
   the attendee was NOT reached. Reminders skipping for unconfigured QStash
   is an error too.

**Not a defect: Google Calendar.** Nothing writes to Google Calendar and
nothing ever did. The mechanisms are the ICS attachment on the confirmation
email and the subscribable feed under Settings, and Google polls a
subscribed feed on its own slow schedule.

**Could not verify against production data at the time.** I believed the
local `.env.local` pointed at a different Firebase project than production,
because a lookup of the reported sub-account returned nothing.

**That conclusion was WRONG, corrected 2026-09-30.** The id had been
transcribed from a screenshot with one character misread (`MEYB8CbWIE...`
for `MEYB8CbWlE...`, capital i for lowercase L). Local `.env.local`,
`.firebaserc` and the production client bundle all carry the same project,
`ascend-crm-jvm`, and the credentials read production fine. The booking
fixes below still stand on their own, but the stated reason for not
confirming the specific event does not.

**Still to confirm operator-side:** if reschedule remains blocked, check the
booking page is `published` rather than `draft`. A draft page deliberately
refuses reschedules.

**Verification.** 15 checks in `verify-booking-notifications`, seven
mutations, seven caught. The recipient checks initially restated the
selection rule rather than calling it, so the rule was extracted to a pure
function and the tests now exercise the real one. Build, typecheck and lint
clean. `verify-host-branding` had asserted Flow branding on the six routes
Reopening 1 retired; that suite had been run BEFORE that push and so passed
against the old production. Its route list now covers only what Flow serves
and the retired six are asserted as redirects. It passes with zero failures.


## Reopening 3: attendee cancellation (2026-09-29)

**Why.** Customer-reported production bug after Reopening 2's fixes: booking,
both emails, the manage link and rescheduling all worked, but cancelling
returned "Couldn't cancel." every time.

**Root cause, and it was not in the cancel route.** Nothing in that route ever
ran. `/api/events/{token}/cancel` was never a public path, so middleware
307'd the logged-out attendee to `/login`, the browser got HTML, `res.json()`
threw, and the UI fell back to its own message because there was no server
error to display.

**Reschedule was broken identically.** It only appeared to work because it
was tested in a browser already holding an operator session cookie. The
attendee is a member of nothing and never has one. Fixing cancel alone would
have left the real customer path half-broken, so one regex covers both.

The middleware comment above `"/e"` had claimed both endpoints were public
since they were written. Only the page ever was.

**Fix.** One anchored pattern in `PUBLIC_PATH_PATTERNS`:
`/^\/api\/events\/[^/]+\/(?:cancel|reschedule)$/`. Deliberately not an
`"/api/events"` prefix, which would also publish the authenticated
list/create route and every `/api/events/by-id/*` operator action. Security
is unchanged: the HMAC token is the credential and the route still verifies
it against the stored `publicTokenHash`.

**Verified in production at `baa5ceb`:** cancel and reschedule now reach
their route and answer `{"error":"Invalid link"}` as JSON for a bad token,
while `/api/events`, `by-id/*/mark-paid`, `by-id/*/assign` and
`by-id/*/mark-status` all still 307 to `/login`.

**Follow-on (`7c089dd`): a cancelled meeting was still drawn as a meeting.**
Cancelling worked end to end, but `calendar-view.tsx` had no concept of event
status: a cancelled booking rendered with the same pill, dot and weight as a
live one and was counted in the month header, so it read as "still on the
booking page even after refreshing". Nothing was stale; the calendar was
drawing it faithfully and identically. It is now dimmed and struck through
with the header reading "N events, 1 cancelled", and kept on the grid rather
than hidden so the history stays visible. The check moved to
`isCancelledEvent` beside `eventStatus` and `eventOccupiesSlot` so counting,
drawing and slot-freeing all ask the same question. The public availability
route already skipped cancelled events, so the slot was genuinely rebookable
throughout.

**Coverage.** `verify-booking-cancel`, 29 checks against the real
`isPublicPath`, the real token functions and the real state model. Four
mutations, four caught, including the two dangerous ones (over-broad prefix,
unanchored pattern).


## Reopening 4: plan seats + task assignment (2026-09-30)

Approved pre-lock work. Seat capacity on the existing `PlanLimits` system
(`maxMembers`, null = unlimited) and one optional assignee per task.

**Production Firebase project is `ascend-crm-jvm`**, proven four ways: the
live client bundle served from crm.divinex.io, `.env.local`, `.firebaserc`,
and `firebase projects:list`. An earlier note in Reopening 2 claiming local
credentials pointed elsewhere was wrong and has been corrected in place.

**Firestore rules deployed** to `ascend-crm-jvm` on 2026-09-30, rules only
(no indexes, hosting, functions or storage). Verified by reading the LIVE
released ruleset back from the Firebase Rules API rather than trusting CLI
output: `assigneeAllowed` present, enforced on task create and update,
active-status requirement intact, three occurrences.

**Plan limits configured**, prices and Stripe ids untouched:

| Plan | Product | maxMembers |
|---|---|---|
| Solo | flow, unified | 1 |
| Team | flow, unified | 5 |
| Agency | flow, unified | unset = unlimited |

Written through `normalizePlanLimits`, the same function the plan admin
route uses, so the values are indistinguishable from ones set in the UI.

**Grandfather audit, now possible:** 49 workspaces, 2 carry a member cap,
both exactly at it, **none over it**. No existing customer is affected.

**Still not proven:** `verify-task-assignment-rules.mts` (19 emulator checks
incl. cross-tenant) has never executed, because this machine has no JRE. The
deployed rules are verified by content, not by behaviour. Tasks responsive QA
is also outstanding: the page is auth-gated and signing into production as
the owner to screenshot it is not something to do unasked.

## Reopening 4: founding pricing and unbounded variable cost (2026-09-30)

**Why.** Approved roadmap work: put the founding prices in front of customers,
and finish bounding the costs DivineX pays per use before selling harder.

### The $297 collision

Flow's Team plan and ASCEND's Team tier both cost $297/month. Anything that
decided what a customer bought by reading the amount would hand Flow
customers ASCEND entitlements and the reverse. Both sides already routed on
metadata, but the Flow half proved it only by reading the code: the routing
was an inline if-chain inside the webhook handler.

It is now `classifyCheckoutSession`, a pure function the webhook sits on top
of, so the invariant is exercised rather than asserted. `verify-price-collision`
(29 checks) feeds two sessions with a deliberately identical $297 through the
real classifier and the real limit check and shows they reach different
handlers with different allowances. Four mutations, all caught, three of them
behaviourally: identity reduced to amount-only, the plan id dropped from the
route, the ASCEND route folded into Flow's, and the plan document looked up
by price.

ASCEND grants entitlements from `metadata.product`; Flow resolves the plan
from `metadata.planId`. Neither consults an amount anywhere.

### Founding pricing

| Tier | Charged | Standard | State |
|---|---|---|---|
| Ascend Solo | $127 | $197 | **Done in code.** Billed by the intelligence service from `PRODUCTS.growth_system.defaultAmount`; no Stripe Price is pinned for it, so it moves on deploy. |
| Ascend Team | $397 | $297 target | **Owner action.** Needs a new Stripe Price. |
| Ascend Agency | $797 | $597 target | **Owner action.** Needs a new Stripe Price. |

A plan now records `standardPriceMonthlyCents` beside the price it charges,
and `describeFoundingRate` is the only thing allowed to turn that into a
discount. It refuses a missing rate, a non-numeric one, one at or below what
we charge, and one so close it rounds to nothing. The value is display only
and never reaches Stripe; `verify-founding-pricing` (37 checks) re-reads every
`prices.create` call to keep it that way, and compares this repo's advertised
number against the intelligence service's own product definition and against
`render.yaml`, to confirm no env-pinned Price has quietly taken over from the
code amount.

Team and Agency move through **Agency to Client billing, edit the plan, set
the monthly price and the standard rate, save**. One save does both: the
service validates the standard rate against the price arriving in the same
request, not the stale one. The price change mints a new Stripe Price and
deactivates the old; existing subscribers keep the price they signed up at.
It has to be done there because only production holds the live Stripe key.

### The Flow ladder had no cost ceilings at all

Flow Solo, Team and Agency carried no `maxAiSpendPerMonth`, no
`maxVoiceMinutesPerMonth` and no `maxSharedSmsPerMonth`, and an absent ceiling
reads as unlimited. A $99 customer could run up model spend, Vapi minutes and
SMS on our own Twilio without any bound. The earlier guardrail work applied
those dimensions to the Ascend tiers only.

Nothing caught it because `verify-plan-limits-per-workspace` was keyed on
price and skipped any plan it did not recognise, so it checked five fields on
some plans and nothing at all on others. It is now keyed by plan document,
which also means a founding-price change cannot silently unmatch every
expectation, and it asserts that every plan on sale appears in the table and
bounds all four metered costs. Grandfathered plans are named rather than
skipped by absence.

Applied to production (limits only, prices and Stripe ids untouched):

| Plan | scans | AI spend | voice min | shared SMS |
|---|---|---|---|---|
| Flow Solo $99 | 0 | $6 | 100 | 400 |
| Flow Team $297 | 0 | $20 | 300 | 1,000 |
| Flow Agency $697 | 0 | $50 | 750 | 1,500 |
| Ascend Solo | 10 | $15 | 200 | 500 |
| Ascend Team | 100 | $40 | 600 | 1,500 |
| Ascend Agency | 250 | $90 | 1,500 | 4,000 |

The Flow numbers are derived, not picked: the approved Ascend Solo tier spends
at most about 22% of its price on variable cost, and the same ratio is applied
to each Flow price, weighted toward voice because Flow is execution rather
than intelligence. Worth revisiting against real usage.

### Zero was not a number a plan could hold

`normalizePlanLimits` required `> 0`, so an explicit 0 was written as null,
and null means unlimited. A plan authored to include none of something was
stored as including an unbounded amount of it. That is why Flow could not
simply be given a zero scan ceiling.

The rule is now per-key, and the two halves fail in opposite directions on
purpose. Metered dimensions fail CLOSED on cost: zero is a real ceiling, a
negative clamps to it, neither becomes unlimited. The two capacity dimensions,
`maxMembers` and `maxSubAccounts`, fail OPEN on access: zero and negatives
read as unset, because `maxMembers: 0` would lock every person out of a
workspace they are paying for, owner included. `verify-plan-seats` caught the
first attempt, which collapsed both into one rule.

Both directions are asserted. Treating capacity as metered fails four checks;
treating metered as capacity fails nine.

A customer who hits a zero now reads "Growth Scans aren't included in your
plan" instead of "you've used all 0 Growth Scans (0 of 0)".

### The last screen before a card named the wrong price

Found while checking the three Ascend CTAs actually resolve. Ascend's
`StartTrialPage` serves two routes from one component: `/start-trial` sells
Zeno at $77 and `/start-ascend` sells Ascend Solo. Its "card required, $77/mo
after 14 days" line was hardcoded in both places it appears, so a Solo buyer
read $77 on the screen where they enter a card and was charged the
`growth_system` amount. It predates the founding price and was wrong at $197
too.

The copy is derived from the resolved product now, using the same resolution
the checkout effect already uses. The amounts are mirrored in
`publicCheckoutProducts.ts` (the frontend cannot import server code) and
pinned by `publicCheckoutProductsMirror.test.ts` against `PRODUCTS`,
`TRIAL_DAYS_BY_PRODUCT` and `GROWTH_SYSTEM_STANDARD_AMOUNT`. Moving either
side alone fails the build; so does hardcoding a price back into the page.

Five existing tests broke on the price move, which is them working. They
assert the new contract now, including the crossed-out standard rate, which
needed pinning for the same reason the charged amount does.

### Verified

- Trial contract, both checkout paths: `mode: subscription`, card collected at
  Stripe's default for subscription mode, `trial_period_days: 14`,
  `missing_payment_method: "cancel"`, converting to the founding price.
- Rendered output at 1440 / 390 / 375 / 360 on `/pricing` and `/start`, against
  the unified host resolved to the local server. No horizontal overflow at any
  width; the founding line wraps to two lines and stays legible.
- `verify-em-dash` caught three em dashes I had written into customer copy.
  Run it after writing copy, not after removing it.

### NOT verified, carried forward

- **Stripe charges $127.** The local Stripe key is TEST mode and production is
  LIVE, so no production Checkout Session was created. The code path is
  verified; the actual charge is not. Two-minute owner check: open
  app.divinex.io/pricing, Start free trial, confirm Stripe shows $0 today and
  $127/month after the trial.
- **Team and Agency prices.** Still $397 and $797. See the table above.
- `verify-task-assignment-rules.mts` still has never executed: no JRE on this
  machine. Unchanged from Reopening 3.
- Three suites fail for environmental reasons and failed identically before
  this work: `divinex-unification` and `workspace-identity-coherence` need the
  Neon endpoint, which is disabled, and `plan-survives-edit` needs a staging
  fixture that does not exist.

## Reopening rules

Active Ascend AND Flow development is locked. Development reopens only for:

1. a production incident
2. a customer-reported bug
3. a security issue
4. a payment or provisioning failure
5. measured customer behaviour showing a real problem
6. deliberately approved roadmap work

The next source of truth is real customer behaviour.
