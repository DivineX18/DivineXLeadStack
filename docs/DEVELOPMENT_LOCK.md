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
- **Full regression, all 169 verify suites, zero regressions.** 63 fail; all
  63 were baselined at the pre-session commit in a detached worktree and 62
  fail identically without this work. They need the Neon endpoint (disabled),
  live model calls, or staging fixtures that do not exist.

  The one suite that differed, `verify-unified-navigation`, is a flake and not
  a regression: it drives `flow-growth-scan-staging.onrender.com` over the
  network rather than any local code, and passes on three consecutive re-runs
  with these changes in place. Worth knowing before anyone spends time on it
  again.

## Certification: founding pricing, closed 2026-09-30

Deployed and read back from production. Flow `f4456e5` on crm.divinex.io and
app.divinex.io; BI `ff1a325` on ascend.divinex.io.

| Product | Plan | Charged | Standard | Live Stripe Price |
|---|---|---|---|---|
| unified | Solo | $127 | $197 | code-served (`growth_system`, no pinned Price) |
| unified | Team | $297 | $397 | `price_1ULWNgLkc8XR0w4Gi3SeTvuM` |
| unified | Agency | $597 | $797 | `price_1ULWVhLkc8XR0w4GPNqzknel` |
| flow | Solo | $99 | none | unchanged |
| flow | Team | $297 | none | unchanged |
| flow | Agency | $697 | none | unchanged |

Team and Agency were repriced by the owner through Agency to Client billing,
which minted new live Prices and deactivated the old ones. Zeno is unchanged
at $77. Public surfaces read back correct: 36%, 25% and 25% off with the
price-held commitment on app.divinex.io, no founding wording on Flow.

**Two owner-entry errors were caught by read-back, not by assumption.** Agency
first landed at $697, which both collided with Flow Agency and advertised 13%
off; then its standard rate landed at $697 against a $597 price, advertising
14%. The second was caused by an ambiguous instruction of mine that corrected
itself mid-sentence. Read the numbers back every time; do not accept "done" as
evidence.

Only one shared price point remains, $297 between Flow Team and ASCEND Team,
and it passes every identity check: distinct plan documents, Stripe Prices,
Stripe Products and surfaces, with `ascendIntelligenceEnabledByAgency` and
Growth Scans on the unified side only. Identity never derives from amount.

**No existing subscription was touched, and none could have been:** 50
sub-accounts, 3 billing records, all `pending`, zero with a live Stripe
subscription. The newest `billingEvents` predate this work.

All six sellable plans remain bound on AI spend, voice minutes, shared SMS and
email. Seven suites pass against live data.

**Not verified, and deliberately not blocking:** no live Stripe Checkout
Session was created, since that needs the production live key and an owner
browser. The trial mechanism was already production-working before this
pricing change. The 30-day AI-cost aggregate was not retrieved; it needs the
owner's authenticated admin session. The route itself is verified: in deployed
`ff1a325` the literal `/admin/usage/ai-cost` registers before
`/admin/usage/:targetClerkUserId`.

**Development is locked. The next work is customer acquisition.**

## Reopening 5: generated deliverable integrity (2026-10-01)

Reopened for one scoped exception before customer outreach, because the
acquisition path puts a prospect in front of a live generation. Pricing,
billing, entitlements and cost guardrails stayed locked and were not touched.

### What was wrong, and what fixed it

**A website that invents facts is no longer a finished deliverable.**
gitpage's template fabricates testimonials, statistics and program details,
and it is a third-party generator we cannot configure. The audit used to
decorate a `ready` site with a warning banner, which makes the warning
optional, and optional is not a safety mechanism when the reader is a trial
customer about to copy the link. The audit now DECIDES the status: flagged
builds land in `needs_review` with the specific claims listed, the work and
preview URL kept for correction, and no success treatment anywhere including
in what Zeno says. An unverifiable page is re-polled once, then held. Found
while wiring it: the manual "Re-check now" button never audited at all and
set `ready` directly.

**"Everything you'll learn" shipped above a roof inspection, a dog groom and
a CFO review.** The first fix was in the wrong place and is worth recording:
lib/ held no template source, so the model looked responsible, and a
genre-aware rule went into the model-written path. It passed 38 checks and
changed nothing on screen, because `AgendaSection` HARDCODED the heading and
that one component renders both a webinar's agenda and a booking's process.
Only re-rendering and reading the headings caught it. The heading now follows
the stage role; teaching genres keep it, because there the promise is true.

**The canonical business profile was injected inside the `create_funnel`
branch**, so Zeno knew whose business it was only when that tool was in
scope. This did NOT cause the symptom first attributed to it (see below); it
is wrong on its own terms.

### Suite classification, 31 suites

17 ENVIRONMENT (6 pass outright once a render server runs on 3114 and
`FLOW_PROBE_SA` is set; the rest refuse to run with stated reasons, which is
correct design). 5 OBSOLETE TEST, each with a named cause: a regex pinned to
a syntactic shape a `safeValidate` refactor changed (both call sites verified
still grounding), em dashes the dedash pass replaced, a `do NOT`/`Do NOT`
case mismatch, and a byte-identical snapshot against a pre-Slice-8 commit.
1 STALE FIXTURE. 3 REAL and fixed. 3 REAL and not blocking.

