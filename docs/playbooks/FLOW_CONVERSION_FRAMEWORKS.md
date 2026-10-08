# Flow Conversion Frameworks

23 frameworks. Extracted verbatim from `src/lib/conversion/framework-library.ts`, which is the versioned source of record.

Each is a distilled PRINCIPLE with decision rules, not a fill-in-the-blank template. The engine reasons with these against a specific business, which is why a dentist and a SaaS get different pages.

## Contents

**Copywriting**: Outcome + Mechanism Headline · Unique Mechanism Reveal · Feature → Benefit Ladder · Objection Preemption · Specific, Verifiable Proof · Single-Action CTA · The One Argument · The Amplification Test · The Hook (four types) · Old Way vs New Way · Slippery-Slide Cadence

**Buyer psychology**: Awareness-Level Routing · Market Sophistication Routing · Value Equation Lens · Emotion First, Logic to Justify · Enter the Conversation in Their Mind · Core Human Motivations

**Offer**: Offer Value Stack · Honest Risk Reversal · Honest Urgency & Scarcity

**Landing page**: Page Architecture by Intent

**Email**: Post-Conversion Sequence Design · Single-Idea Email


---

# Copywriting


## Outcome + Mechanism Headline

`headline-outcome-mechanism` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) + Eugene Schwartz (market sophistication)

**Purpose.** Write a hero headline that names a specific desired outcome AND hints at the unique mechanism that makes it believable.

**Use when**
- The hero of nearly any conversion page
- Cold/paid traffic that must grasp the promise in under two seconds
- Offers whose credibility depends on a 'how' the reader hasn't heard

**Do NOT use when**
- Most-aware traffic that already trusts the brand and just needs the offer/price
- When no honest, specific outcome can be stated (fix the offer first, not the headline)

**Needs**
- primaryDesiredOutcome
- uniqueMechanism
- audience awareness

**Decision rules**
- State a concrete outcome (a number, a named result, a removed pain) before any adjective.
- If the market is sophistication 3+, lead with the MECHANISM, the claim alone is burned out.
- If the reader is problem-aware but not solution-aware, name the outcome; hint the mechanism, don't explain it.
- Never promise a result the offer can't honestly deliver, a strong headline over a weak offer just speeds the bounce.

**Works through**
- Specificity signals truth (a specific claim is harder to fake than a vague one)
- A novel mechanism restores belief in a claim the market has heard before

**Structure**
- [Specific outcome] + [without the feared cost / old way] + [via the mechanism]
- Optional eyebrow above to set audience/context; subheadline below to expand the mechanism in one line

**Grade it on**
- Would it still be true if a competitor's name replaced yours? If yes, it's too generic, fail.
- Is the outcome concrete (name/number/removed-pain) rather than an adjective?
- Does a skeptical reader get WHY it could work, not just WHAT is promised?

**Fails when**
- Adjective soup ('transformative', 'next-level') standing in for a real outcome
- Mechanism-free claim to a sophistication-3+ market that's already immune to it
- Clever wordplay that hides the promise instead of landing it

**Stacks with:** awareness-routing, sophistication-routing, mechanism-reveal, proof-specificity


## Unique Mechanism Reveal

`mechanism-reveal` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Explain WHY this offer works differently (the specific mechanism) so a reader who's tried other things believes it won't fail the same way.

**Use when**
- Sophisticated markets that have tried competing solutions
- Any offer whose central claim needs a reason-to-believe
- The 'solution' beat of a VSL or long-form page

**Do NOT use when**
- Simple, low-consideration offers where the mechanism is obvious (a coupon doesn't need a mechanism)
- When there is no genuinely distinct mechanism. Do not invent one; compete on proof or offer instead

**Needs**
- uniqueMechanism
- the old way / why alternatives fail

**Decision rules**
- Frame the villain as a BEHAVIOR, belief, or system the reader inherited, never a person or the reader themselves.
- Contrast the old way's failure point with the exact step the mechanism changes.
- Name the mechanism so it becomes a thing the reader can remember and repeat.

**Works through**
- A new mechanism reframes past failure as 'not your fault, wrong method', restoring hope
- Naming a mechanism creates perceived proprietary advantage

**Structure**
- Old way → why it structurally fails → the overlooked lever → the named mechanism → the outcome it unlocks

**Grade it on**
- Does it explain failure of alternatives without attacking the reader?
- Is the mechanism specific enough to feel real, simple enough to remember?

**Fails when**
- A 'mechanism' that's just the outcome restated
- Blaming the reader for past failure (kills the reframe)
- Inventing a fake proprietary system, a verification failure and a trust killer

**Stacks with:** headline-outcome-mechanism, sophistication-routing, objection-preemption


## Feature → Benefit Ladder

`feature-to-benefit-ladder` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Convert every feature into the outcome and identity the reader actually buys, so the page sells results, not specs.

**Use when**
- Benefits sections, 'what's included' blocks, deliverable lists
- Feature-heavy offers (SaaS, service packages)

**Do NOT use when**
- Pure identity/luxury plays where the feeling, not the feature, is the product

**Needs**
- deliverables / features
- primaryDesiredOutcome

**Decision rules**
- For each feature, climb the ladder: feature → what it does → what that means for them → who it lets them become.
- Stop at the rung that matches the audience's motivation (rational buyers want the mechanism rung; emotional buyers want the identity rung).

**Works through**
- People buy outcomes and identity, not attributes
- Concreteness makes a benefit feel attainable

**Structure**
- [Feature] so you can [capability] which means [outcome], [identity payoff]

**Grade it on**
- Does each line answer 'so what?' at least once?
- Is the benefit specific to THIS business, not any business in the category?

**Fails when**
- Listing features with no 'so what'
- Benefit inflation into vague grandiosity
- Every bullet climbing to the same generic identity

**Stacks with:** value-equation-lens, offer-value-stack


## Objection Preemption

`objection-preemption` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Name the single biggest reason the reader would NOT act, and dissolve it before the CTA, on the page, not in a later email.

**Use when**
- Any priced offer
- High-consideration or high-ticket pages
- FAQ and guarantee sections

**Do NOT use when**
- Ultra-low-friction free offers where surfacing objections manufactures doubt that wasn't there

**Needs**
- audience.objections
- the primary purchase blocker

**Decision rules**
- Rank objections; handle the #1 in the body, the rest in the FAQ.
- Answer with evidence or a mechanism, not a reassurance ('trust us' is not an answer).
- If the honest answer is 'it might not be for you', qualify OUT, that raises conversion of the right buyer.

**Works through**
- Unspoken objections don't disappear; they become silent exits
- Naming a doubt first earns permission to answer it

**Structure**
- Name the objection in the reader's own words → validate it → answer with proof/mechanism → restate the low-risk next step

**Grade it on**
- Is the #1 real objection actually addressed, not a strawman?
- Is the answer evidence-backed rather than a platitude?

**Fails when**
- Handling easy objections while dodging the real one
- Defensive tone that amplifies the doubt
- Fabricating proof to close the objection

**Stacks with:** honest-risk-reversal, proof-specificity, single-cta-clarity


## Specific, Verifiable Proof

`proof-specificity` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file), with the DivineX no-fabrication rule

**Purpose.** Make claims believable with concrete, real proof, and stay silent where no real proof exists, rather than inventing it.

**Use when**
- Trust/social-proof sections
- After any bold claim
- High-skepticism markets

**Do NOT use when**
- When no real proof exists, then lean on mechanism, specificity, and risk reversal instead of faking proof

**Needs**
- offer.proof (real only)
- real testimonials/results if the operator provided them

**Decision rules**
- A number beats an adjective; a named specific beats a round number.
- Only use testimonials/results/logos/awards the operator actually supplied. NEVER fabricate any of them.
- If proof is thin, substitute demonstrated mechanism and a strong guarantee; do not manufacture social proof.

**Works through**
- Specificity is a truth signal
- Third-party proof outweighs first-party claims

**Structure**
- Claim → specific evidence for the claim → attribution (real) → relevance to the reader's situation

**Grade it on**
- Does every proof element trace to a real, supplied source?
- Are the numbers specific rather than suspiciously round?

**Fails when**
- Invented testimonials/stats/customer-counts/revenue/awards (a hard verification failure)
- Vague proof ('trusted by many')
- Proof irrelevant to the reader's situation

**Stacks with:** objection-preemption, headline-outcome-mechanism


## Single-Action CTA

`single-cta-clarity` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Give the page one primary action, stated as an outcome the reader gets, repeated, never competing with itself.

**Use when**
- Every conversion page
- CTA buttons, banners, sticky bars

**Do NOT use when**
- Genuinely multi-path pages (a pricing page with distinct plans), but even then, one action per option

**Needs**
- offer.cta
- conversionEvent
- trafficTemperature

**Decision rules**
- One primary action per page; a secondary link (not button) at most.
- Label the button with the outcome or the thing received, not 'Submit'.
- Match CTA friction to commitment: a free lead magnet earns one click; a high-ticket call earns a qualifying step.
- Repeat the same CTA at each natural decision point, same words, same destination.

**Works through**
- Choice overload reduces action
- Clarity of next step lowers perceived risk

**Structure**
- Restate the value → the single action as an outcome → risk/again-reassurance microcopy under it

**Grade it on**
- Is there exactly one primary action?
- Does the button promise the outcome, not the mechanics?
- Do all CTAs point to the same destination?

**Fails when**
- Competing CTAs stealing each other's clicks
- Generic 'Submit'/'Learn more' labels
- CTA friction mismatched to the offer's commitment