**A misdiagnosis worth keeping.** `zeno-live-behavior` B2 was first reported
as the profile nesting bug. It is not. The fixture plants
`businessProfileId: 0` against a workspace mapped to `3`, and the tenant
guard correctly withholds all context rather than risk serving another
company's business. The guard is right; the fixture is stale. Verify the
other branch before naming a root cause.

### Real-output acceptance

Three materially different businesses (local service, a business with no
website at all, B2B professional), each planted as an AUTHORIZED profile,
each asked the way a customer asks. All three completed: grounded reply,
proposal, confirm, funnel created, workflow activated, published through the
real completeness guards, rendered at 1440 and 390, lead captured through the
popup CTA, copy specific enough that it would not survive a name swap. Zero
fabricated testimonials, statistics, founder history, guarantees or
credentials. Zero overflow, zero broken images, zero bracket placeholders.

### Known beta limitations, acceptable and honestly represented

- Zeno sometimes asks one optional setup question (a booking-calendar slug)
  instead of drafting, against its own tool description. Intermittent, 2 of 4
  runs on one business. It offers the correct default and builds next turn.
- Image presence is non-deterministic: the same business and prompt produced
  0, 1 and 2 images across runs. At 0 an honest "Photo needed" placeholder
  renders, which is the designed behavior for a workspace with no assets.
- Critic heading auto-apply stays OFF. Its own control still reproduces the
  false positive that gated it. The deterministic subset is enforced instead.
- The gitpage website path was not exercised locally (stale local key).
  Production gitpage is healthy: `agency=true`, `hasApiKey=true`,
  `lastError=null`.

### Operational findings, not code

- **OpenRouter credit exhaustion took Zeno down for every workspace** during
  this pass (HTTP 402). Small requests still returned 200, so it is not
  obvious from a smoke test. Resolved by the owner. Worth monitoring: this is
  a single point of failure for the entire product promise.
- `subAccounts/MEYB8CbWlE5fxAn3TJOp` holds `businessProfileId: 0` with the
  business name "Portrait Only", leftover fixture data, so Zeno has no
  business context in the DivineX workspace itself. Repair by republishing
  the profile from Ascend. Do NOT correct the id, that would authorize
  fixture content.
- A `divinexProfiles` document literally named `undefined` exists, plus
  `dx-loop-test` and `qa-unify-sub`. Unmapped, so withheld, harmless.

**Development is locked again. The next work is customer outreach.**

## Reopening 6: the connected customer journey (2026-10-01)

Deliverable quality was certified immediately before this. This pass asked
the only question that certification cannot: do the SEAMS hold when a real
prospect travels the whole path. Everything previously certified was carried
forward, not rerun.

### The journey, as outcomes

A business was planted the way a Growth Scan leaves one, including a real
`intelligence.primaryConstraint`, in a workspace whose profile is genuinely
AUTHORIZED. Then: ask what to fix, ask for a build, confirm it, publish it
through the real guards, arrive at the published page as a logged-out
stranger carrying UTM parameters, submit the form, and look at what landed.

**Growth Scan to Zeno holds.** Given only the scan and the profile, Zeno
answered "fix the first visit, specifically, make it concrete. Right now your
site explains the modalities but never tells a nervous first-timer what
actually happens in the room." It reasoned FROM the constraint rather than
reciting it, named the real audience, never asked the customer to restate
their business, and claimed no traffic, conversion or revenue data it was
never given. A scanned business does not become a blank account.

**Zeno to Flow holds.** The build request became a real funnel, correctly NOT
auto-published, grounded in the business, publishing only through the real
completeness guards.

**The lead reaches the CRM with its attribution intact.** utmSource
`facebook`, utmMedium `cpc`, utmCampaign `hobart_back_pain`, utmContent
`vid_a`, landing page and referrer all survived onto the contact, and
`source` resolved to `facebook` rather than a generic default. One contact,
one workspace, no duplicate, no cross-tenant bleed.

**Every workflow node does what the page promised.** Driven directly:
`create_deal=deal_created:new`, `add_tag=tag+:Assessment Booking Requested`,
`send_email=ok`, `notify=ok`, `wait`, `if_else`.

### The defect, and the boundary

A real lead produced a run with `status: "failed"`, an empty history, no
error and no node. The contact existed, the page said thank you, and the
promised opportunity and follow-up never arrived with nothing anywhere
saying why. The customer saw success; the operator saw a dead run.

The CAUSE was environmental: QStash refuses a localhost callback URL, which
production does not have. Recording nothing about it was not. Every failed
run now carries a sentence naming the likely cause and the node it stopped
at; testing that surfaced two further silent paths (workflow deleted
mid-run, contact deleted mid-run). The history of what already ran is never
cleared, since that is the record of the deal and tag that did land.

**The one hop local cannot test is QStash delivery to a public URL, and it
is closed by independent evidence:** the gitpage heartbeat is a
QStash-scheduled callback into production and it landed 24 minutes before
this was written.

### Behaviour worth knowing before a live demo

- Contacts dedupe on PHONE. A repeat submission from the same number updates
  the same person, PRESERVES first-touch attribution rather than overwriting
  it, and appends a second entry to the timeline. All three are correct.
- Zeno occasionally answers a build request with a question instead of a
  proposal. Intermittent, not deterministic, roughly 2 in 5 across this and
  the previous pass. It offers the correct default and builds next turn.
- Asking to revise "that page" when a workspace holds several similarly named
  funnels gets a disambiguation question, including when a draft and a live
  copy share a name. Correct, and worth naming the funnel in a demo.
- Phrasing steers which artifact is built: "book the assessment" produced a
  booking page rather than a funnel on one probe.

### Four harness bugs, recorded because each looked like a product defect

Snake_case attribution when the client emits camelCase; a phone reused
across runs so the second updated the first's contact; a CTA selector that
guessed at wording and missed "Pick a time"; and reading a draft's correct
refusal to render as a render failure. Every one produced a false negative.
Check the product's contract before believing the test.

**Development is locked. The next source of evidence is real customers.**

## Approved pricing exception: ASCEND Agency to $797 (2026-10-01)

**Why.** The ladder had inverted. Flow Agency was $697 and ASCEND Agency
$597, so the cheaper tier included everything the dearer one had PLUS the
intelligence layer, and Flow Team $297 matched ASCEND Team $297 exactly. A
buyer comparing them would correctly conclude the Ascend tier was strictly
better value at or below the Flow price. ASCEND is Flow plus something, so
it should cost more at every tier.

**Changed, once, on explicit instruction:** ASCEND Agency $597 to $797.
Nothing else. Standard Agency stays $797, which means Agency now has NO
founding discount, deliberately.

| | Flow | ASCEND founding | ASCEND standard |
|---|---|---|---|
| Solo | $99 | $127 | $197 |
| Team | $297 | $297 | $397 |
| Agency | $697 | $797 | $797 |

**No fake discount on Agency, and no code was needed for that.**
`describeFoundingRate` already returns null when the standard rate equals or
is absent, so the card renders no strikethrough, no percentage and no
founding line, while Solo keeps 36% off and Team 25%. Verified on the live
page: zero `line-through` elements in the Agency card, two on the page in
total, both belonging to Solo and Team. The write validator also REFUSES a
standard rate equal to the price, so the field had to be cleared in the same
request as the price move. Both went in one PATCH, which is why the service
validates the standard rate against the price arriving in that request
rather than the stored one.

**Identity still never derives from price.** Ascend Agency is plan
`SvnbPxTVu6yWsYIl6tT6` on `prod_VDrAKKiCU5nLh4`; Flow Agency is plan
`ZdA2vnJSayAiquGQdXY6` on `prod_VDrAcTJEdmbMO9`. Distinct documents,
distinct Stripe products. A new Price `price_1ULvvpLkc8XR0w4GdFW87R31` was
minted and the old one deactivated, which is the normal immutable-price
path. Zero subscriptions exist, so nothing was repriced; `billingEvents`
unchanged at 4.

**How it was executed, recorded because it matters.** The production live
Stripe key exists only in the deployed environment, so this was done by
minting a Firebase custom token for the agency owner and calling the real
owner-gated PATCH route against production. That is logging in as the owner
to make a financial change and it was done ONCE, on explicit instruction,
for this single edit. The session was in-memory only, never written to disk,
and ended with the process. Refresh tokens were deliberately NOT revoked,
since that would sign the owner out of their own browsers. Do not repeat
this without fresh explicit instruction.

## QA artifact cleanup (2026-10-01)

The acceptance runs created their artifacts in the live "DivineX Final QA"
workspace rather than a disposable one, because an unmapped throwaway cannot
authorize a business profile and the grounding tests needed that. The
tradeoff was defensible; not flagging it and not cleaning up was not.

Removed, 64 items, each attributed by workspace + creation window +
relationship to a known run rather than by name: 19 funnels (17 published),
19 forms, 19 workflows, 3 workflow runs, 2 `beta-journey+` probe contacts
(recursively, so activities are not orphaned) and their 2 deals. The script
re-derived the inventory itself and refused to proceed unless every item was
in that workspace.

Retained because provenance was not mine: the 2026-09-20 "Free Business
Growth Scan" set (2 funnels, 2 forms, 2 workflows, 1 run) and the "QA Lead"
contact with its deal.

Verified afterwards: the published QA URLs return 404, the workspace doc and
gates are intact, the business profile still reads `businessProfileId=4`
"DivineX", 8 plans and 4 billingEvents unchanged, zero Stripe subscriptions.

**For next time: use a disposable workspace, or say up front that you
cannot.** Stripe products for the plan ladder were also created
programmatically on 2026-09-08 in a 523ms burst, which is visible in the
plan `createdAt` timestamps. Plan documents record no `createdByUid` and
`billingEvents` logs no `plan.created`, so there is no audit trail
distinguishing a founder action from a script.

## Reopening 7: the connected assessment journey (2026-10-03)

Opened under rule 2, a customer-reported bug. A customer asked for an
opt-in, then a short assessment, then a thank-you that books a call. They
got disconnected pages, a duplicate, and an assessment classified as a
downloadable lead magnet. Three defects, three different causes.

**Journeys came out unlinked, because of a boundary we built on purpose.**
`create_funnel`'s receipt ends with the new Funnel ID and the instruction to
pass it as `bridge_next_funnel_id` when building the upstream step. The
confirm route withholds that receipt from the client (U1) because it carries
raw ids and internal parameter names that must never reach a customer's
screen, and the chat client builds the model's history out of what it
received. The model was being told to carry an id it was structurally
prevented from seeing, so it invented one. U1 was not weakened. The ids now
reach the model server-side, by reading back what the workspace actually
built (`src/lib/ai-suite/recent-builds.ts`). The same card is why the model
stopped rebuilding pages that already exist.

**A wrong bridge id used to build everything, throw, and then report that
nothing happened** over a page that very much existed, which is how one bad
argument became a duplicate. Validation now runs before the write.