**Stacks with:** objection-preemption, honest-urgency


## The One Argument

`one-argument` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) (Winning Ads & VSL Formula, The One Argument)

**Purpose.** Build the ENTIRE page around a single belief the prospect must accept to want the offer, one coherent argument, not a pile of features or sections that each make a different point.

**Use when**
- The organizing spine of every page before a word is written
- Any offer where the reader must be persuaded, not just informed

**Do NOT use when**
- Pure transactional pages for already-decided buyers (a reorder page needs no argument)

**Needs**
- uniqueMechanism
- primaryDesiredOutcome
- the old way that's failing

**Decision rules**
- State the one argument as: '[specific mechanism] is why you're not getting [result] now, and why [better result] is possible.'
- The mechanism is the ROUTE to the result, never a list of deliverables.
- Congruence: every section must reinforce this one argument. If a section argues a different point, cut it or refit it.
- Everything on the page is either setting up, proving, or acting on this single belief.

**Works through**
- A single, repeated belief is persuasive; a scattered list of claims is forgettable
- Coherence itself signals competence and truth

**Structure**
- Name the one belief → make the reader feel the old way fails → introduce the mechanism as the route → prove it → act on it

**Grade it on**
- Can you state the page's one argument in a single sentence?
- Does every section serve that one argument, or do some wander?
- Is the mechanism framed as the reason the result happens, not as deliverables?

**Fails when**
- A feature list with no through-line
- Multiple competing arguments diluting each other
- The mechanism reduced to 'what you get' instead of 'why it works'

**Stacks with:** headline-outcome-mechanism, mechanism-reveal, old-way-new-way, slippery-slide


## The Amplification Test

`amplification-test` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) (Winning Ads & VSL Formula. What Every Line Must Do)

**Purpose.** The line-level filter that kills bland copy: every line must make the outcome MORE desirable, certain, achievable, or urgent than the line before it, otherwise it's filler.

**Use when**
- Reviewing/tightening any draft
- Deciding whether a sentence earns its place

**Do NOT use when**
- Never skip it, it's the difference between persuasion and description

**Needs**
- the drafted copy
- primaryDesiredOutcome

**Decision rules**
- More DESIRABLE: make the outcome physical and specific, 'case-study-worthy clients', not 'better leads'.
- More CERTAIN: make the result feel controllable/proven. 'a dial you can turn up and down', not 'scalable'.
- More ACHIEVABLE: make effort/time/complexity feel lower, 'three belief shifts', not 'endless content'.
- More URGENT: sharpen the cost of the old way. 'your content is training people to see you as free'.
- If a line does NONE of these four jobs, it's explanation, tangent, or filler, cut it, move it, or rewrite it.

**Works through**
- Every sentence either raises or lowers momentum and desire. None are neutral
- Concrete, physical language outsells abstract adjectives

**Structure**
- Draft → test each line against desirable/certain/achievable/urgent → cut or rewrite every line that fails

**Grade it on**
- Does every line raise desire, certainty, achievability, or urgency?
- Are outcomes stated physically ('case-study-worthy clients') rather than abstractly ('better results')?
- Would removing the line weaken the argument? If not, it was filler.

**Fails when**
- Flat descriptive lines that inform but don't move
- Abstract adjectives standing in for physical outcomes
- 'Feature, feature, feature' with no amplification

**Stacks with:** one-argument, slippery-slide, feature-to-benefit-ladder, headline-outcome-mechanism


## The Hook (four types)

`hook-types` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) (Winning Ads & VSL Formula, The Hook Formula)

**Purpose.** Earn the first few seconds by answering 'is this for me?' and 'is it worth my attention?' with context about the PROSPECT's situation plus a core claim, using one of four proven hook shapes.

**Use when**
- The opening line/headline of any page or ad
- The eyebrow + headline pairing of a hero

**Do NOT use when**
- Most-aware audiences who just need the offer. Open on the offer, not a hook

**Needs**
- primaryCustomer / their situation
- the core claim, mechanism, or outcome

**Decision rules**
- Pick ONE hook type: (1) Villain/contrarian. 'the thing you were told to do is wrong'; (2) Bold claim. 'this outcome is possible'; (3) Identity/situation, 'if you're this person in this situation…'; (4) Story/before-after. 'here was the before; here's the result'.
- Be specific enough to EXCLUDE the wrong person, a hook that speaks to everyone speaks to no one.
- Context is about the prospect's world (their tool, result, pain), never the creator's biography.
- Match the hook to awareness: villain/story for colder, bold-claim/identity for warmer.

**Works through**
- Self-identification: the right person must feel the message is about them
- Skepticism validated (villain hook) lowers the reader's guard

**Structure**
- Context (name the prospect + situation) + Core claim (the outcome/diagnosis/mechanism worth their next 10 seconds)