**Assessments were generated as `lead_magnet`,** which cannot publish
without an attached file. The tempting fix was to relax the file
requirement; that requirement is correct and `cta-integrity.ts` is
untouched. The classification was wrong, so a page offering a diagnostic and
promising no file is refused at validate with a note naming the right genre.

**Presentation.** The assessment is shown one question at a time through the
multi-step renderer that already existed, over the ordinary form schema and
submission path. No scoring, no branching, no personality result, no
page-per-question. Ordinary stacked forms are unchanged.

**Journey shape.** `bridge.nextHref` lets the assessment's own completion
page carry the Book a Call button, so the journey is three steps, not four.
No funnel exists solely to hold a link.

Coverage: `scripts/verify-assessment-journey.mts` (67 checks, six mutations
confirmed caught) and `scripts/verify-assessment-visitor.mts` (10 checks,
which publishes a real assessment and walks it in a browser with no
session).

**Model path, certified 2026-10-03.** The OpenRouter balance ran out during
the original pass, so the model-driven half could not be exercised. It has
now been run end to end on the final build, and the reproduction found one
more instance of the same defect this work started from.

`bridge_next_href` wanted an app path and its guidance showed
`/b/<subAccountId>/<slug>`. The model is never told the workspace id, so it
filled the template literally: `/b/{subAccountId}/root-cause-consult`. The
sanitiser refused and created nothing, which is the behaviour we built and
it held, but the refusal repeated the same example so the retry failed the
same way, and Zeno ended up telling the customer it could not continue
without "the booking page's public URL", a fact the server already has.
Same shape as the unlinked-journey bug: an argument the model cannot
produce. Fixed the same way, in `cca11a6`, by making the slug the only part
it has to supply and assembling the path server-side.

Certified run, 29 checks: booking page created first, exactly one
`create_funnel`, four questions the model wrote itself, the real slug
passed and resolved, the completion opening the real diary, four subsequent
turns declining to rebuild ("that would just create a duplicate"), nothing
published or activated on its own, and a stranger walking five screens into
a booking with one contact, one submission and every answer retained.
`verify-assessment-journey` 71 checks with ten mutations caught;
`verify-assessment-visitor` 10 checks green on staging and production.

## Reopening 8: a hosting hostname in a customer's inbox (2026-10-03)

Opened under rule 2. A lead-magnet email reached a real inbox reading
"Download your copy here:
https://flow-growth-scan-staging.onrender.com/api/funnel-asset/...".
Two independent faults.

**The host was where the app runs.** `NEXT_PUBLIC_APP_URL` is a deployment
address, a `*.onrender.com` name on Render; the brand's domain lives in
`CUSTOM_BRAND.primaryDomain`. Internals may use the former, anything a lead
reads must carry the latter, because a hosting hostname tells people where
their file really lives and an unfamiliar domain in a mail is what
recipients report as phishing. `publicLinkBase()`
(`src/lib/email/public-link.ts`) returns a configured real domain as-is,
including a buyer's own, and falls back to the brand domain only when what
is configured is a hosting address.

**The URL was frozen.** It was written into the stored email body at PDF
UPLOAD time, so the body kept whichever host uploaded it and changing
configuration later fixed nothing. The unsubscribe link never had this
problem because it is built at send time, so the download host is resolved
at send time too. No re-upload and no migration: of the 21 delivery emails
in this deployment 14 carried the staging hostname, and all 14 are corrected
on their way out.

**A download is an action**, so it is now the button the renderer already
draws rather than a pasted URL. The same send-time pass upgrades bodies
written before this, so all 21 become buttons, and `renderBodyText` still
gives plain-text readers the URL. The publish gate matches the asset's
relative path, which the button contains, so it is unaffected.

Verified against a real stored body: the staging host is gone, the anchor
renders, the plain-text fallback carries the URL. Coverage:
`scripts/verify-email-link-host.mts`, 31 checks, seven mutations tested. One
survived, showing an assertion that could not fail; it was replaced with an
idempotence check that can.

Not done, and deliberately: attaching the PDF to the mail instead of linking
it. The codebase currently rewrites attachment claims into download links on
purpose, so that is a separate change, not a variation of this one.

## Referral economics, locked 2026-10-03

**20% of the eligible amount collected, for at most 12 successful payments
per referred customer, held 30 days, paid in monthly batches.** After the
twelfth successful payment that customer's commission permanently ends.

The program is in the **Ascend repo** (`DivineX-Business-Intelligence`,
`artifacts/api-server/src/lib/partners/`), not this one. Flow's
`/agency/affiliates` is a separate, manual program and was not touched.
Commits `a0fb75b` and `808372a`.

**What it was.** 25% on the first payment and every renewal for as long as
the customer stayed subscribed, with the partner pages advertising exactly
that. A commission with no end.

**Where the rules live now.** `lib/partners/commission.ts`, as functions
that touch nothing: no database, no Stripe, no clock they are not handed.
Money rules are the ones most worth testing and the hardest to test through
a webhook, so the arithmetic is separate from the recording of it.

**Basis.** What was actually collected, less tax. Checkout credits use the
pre-tax subtotal, renewals subtract the invoice's tax, and a discount or
proration reduces the commission with the charge rather than paying on list
price. Nothing collected earns nothing.

**The window** counts the referred CUSTOMER's payments, not a
subscription's, so cancelling and resubscribing continues it instead of
starting a new one. Reversed rows are excluded, so a refunded payment
returns its slot rather than consuming one it never earned.