**Grade it on**
- Would the RIGHT prospect feel 'this is about me'?
- Is it specific enough to exclude the wrong person?
- Does it earn the next sentence, or just describe?

**Fails when**
- Generic 'grow your business' hooks that exclude no one
- Creator-biography openings instead of prospect-situation
- Trying to appeal to everyone

**Stacks with:** headline-outcome-mechanism, awareness-routing, old-way-new-way


## Old Way vs New Way

`old-way-new-way` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) (Winning Ads & VSL Formula. Old Way vs New Way)

**Purpose.** Give the prospect a clean, blameless explanation for past failure, then position the mechanism as the logical alternative, so trying again feels safe instead of shameful.

**Use when**
- The problem/solution beat of any persuasion page
- Markets where the prospect has tried and failed before

**Do NOT use when**
- Brand-new problems the prospect has never tried to solve (there's no 'old way' to indict)

**Needs**
- the old way / prevailing approach that fails
- uniqueMechanism

**Decision rules**
- The villain is a BEHAVIOR, belief, approach, system, or category. NEVER a named person, coach, or competitor.
- Reframe past failure: 'You didn't fail because you're incapable. You were using a method that creates the wrong result.'
- Make the contrast FELT (show the two side by side), don't announce 'the old way is… the new way is…'.
- The prospect should conclude the new mechanism is the logical alternative on their own.

**Works through**
- Relief from self-blame restores hope and re-opens the buying decision
- Contrast makes the new mechanism's value legible

**Structure**
- Name the old way → why it structurally produces the wrong result (no blame) → the mechanism as the natural alternative → the better future it makes possible

**Grade it on**
- Is the villain a behavior/system, not a person?
- Does it remove self-blame rather than pile it on?
- Is the contrast shown rather than announced?

**Fails when**
- Attacking the reader or a named competitor
- Announcing 'old way/new way' instead of making it felt
- Blaming the prospect for past failure (kills the reframe)

**Stacks with:** one-argument, mechanism-reveal, hook-types


## Slippery-Slide Cadence

`slippery-slide` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) (Winning Ads & VSL Formula. Slippery-Slide Cadence)

**Purpose.** Make reading the next line feel easier than stopping, momentum built from open loops, tension-and-payoff, contrast, and one idea per line, all serving the one argument.

**Use when**
- Long-form pages, VSLs, sales letters, email bodies
- Any copy where the reader can bail at every line

**Do NOT use when**
- Ultra-short one-fold pages where there's barely a slide to grease (still keep one-idea-per-line)

**Needs**
- the drafted copy
- the one argument it serves

**Decision rules**
- Open loops: a line raises a question the next line answers.
- Tension then payoff: one line sharpens the pain, the next releases it with the mechanism.
- Contrast: show old way and new way side by side.
- Long setup → short snap: a descriptive sentence followed by a decisive one.
- One point per line: each idea lands before the next begins.
- The line filter: every line must amplify more than the line before it, or it slows the slide.

**Works through**
- Unresolved tension compels continued reading
- Cognitive ease: short, single-idea lines are effortless to consume

**Structure**
- Congruence (every line serves the one argument) + cadence (loops, tension/payoff, contrast, snap, one idea per line)

**Grade it on**
- Does each line pull you into the next?
- Is there one idea per line?
- Do open loops get paid off?

**Fails when**
- Dense multi-idea paragraphs that stall the reader
- No tension or open loops, pure exposition
- Lines that don't advance the argument

**Stacks with:** one-argument, amplification-test, single-idea-email


---

# Buyer psychology


## Awareness-Level Routing

`awareness-routing` · v1.0.0 · source: Eugene Schwartz, Breakthrough Advertising (five awareness levels), applied per DivineX

**Purpose.** Open the page at the reader's actual awareness level so the first screen meets them where they are, the single biggest lever on message-market match.

**Use when**
- Choosing the hero angle for any page
- Deciding how much problem-education precedes the offer

**Do NOT use when**
- Never skip it. Every page has an implicit awareness assumption; make it explicit

**Needs**
- audience.awareness
- trafficSource / searchIntent

**Decision rules**
- Unaware → open on the problem/symptom, not the offer; earn the right to sell.
- Problem-aware → open on the desired outcome + agitate the cost of staying stuck.
- Solution-aware → open on your mechanism vs. the category of solutions.
- Product-aware → open on why YOU (differentiators, proof, offer terms).
- Most-aware → open on the offer, price, and CTA; cut the education.
- Infer awareness from traffic: high-intent search skews product/most-aware; cold interest ads skew problem/unaware.

**Works through**
- A message that assumes the wrong awareness reads as irrelevant and bounces
- Meeting the reader's current thought earns the next sentence

**Structure**
- Diagnose awareness → pick the matching hero angle → sequence sections to close the remaining awareness gap → offer