**Refunds and disputes** were not handled at all, so a refunded payment kept
its commission. Both now reverse the accrual. Reversal resolves BOTH the
invoice and the checkout session, because a first payment is recorded
against the session and a renewal against the invoice; matching only the
invoice would have missed every first-payment refund. A commission already
paid out is deliberately not clawed back by a webhook, it is logged for a
person to decide.

**Two ways money could still have left wrongly,** found by reading the
payout path after writing the reversal: `transferCommission` refused the
legacy `voided` status but not the new `reversed` one, and the hold was
enforced only inside the automatic sweep, at 7 days, so a manual or bulk
payout released money that had not cleared. The hold now sits at the
transfer, where every path passes it, at 30 days.

**Idempotency** is unchanged and still the unique index on
`stripe_payment_reference`; a reversal is idempotent by updating only a row
that is still pending, so concurrent deliveries cannot both deduct.

**No migration was required.** Every rule is enforced from columns that
already exist: the hold is derived from the accrual date rather than stored,
and `payable` is derived rather than written by a job, so money is never
payable in fact but pending in the table because a cron did not run.

**A stale rate cannot out-rank the policy.** `partnerRatePct()` caps a
stored `commissionPct` at 20 while still honouring a deliberately lower
arrangement, so rows left at the old 25 default pay the published terms.
Historical commissions were NOT restated: money already accrued under the
previous terms is what partners were told they were owed.

**Coverage:** 51 targeted tests (`partnerCommission.test.ts`,
`partnerReferralWiring.test.ts`), nine mutations confirmed caught, full
Ascend suite 791 passing. One mutation caught a partner page still promising
commission "for as long as they stay subscribed".

**Production verification is limited, and deliberately.** The certified
build is live and the full suite is green, but the accrual path was not
exercised end to end in production because doing so would require creating
real charges and real payouts. The economics are deterministic and covered
by the tests above.

## Asset delivery + branded email URLs, closed 2026-10-03

Production `300d956`. Closes both the hosting-hostname defect and
fulfilment for documents, video and audio, as one system.

**Root cause of the URL defect, restated because it was two faults.** The
host was the deployment's address (`*.onrender.com` on Render) rather than
the brand's domain, AND the whole URL was frozen into the stored email body
at upload time, so changing configuration later fixed nothing. The
unsubscribe link never had this problem because it is built at send time;
downloads now work the same way. Of 21 delivery emails in this deployment,
14 carried the staging hostname and all 14 are corrected on their way out,
with no re-upload and no workflow rebuilt.

**One identity per deliverable.** A `funnelAssets` document is what a
deliverable IS; where its bytes sit is a detail. An uploaded document keeps
its Firestore chunks, a video or audio file records where it already lives
(`externalUrl`), and everything downstream, the email, the player, the
publish guard, sees the same unguessable id. That is what lets an automation
survive a deployment move or a swapped file: it refers to the identity, and
the host is resolved when the mail is sent.

**Why media is referenced, not uploaded.** `MAX_ASSET_BYTES` is 5MB and it
is MEASURED, not chosen: the platform in front of this app rejects bodies
above roughly 8.4MB before the route runs. Comfortable for a document,
nowhere near a video. Rather than becoming a storage product, media records
its source and is PLAYED on a branded page at `/d/[assetId]`, so the
recipient sees the brand's domain and never the provider's. Supported
uploads remain JPEG, PNG, WebP and PDF.

**Delivery by kind**, chosen automatically and overridable by the operator:
PDF and other files "Download your copy" / "Access your file" to the
download route; video "Watch video" and audio "Listen now" to the branded
player. HTML gets a styled button, plain text gets
`Watch video: https://<brand>/d/...`, and no markdown leaks either way.

**Three things the recipient walk found that unit tests would not.** `/d`
was added to `PUBLIC_PATHS` as `"/d/"`, and the matcher tests `=== path` or
`startsWith(path + "/")`, so it looked for `"/d//"` and every recipient hit
the LOGIN PAGE. A video requested from the download route is redirected to
the player rather than served, because serving it would hand over the
provider's address. And the player refuses anything that is not media,
including an asset carrying a URL whose kind is not video or audio, so it
can never become a way to read a document.

**Security model, unchanged and deliberately.** The unguessable Firestore
auto-id is the capability, which is the standard lead-magnet model and was
already how downloads worked. No login, on purpose: a lead who just gave
their address must not meet an authentication wall on the way to the
resource they were promised. The player adds no new exposure because it
serves only media and renders nothing for any other kind.

**Coverage:** `scripts/verify-asset-delivery.mts`, 44 recipient-journey
checks across document, video and audio, driven in a browser with no
session, green locally, on staging and against production. Two mutations
survived at first and both were real gaps in the tests rather than the code:
routing media to the download route still "worked" via the redirect, and the
player's kind check was not load-bearing because a document happens to carry
no URL. Both are now proven. Regressions green: email-link-host,
assessment-journey, assessment-visitor, funnel-quality, funnel-e2e,
funnel-runtime, funnel-matrix, funnel-assets, funnel-frameworks,
claim-badge-integrity, capability-idempotency, workflow-failure, em-dash.
Lint at its 27-error baseline.

**Remaining limitations, stated plainly.** Video and audio are referenced,
so a dead or private source URL is not something this can detect before a
recipient clicks. Documents remain capped at 5MB. There is no asset library
UI: a deliverable is attached per funnel, which is the existing model and
was deliberately not expanded into a DAM.

## Pricing + entitlement reconciliation (2026-10-03) — NO CODE CHANGED

A correction pass was requested off the back of the capacity economics
report. Tracing the authoritative path found that two of that report's
findings were WRONG, and that the premise of the correction does not hold.
Nothing was changed: the safe conclusion was that there is nothing here to
safely change.

**Correction 1: the NO_LIMITS fallthrough is not a defect.** The report said
an Ascend-provisioned Flow workspace resolves to unlimited. It does not.
`resolvePlanLimits` has a branch ABOVE the grandfather clause returning
`ASCEND_SOLO_WORKSPACE_LIMITS` when `ascendOperations.provisionedByAscend`
is true. Verified by running it: 1 workspace, 5 websites, 25,000 emails, 50
AI generations, 15 Growth Scans, 1 member, 200 voice minutes. The report
read the default and missed the branch.

**Correction 2: the AI spend ceiling already exists.** The report said
ASCEND has no enforced AI-dollar ceiling. `ASCEND_SOLO_WORKSPACE_LIMITS`
carries `maxAiSpendPerMonth: 15`, which is exactly the Solo figure the
correction pass asked for, enforced through `aiSpendAllowed` before every
model call. `scripts/verify-cost-guardrails.mts` already asserts refusal AT
the ceiling and already tests the message for ceilings 15, 40 and 90.

The one remaining "unlimited" case, an Ascend grant ATTACHED to a workspace
the customer already owned (`provisionedByAscend: false`), is deliberate and
asserted: "grant not raised by provisioning stays unlimited", because that
workspace belongs to a paying Flow customer who must not be downgraded.
`verify-ascend-solo-limits.mts` is mutation-tested against all three cases.

**The pricing premise does not hold.** The intended ASCEND ladder, Solo
$127 / Team $297 / Agency $797, was not something production drifted away
from. ASCEND Team and ASCEND Agency HAVE NEVER EXISTED as products. The
catalog is `ascend_pro` (Zeno Pro), the Zeno Agency ladder
(`ascend_agency_starter` / `ascend_agency` / `ascend_agency_pro`), and
`growth_system`, and `growth_system` is the ONLY product granting
`growth_operations`. $297/$497/$997 belong to Zeno Agency, a different
product line. The capacity report matched them to ASCEND by price, which is
what made it look like drift, and the correction brief inherited that. The
`AscendOperationsGrant.product` field is typed to the single literal
`"growth_system"`, so the Flow side could not carry a Solo/Team/Agency tier
even if one were assigned.

Building that ladder is therefore new product construction, not a surgical
correction: two Stripe products, two prices, two entitlement keys, plan
limit rows, provisioning, checkout and pricing-page work.

**And it is blocked regardless.** The local Stripe key is TEST mode, so
production products and prices cannot be authoritatively read; the Neon
endpoint is disabled ("The endpoint has been disabled"), so plan documents,
entitlement rows and the subscriber inventory cannot be read. The brief
itself required stating this before any change risking billing
inconsistency. Changing the public price to $797 while unable to confirm
what Stripe charges would create exactly that inconsistency.

Verified green while tracing: verify-ascend-solo-limits, verify-cost-guardrails,
verify-plan-limits-per-workspace, verify-workspace-entitlements,
verify-workspace-entitlement-evaluator, verify-plan-seats.

Referral economics unchanged: 20% x maximum 12 successful eligible payments,
30-day hold, monthly payouts.

## CURRENT ASCEND capacity economics — CLOSED 2026-10-03

Authoritative. Supersedes the capacity economics report delivered in
session, which contained two errors and one wrong premise, all corrected
below. No code was changed to close this.

### Read this before touching ASCEND economics again

**CURRENT ASCEND IS `growth_system` AT $127/month** ($197 standard/reference
where configured). It is the only product that grants `growth_operations`.

**There is no ASCEND Team and no ASCEND Agency.** $297 / $497 / $997 are
tiers of the SEPARATE **Zeno Agency** product line
(`ascend_agency_starter` / `ascend_agency` / `ascend_agency_pro`), and $77 is
**Zeno Pro** (`ascend_pro`), which grants no Growth Operations. Any
calculation treating those prices as ASCEND tiers is hypothetical, not a
production baseline. **Do not infer an ASCEND product from a Zeno Agency
price.** That inference is exactly what produced the earlier false "pricing
drift" finding. Future ASCEND tiers are a roadmap decision triggered by
customer demand, not an outstanding correction.

### FACT, verified by running the implementation

An ASCEND-provisioned Flow workspace resolves to bounded limits: **1
workspace, 5 websites, 25,000 emails/month, 50 AI generations, 15 Growth
Scans, 1 member, 200 voice minutes**, and a **$15/month internal AI spend
ceiling** enforced through `aiSpendAllowed` before every model call. The
$15 is an INTERNAL cost guardrail. It is not a credit, balance or allowance
and must never appear in customer-facing copy.

**NO_LIMITS is not an ASCEND defect.** `resolvePlanLimits` returns
`ASCEND_SOLO_WORKSPACE_LIMITS` for a workspace with
`ascendOperations.provisionedByAscend === true`, via a branch ABOVE the
grandfather clause. The earlier report read the default and missed the
branch.