**Grade it on**
- Does the first screen match where this traffic actually is?
- Is there wasted education for already-aware traffic (or a missing bridge for unaware)?

**Fails when**
- Selling the offer to unaware traffic
- Over-educating most-aware, high-intent traffic into boredom
- Assuming one awareness level for mixed traffic sources

**Stacks with:** headline-outcome-mechanism, sophistication-routing, page-architecture-by-intent


## Market Sophistication Routing

`sophistication-routing` · v1.0.0 · source: Eugene Schwartz, Breakthrough Advertising (five sophistication stages), applied per DivineX

**Purpose.** Calibrate how hard the claim must work based on how many similar claims the market has already heard.

**Use when**
- Deciding whether to lead with a claim, a bigger claim, a mechanism, or an identity
- Crowded categories

**Do NOT use when**
- Brand-new categories with no prior claims (stage 1). There, the simple direct claim wins

**Needs**
- audience.sophistication
- competitive context

**Decision rules**
- Stage 1 (first claim): state the direct benefit plainly.
- Stage 2 (claims exist): make a bigger/more specific claim.
- Stage 3 (claims tired): lead with the MECHANISM, the how, not the what.
- Stage 4 (mechanisms tired): make the mechanism bigger/easier/faster, or add a new one.
- Stage 5 (burned out): lead with identity, belief, and experience; the market no longer believes claims OR mechanisms.

**Works through**
- Claims decay as a market hears them repeated
- Novelty of angle restores attention when the claim can't

**Structure**
- Assess how saturated the claim is → pick the stage-appropriate angle → escalate only as far as the market requires

**Grade it on**
- Does the angle match the market's fatigue level?
- Are we over-escalating (identity play to a stage-1 market) or under (bare claim to a stage-4 market)?

**Fails when**
- Bare claim to a burned-out market
- Jumping to identity/belief when a simple claim would still land
- Ignoring that different traffic sources sit at different stages

**Stacks with:** headline-outcome-mechanism, mechanism-reveal, awareness-routing


## Value Equation Lens

`value-equation-lens` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) + established value-equation thinking in direct response

**Purpose.** Diagnose and strengthen how desirable an offer FEELS: raise the dream outcome and perceived likelihood; cut the time and effort/sacrifice.

**Use when**
- Auditing an offer before writing the page
- Deciding which offer levers the copy should emphasize

**Do NOT use when**
- As a copy template, it's a diagnostic lens, not a section to render

**Needs**
- offer.transformation
- offer.mechanism
- time-to-result
- effort required
- proof of likelihood

**Decision rules**
- If desire is low, raise the dream outcome (make it more specific and vivid). Do not inflate it falsely.
- If belief is low, raise perceived likelihood with proof, mechanism, and a guarantee.
- If the offer feels heavy, cut the time-to-result and the effort/sacrifice the reader must make, and SAY so on the page.
- The biggest weakness in the equation is where the copy should spend the most words.

**Works through**
- Perceived value rises with dream outcome × likelihood, and falls with time × effort
- Reducing perceived effort often beats increasing perceived benefit

**Structure**
- Score the four levers → identify the weakest → route copy and offer changes to fix the weakest first

**Grade it on**
- Does the page visibly address time and effort, not just outcome?
- Is perceived likelihood backed by real proof/mechanism, not just enthusiasm?

**Fails when**
- Only ever amplifying the dream outcome while ignoring time/effort
- Raising likelihood with fabricated proof (a verification failure)
- Treating the equation as copy instead of diagnosis

**Stacks with:** offer-value-stack, feature-to-benefit-ladder, honest-risk-reversal


## Emotion First, Logic to Justify

`emotion-then-justification` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Lead with the emotional driver that makes someone WANT to act, then give the rational reasons that let them feel smart doing it.

**Use when**
- Most consumer and personal-brand offers
- Sequencing a page's persuasion arc

**Do NOT use when**
- Highly rational enterprise/procurement buys where feeling-led copy reads as unserious. There, lead with the business case

**Needs**
- audience.motivations
- audience.fears
- whether the purchase is emotional or rational for this buyer

**Decision rules**
- Decide if THIS purchase is primarily emotional or rational for THIS audience, and lead accordingly.
- Even rational buyers need an emotional reason to move now; even emotional buyers need logic to justify the spend afterward.
- Place the emotional hook up top; cluster the logical justification (specs, ROI, proof) near the decision point.

**Works through**
- Decisions are made emotionally and justified rationally
- Justification reduces post-decision regret and refund risk

**Structure**
- Emotional hook (desire/fear) → vision of the outcome → rational justification (proof, math, terms) → CTA

**Grade it on**
- Is there a genuine emotional reason to act now?
- Is there enough logic to justify the decision to a skeptical part of the reader (or their boss/spouse)?