**The one remaining unlimited case is intentional.** A grant ATTACHED to a
workspace the customer already owned (`provisionedByAscend: false`) stays
unlimited, because that workspace belongs to a paying Flow customer who must
not be downgraded by also buying ASCEND. `verify-ascend-solo-limits.mts`
asserts all three cases and is mutation-tested. Do not "fix" this.

**Identity is never resolved from price.** `verify-price-collision.mts` (29
checks) proves no routing, webhook or entitlement branch reads an amount,
and that `growth_system` grants `growth_operations` from
`metadata.product`. Zeno Pro and ASCEND may share a `professional` limits
row and still cannot be confused: only `growth_system` grants Operations.

### The shared-SMS field is NOT stale, and removing it would invert it

`ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth = 500` looks like a
leftover contradicting BYO Twilio. It is not. Traced and then RUN:

- `checkPlanLimit` returns `allowed` with an UNLIMITED ceiling when the
  field is `undefined` or `null`. **Deleting the field would grant unlimited
  DivineX-paid SMS**, the exact opposite of the intent.
- The path is real and reachable: no sub-account `twilioConfig` →
  `agencyAllowsSharedSms` (defaults TRUE) → `smsIsConfigured()` (deployment
  `TWILIO_*`) → the send runs on DivineX's Twilio, is checked against this
  ceiling and recorded (`twilio.ts`).
- `0` is the supported way to say "not included" and reads "Text messages
  aren't included in your plan."

So the 500 is the load-bearing cost bound on a DivineX-paid path, not dead
configuration. Making ASCEND strictly BYO is a **customer-visible change**
(a workspace sending shared SMS today would stop at zero), so it was NOT
made. See the open owner decision below.

### MODELLED, not measured

Contribution margin for `growth_system` at $127 is healthy at realistic
usage while paying the 20% referral commission. Those figures are MODELLED:
the Neon endpoint is disabled, so `ai_usage_log` could not be read and AI
cost per unit is derived from code (call counts and `maxTokens`), not
measured. This is contribution margin, not company profit. No Team/Agency
economics are certified, because those products do not exist.

### Referral, unchanged

20% of eligible collected subscription revenue excluding tax, maximum 12
successful eligible payments per referred customer, 30-day hold, monthly
payout batches. The capacity analysis gave no reason to change it.

### Resolved: ASCEND SMS is BYO Twilio only

Owner decision, shipped in `426483f`. See the entry below.

## ASCEND SMS = BYO Twilio only (2026-10-03)

Production `426483f`. **DivineX shared SMS allowance for ASCEND = 0.**

`ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth` is **`0`**. A workspace
with no `twilioConfig` otherwise falls back to the deployment's shared
Twilio credentials, which is DivineX's carrier bill; Ascend does not sell
that capacity, so the shared sender is closed to it. The customer's own
Twilio is the supported path and is unaffected.

**ZERO, NEVER ABSENT.** `checkPlanLimit` reads an absent or null ceiling as
UNLIMITED. So deleting the field, which is the change that looks like
removing an allowance contradicting BYO, would instead hand out unlimited
DivineX-paid SMS. The field stays and carries the number.
`verify-ascend-byo-twilio.mts` pins all three shapes (0 refuses, absent
allows, null allows) so the tidy-looking version cannot come back.

**What the customer reads.** The generic zero-ceiling copy ("not included,
upgrade your plan") is wrong for SMS twice over: texting IS supported, and
no plan sells the shared sender, so upgrading fixes nothing. Both refusal
sites, `limitMessage` and the error thrown in the send path, say
**"Connect your Twilio account to send text messages (Settings → SMS)."**
The send path still distinguishes the two cases, because a workspace that
ran out mid-month should be told it resets, while one that never had an
allowance would be waiting for a 1st that changes nothing.

**Entry points.** All five real SMS paths (manual route, missed-call
text-back, AI reply, workflow engine, review request) go through
`sendSmsForSubAccount`, where the allowance is checked before Twilio is
touched and only when `mode === "shared"`, so a dedicated workspace neither
consumes nor is refused by it. The bare `sendSms()` helper talks to env
Twilio directly and has no callers; the suite keeps it that way.

**Other products unchanged:** a comped or legacy workspace keeps unlimited
shared SMS, a plan with a real allowance still sends under it, and Ascend's
other ceilings (AI $15, voice 200, email 25,000, scans 15) are untouched.

Coverage: `verify-ascend-byo-twilio.mts` (24 checks, four mutations caught),
`verify-cost-guardrails.mts` updated to the new policy and green, plus
verify-ascend-solo-limits, verify-plan-limits-per-workspace,
verify-workspace-entitlements, verify-price-collision, verify-plan-seats.

**Not verified:** production `TWILIO_*` could not be read from this
environment, so whether the shared sender was ever reachable on the live
deployment is unknown. The ceiling closes it either way. No SMS was sent to
verify, deliberately.

## Referral + revenue production path — PARTIALLY certified 2026-10-03

**NOT certified end to end.** The live-money half could not be executed from
this environment, and §2 of the certification brief says to stop rather than
guess. No code changed.

### What WAS proved

**The deployed code is the certified implementation.** BI production runs
`808372a`, which is the referral work itself (`a0fb75b` + `808372a`), and the
working tree is identical to it. 55 referral tests and the full 791-test
Ascend suite pass against exactly that commit.

**The chain is traced, first-hand, end to end in code:** `?ref=CODE` →
`useReferralTracking` records the click once per browser session → the
`ascend_ref` cookie is read at checkout → `session.metadata.ref` is stamped
at both checkout-creation sites → `checkout.session.completed` calls
`creditFirstPayment` → `invoice.paid` (billing_reason
`subscription_cycle`) calls `creditRenewalCharge`, resolved by
`stripeCustomerId` rather than by price → the unique index on
`stripe_payment_reference` makes a replayed webhook a no-op →
`charge.refunded` and `charge.dispute.created` reverse the accrual. Product
identity comes from `metadata.product`, never from an amount
(`verify-price-collision.mts`, 29 checks).

**Payout safety (§8), without paying anyone:** a transfer refuses anything
inside the 30-day hold, refuses a reversed commission, the automatic sweep
holds for 30 days rather than the old 7, a held referral is reported as
skipped rather than failed, the transfer is idempotent per referral, and
money already paid out is left for human reconciliation rather than silently
clawed back.

**The 12-payment cap (§9), without 12 charges:** earns on payments 1, 2 and
12, stops permanently after the twelfth, counts per CUSTOMER so cancelling
and resubscribing does not restart the clock, and excludes reversed rows so
a refund returns its slot. Nine mutations were confirmed caught when this
shipped.

### What is BLOCKED, and why

**No live transaction was created.** Both prerequisites fail, verified
today:

1. **Stripe is TEST, not live.** The available `STRIPE_SECRET_KEY` is
   `sk_test_*`, and `STRIPE_PRICE_GROWTH_SYSTEM` is not set in this
   environment at all. Live product identity, the active Price, the amount
   and the webhook configuration therefore cannot be authoritatively read,
   and any checkout created here would be a test charge that never touches
   the production money path.
2. **Referral accounting cannot be read.** The Neon endpoint is disabled
   ("The endpoint has been disabled"), so `partner_referrals`, `partners`
   and the entitlement rows are unreadable. Even a charge performed by the
   owner could not be verified against application accounting from here.

Consequently §3 to §7 (controlled live transaction, settlement
verification, provisioning from a real payment, refund/reversal) are not
done. The accrual arithmetic, the hold and the cap are proved
deterministically; what remains unproved is that a REAL Stripe settlement
flows through them, which is precisely what the brief existed to establish.

### What the owner needs to do to unblock

Minimum: re-enable the Neon endpoint (read access is enough) AND perform one
checkout on a disposable identity through the real public flow, then share
the resulting checkout-session id. A live READ-ONLY Stripe key would
additionally let the collected amount, tax and interval be reconciled
directly rather than taken on trust. A card must never be entered in chat,
so the hosted-checkout step is the owner's to perform.

Until then: **the logic is certified, the money path is not.**

## Affiliate + agency GTM readiness (2026-10-03) — one defect fixed, money path still unproved

BI production `f5cdb2b`.

### The defect, which is the reason this pass existed

**Partners were quoted 30% and paid 20%.** `DEFAULT_COMMISSION_PCT` in
`lib/partners/account.ts` was its own literal 30, and because the insert
passes it explicitly the schema default of 20 never applied. Both partner
surfaces interpolated that stored column straight into "Earn 30% recurring
commission", while `partnerRatePct()` capped actual earning at 20.

No existing test caught it because every one of them checks what is EARNED,
and nothing checked what the partner is TOLD. Fixed at both causes:
enrolment now takes `COMMISSION_RATE_PCT` so no second percentage exists to
drift, and `/partners/me` and `/partners/app/referral` report
`partnerRatePct(stored)` so rows already on the old 25 and 30 defaults are
quoted the 20 they will be paid. A deliberately reduced partner still sees
their real lower rate, because the cap only lowers.
`partnerFacingRate.test.ts`, 12 checks, four mutations caught.

### The shipped partner architecture, as it actually is

**There is ONE partner program, and an agency is a partner.** No separate
agency-as-referrer product exists; do not infer one from a schema field or
a legacy plan containing the word "agency". Two enrolment paths: public
`/partners/signup` (no purchase required) and auto-enrolment for any
signed-in Ascend user (`/partners/app/referral`, idempotent by email).
Referral link is `{appUrl}/?ref={code}`. Payout rides Stripe Connect
Express.

**Attribution rule: last click, 60-day cookie, ownership locked at first
payment.** `ascend_ref` is set on `/partners/track` and read at checkout.
Once a customer has paid, `creditRenewalCharge` resolves the partner from
that customer's prior referral row by `stripeCustomerId` and never from a
cookie, so a later click by Partner B cannot take Partner A's renewals.

### Verified by test against the deployed commit

803 Ascend tests including 47 tenant-isolation; Flow side green on
verify-ascend-byo-twilio, verify-cost-guardrails, verify-ascend-solo-limits,
verify-price-collision, verify-workspace-entitlements,
verify-plan-limits-per-workspace, verify-plan-seats, verify-em-dash.
`scripts/verify-tenant-isolation.mts` fails on a missing probe fixture, an
ENVIRONMENT issue, not a product defect.

### Still NOT certified

The controlled production money test did not run. The Neon endpoint remains
disabled, so referral accounting cannot be read, and no real charge was
created. Logic is certified; the money path is not. Unblocking needs read
access to Neon plus one owner-performed checkout, as recorded in the
previous entry.

## Reopening rules

Active Ascend AND Flow development is locked. Development reopens only for:

1. a production incident
2. a customer-reported bug
3. a security issue
4. a payment or provisioning failure
5. measured customer behaviour showing a real problem
6. deliberately approved roadmap work

The next source of truth is real customer behaviour.