**Fails when**
- All logic, no desire (nothing pulls the reader to act)
- All hype, no justification (buyer's remorse, refunds)
- Leading emotional to a rational enterprise buyer

**Stacks with:** awareness-routing, objection-preemption


## Enter the Conversation in Their Mind

`enter-the-conversation` · v1.0.0 · source: Copywriting principles (Eugene Schwartz / Robert Collier (enter the conversation already in the prospect's mind)) applied per DivineX

**Purpose.** Align the message with the desire and internal conversation already happening in the prospect's head. Copy channels existing hopes, fears, and dreams onto the offer; it doesn't manufacture new desire.

**Use when**
- Setting the opening angle of any page
- Choosing which existing desire/fear the offer attaches to

**Do NOT use when**
- Genuinely novel categories with no existing desire to tap. There you must first educate the desire into existence

**Needs**
- audience.primaryPain / desiredOutcome / fears / motivations
- audience.awareness

**Decision rules**
- Find the conversation already occurring in the prospect's mind and enter it, don't start a new one.
- Copy cannot create desire; it channels the hopes, dreams, fears, and desires the prospect already has onto this offer.
- The more aware the prospect, the closer to the offer you open; the less aware, the more you meet them at the problem/desire.
- Mirror the prospect's own words for their problem and outcome, not industry jargon.

**Works through**
- Relevance: a message that matches the reader's current thought feels meant for them
- Least resistance: attaching to an existing desire is far cheaper than creating one

**Structure**
- Identify the live internal conversation (desire + fear) → enter at the matching awareness level → attach the mechanism to that existing desire

**Grade it on**
- Does the opening match a thought the prospect is already having?
- Is it in the prospect's language, not the company's?
- Does it tap an existing desire rather than trying to invent one?

**Fails when**
- Company-centric opening ('We are a leading…') that ignores the reader's conversation
- Jargon the prospect wouldn't use
- Trying to manufacture a desire that isn't there

**Stacks with:** awareness-routing, hook-types, one-argument


## Core Human Motivations

`emotional-motivations` · v1.0.0 · source: Copywriting principles (Robert Collier's human motivations; identity projection), applied per DivineX

**Purpose.** Anchor the offer to the primal driver that actually moves this audience (then justify it rationally) instead of listing features and hoping logic sells.

**Use when**
- Deciding the dominant emotional angle of a campaign
- Choosing which drive the headline + story lean on

**Do NOT use when**
- Never skip identifying the driver, but don't stack all of them; pick the dominant one

**Needs**
- audience.motivations
- audience.fears
- the transformation the offer delivers

**Decision rules**
- Identify the ONE dominant human motivation for this audience, commonly: gain, fear/self-preservation, pride/status, love/belonging, duty, or self-indulgence.
- Lead the copy with that emotional driver; supply the rational justification near the decision point.
- A single, deeply-felt driver beats a shallow appeal to several.
- Attach the driver to a concrete, physical picture of the outcome (identity projection), not an abstract benefit.

**Works through**
- Decisions are made emotionally and justified rationally
- Identity projection: people buy the version of themselves the offer implies

**Structure**
- Name the dominant drive → dramatize it with a physical outcome → justify rationally → CTA

**Grade it on**
- Is there a clear dominant emotional driver, not a scattered mix?
- Is the drive tied to a concrete outcome/identity?
- Is there rational justification to close?

**Fails when**
- Feature lists with no emotional driver
- Appealing to every motivation shallowly
- Emotion with no logical justification (buyer's remorse / refunds)

**Stacks with:** emotion-then-justification, value-equation-lens, feature-to-benefit-ladder


---

# Offer


## Offer Value Stack

`offer-value-stack` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) + established offer-stacking practice, bounded by the DivineX no-fabrication rule

**Purpose.** Present the offer as a stack of the operator's REAL deliverables, each with an honest value, so the total dwarfs the price, making the price feel like a discount on the value.

**Use when**
- Priced offers (tripwire, course, high-ticket, productized service)
- The offer section of a sales page or VSL

**Do NOT use when**
- Free lead magnets (nothing to price-anchor)
- When the deliverables are thin. Do not pad the stack with invented bonuses or fake values
- Ultra-premium/luxury positioning where itemized 'value' cheapens the brand

**Needs**
- offer.productOrService
- the REAL list of deliverables/bonuses
- offer.priceCents
- an honest value for each item

**Decision rules**
- Every stack item must be a REAL deliverable the buyer actually receives, never invented to inflate the total.
- Anchor each item's value against a real comparable (what the buyer would pay to get it elsewhere), not a made-up number.
- Sum to a genuine total value, then reveal the price beneath it, the gap does the persuading.
- Bonuses should solve the NEXT objection the buyer has after the core offer, not just add bulk.
- Pair the stack with a real guarantee to collapse the remaining risk.

**Works through**
- Price is judged relative to an anchor
- Itemization makes abstract value concrete
- Reciprocity and completeness raise perceived fairness

**Structure**
- Core deliverable (value) → supporting deliverables (values) → objection-solving bonuses (values) → total value → price reveal → guarantee → CTA

**Grade it on**
- Is every item real and actually delivered?
- Are the values defensible against real comparables, not fabricated?
- Does each bonus solve a specific next objection?

**Fails when**
- Fabricated bonuses or inflated/round 'values' with no basis (a verification failure)
- A stack of filler that pads the total without adding real value
- Value stacking a luxury offer into feeling cheap

**Stacks with:** value-equation-lens, honest-risk-reversal, feature-to-benefit-ladder, honest-urgency


## Honest Risk Reversal

`honest-risk-reversal` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file), bounded by the DivineX no-fabrication rule

**Purpose.** Move the risk of the transaction from the buyer to the business with a guarantee the business genuinely offers, so 'what if it doesn't work' stops blocking the sale.

**Use when**
- Any priced offer
- High-skepticism markets
- After the offer, before the final CTA

**Do NOT use when**
- When the business does NOT actually offer a guarantee, never invent one; use proof and a smaller first commitment instead

**Needs**
- offer.guarantee (real, in the operator's own terms)

**Decision rules**
- Only state a guarantee the operator confirmed they honor. This is a legal and trust commitment, never fabricated.
- The stronger and more specific the guarantee, the more it converts, but it must be real.
- Name the exact terms (what, how long, how to claim) so it reads as a real promise, not marketing air.
- If no guarantee exists, reduce risk another honest way: a smaller first step, a trial, or transparent proof.

**Works through**
- Loss aversion, buyers fear wasting money more than they desire the gain
- A confident guarantee signals the seller's belief in the product

**Structure**
- Name the risk the buyer feels → state the real guarantee and its exact terms → make claiming it easy → return to the CTA

**Grade it on**
- Is the guarantee one the operator actually offers?
- Are the terms specific enough to be believed and honored?

**Fails when**
- Inventing a guarantee the business won't honor (a verification and legal failure)
- Vague 'satisfaction guaranteed' with no terms
- Burying the guarantee where the anxious buyer won't see it

**Stacks with:** offer-value-stack, objection-preemption, single-cta-clarity


## Honest Urgency & Scarcity

`honest-urgency` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file), bounded by the DivineX no-fabrication rule

**Purpose.** Give the reader a real reason to act now instead of later, using only genuine deadlines, limits, or costs of delay.

**Use when**
- Enrollment windows, real capacity limits, genuine price changes, seasonal relevance
- Near the CTA

**Do NOT use when**
- When no genuine urgency exists. Do NOT fabricate countdowns, fake scarcity, or invented deadlines

**Needs**
- offer.urgency (real)
- any genuine deadline/limit/cost-of-delay

**Decision rules**
- Only use urgency that is TRUE: a real close date, real limited capacity, a real upcoming price change, or the genuine cost of staying stuck.
- The cost-of-delay (what staying in the problem keeps costing) is the most durable and always-honest form of urgency.
- Never reset a fake countdown or claim a scarcity the business doesn't have. It destroys trust and creates liability.

**Works through**
- Scarcity increases perceived value
- A deadline converts intention into action
- Loss framing (cost of delay) motivates more than gain framing

**Structure**
- Establish the real constraint or cost of delay → make it concrete → tie it to the CTA (act before X)

**Grade it on**
- Is the urgency literally true?
- Would it survive a customer asking 'is this deadline real?'

**Fails when**
- Fake countdown timers and invented scarcity (a verification failure and a trust killer)
- Manufactured pressure with no real basis
- Urgency with no consequence stated (a deadline for nothing)

**Stacks with:** offer-value-stack, single-cta-clarity


---

# Landing page


## Page Architecture by Intent

`page-architecture-by-intent` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) + DivineX funnel frameworks (lib/funnels/frameworks.ts)

**Purpose.** Select the page's structure, length, and section set from the campaign objective, traffic temperature, and awareness, so commitment level drives architecture, not habit.

**Use when**
- The first decision of any landing-page build. Before any copy is written
- Mapping a strategy to a funnel genre + section sequence

**Do NOT use when**
- Never skip, even a one-fold page is a deliberate architecture choice

**Needs**
- context.objective
- context.temperature
- audience.awareness
- offer.priceCents (free vs priced)

**Decision rules**
- Match page length to commitment: a free lead magnet earns a one-fold page; a card-number ask (paid tripwire/high-ticket) earns the full problem→proof→guarantee runway.
- lead_generation / lead_magnet → short, one hero + capture; minimal persuasion runway.
- appointment / consultation → outcome hero + who-it's-for + process + proof + booking.
- application (qualify-first) → hero + who-it's-for + who-it's-NOT-for + process + results + application.
- free_trial (SaaS) → outcome hero + product proof (mockups) + how-it-works + trial CTA; light on emotional runway.
- audit_request → problem hero + what-you'll-learn + credibility + request form.
- webinar_registration → hero + agenda + benefits + host + register.
- purchase (tripwire/sales) → hero + problem/solution + mechanism + proof + offer stack + guarantee + FAQ.
- Cold traffic needs more problem-education up top; hot traffic can jump toward the offer.
- Prefer reusable layout blocks (cards, grids, timelines, comparisons) over walls of text.

**Works through**
- Persuasion runway should scale with the size of the ask
- Structure itself communicates seriousness and fit

**Structure**
- Objective + temperature + awareness → funnel genre → ordered section set → CTA cadence → form placement

**Grade it on**
- Could a strategist explain why each section exists for THIS objective?
- Is the page length proportional to the commitment being asked?
- Would two different objectives produce visibly different architectures? (If a dentist and a SaaS get the same skeleton, fail.)

**Fails when**
- Forcing every campaign into one fixed sequence
- A long sales page for a free download (or a one-fold page for a $5k ask)
- Section order that ignores awareness/temperature

**Stacks with:** awareness-routing, single-cta-clarity, post-conversion-sequence-design


---

# Email


## Post-Conversion Sequence Design

`post-conversion-sequence-design` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file) + DivineX workflow engine (lib/workflows)

**Purpose.** Design the email sequence that fires AFTER conversion from the same strategy as the page, with length and timing set by the objective, and a state transition that stops the sequence the moment the goal is met.

**Use when**
- Every campaign with a follow-up (lead, appointment, trial, audit, purchase)
- Deciding sequence length + cadence + exit conditions

**Do NOT use when**
- Pure transactional confirmations with no nurture goal (a receipt is not a sequence)

**Needs**
- context.objective
- conversionEvent
- the goal state that should STOP the sequence
- centralPromise (for message match)

**Decision rules**
- The sequence continues the PAGE's promise and mechanism, same central promise, no new positioning invented in email.
- Set length/timing from objective, not habit: lead nurture runs longer and educates; an appointment sequence is short and reduces no-shows; a trial sequence is paced to activation milestones.
- Every email must ADVANCE the conversation. Email 2 is never email 1 reworded.
- Define the stop condition up front: booking booked → stop booking nurture; purchase made → stop sales sequence; unsubscribe → stop all marketing; no-show → branch to a no-show flow.
- Map the emotional/awareness journey across the sequence: deliver value → set expectations → educate → handle objections → prove → offer → follow up.

**Works through**
- Consistency: the follow-up must match the promise that converted them, or trust breaks
- Progress: each touch must move the relationship forward to keep attention

**Structure**
- Immediate value/confirmation → expectation-setting → education → mechanism → objection handling → proof → offer/CTA → paced follow-up, with explicit branch + stop conditions

**Grade it on**
- Does the sequence continue the page's exact promise (message match)?
- Does each email advance rather than repeat?
- Is there an explicit convert-and-stop transition so no one is stuck in the wrong sequence?

**Fails when**
- Email 2 rehashing email 1
- A different promise/positioning than the landing page (message-match break)
- No stop condition, a converted buyer keeps getting sold, or a booked lead keeps getting booking nudges
- Fixed sequence length regardless of objective

**Stacks with:** single-idea-email, page-architecture-by-intent, objection-preemption


## Single-Idea Email

`single-idea-email` · v1.0.0 · source: DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)

**Purpose.** Build each email around one idea, one CTA, and one intended next state, so it's read, understood, and acted on.

**Use when**
- Every email in a sequence
- Broadcasts and nurtures alike

**Do NOT use when**
- Rich transactional receipts/statements where completeness matters more than a single idea

**Needs**
- the email's objective
- recipient state
- the one idea
- the one CTA

**Decision rules**
- One idea per email; if there are two, it's two emails.
- Subject + preview earn the open together, generate several subject candidates and pick the strongest, don't ship the first.
- Open with the reader's world, not the sender's ('Hope you're well' / 'Just checking in' / 'We wanted to reach out' are banned unless context truly calls for them).
- One clear CTA tied to the sequence's next state.

**Works through**
- Cognitive load: one idea is remembered and acted on; five are ignored
- Curiosity + relevance in the subject drive the open

**Structure**
- Subject (tested) + preview → relevant opening → one useful idea → one CTA → sign-off that sets up the next email

**Grade it on**
- Is there exactly one idea and one CTA?
- Would the subject earn an open in a full inbox?
- Does the opening speak to the reader, not the sender?

**Fails when**
- Multiple competing ideas/CTAs
- Filler openings ('just checking in')
- Shipping the first subject line without alternatives
- No clear next action

**Stacks with:** post-conversion-sequence-design, single-cta-clarity
