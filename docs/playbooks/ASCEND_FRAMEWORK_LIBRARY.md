# Ascend Framework Library

The institutional knowledge Zeno reasons from on the Ascend side. Extracted verbatim from `artifacts/api-server/src/scripts/seedFrameworks.ts`, which seeds the Postgres `frameworks` table and is synced into Flow at `intelligenceFrameworks/{slug}`.

## Contents

- **DivineX Business Framework** (`divinex-business`, core): The master operating system for building a scalable, profitable coaching or consulting business. Every strategy, asset, and recommendation must align with the six pillars: Clarity, Positioning, Offer, Traffic, Conversion, and Ascension.
- **CRO Audit Framework** (`cro-audit`, conversion): A systematic conversion rate optimization methodology for landing pages, funnels, and websites. Evaluates Headline, Value Proposition, Social Proof, CTA, Trust Signals, and Friction to produce an actionable score and prioritized fix list.
- **Funnel Recommendation Framework** (`funnel-recommendation`, funnels): Determines the optimal funnel architecture for a business based on price point, audience temperature, trust level, and transformation complexity. Maps each business type to one of five core funnel blueprints.
- **Offer Evaluation Framework** (`offer-evaluation`, offers): Evaluates any offer across six dimensions to determine its market strength, pricing power, and conversion potential. Identifies specific gaps to close before going to market.
- **Lead Magnet Recommendation Framework** (`lead-magnet-recommendation`, lead-generation): Selects the optimal lead magnet type for a business based on audience sophistication, niche, and funnel goal. Maps each business context to one of six proven lead magnet formats with implementation guidance.
- **DivineX Copy Framework** (`divinex-copy`, copywriting): The master copywriting system used across all DivineX-generated assets. Every piece of copy must pass the five-filter test: Specificity, Emotion, Proof, Urgency, and CTA Clarity.
- **DivineX Brand Voice Framework** (`divinex-brand-voice`, brand): Defines the tone, personality, vocabulary, and communication style for all DivineX-generated content. Ensures consistency across every touchpoint: emails, social posts, sales pages, and coaching content.

---

<!-- slug: divinex-business | category: core -->

## DivineX Business Framework

### Core Principle
Every business decision flows through six interconnected pillars. Weakness in any one pillar creates a ceiling on growth. Identify the constraint, fix it, then ascend.

### The Six Pillars

**1. Clarity**
- Crystal-clear Ideal Client Avatar (ICA): demographics, psychographics, pain points in their own words
- Defined transformation: from [BEFORE STATE] to [AFTER STATE] with measurable outcomes
- Niche specificity: the more specific, the stronger the positioning

**2. Positioning**
- Unique Mechanism: the named, proprietary method that delivers the transformation
- Competitive differentiation: why this beats every alternative they've already tried
- Authority stack: proof, credentials, case studies, social proof

**3. Offer**
- Irresistible core offer: outcome-focused, not feature-focused
- Value ladder: Lead Magnet → Low-Ticket → Core → Premium → Continuity
- Pricing anchored to transformation value, not time or deliverables

**4. Traffic**
- Primary traffic channel selected and mastered before diversification
- Content strategy aligned to ICA's watering holes
- Lead generation systems that run without daily manual intervention

**5. Conversion**
- Sales process mapped from awareness to decision
- Objection handling built into the funnel, not just the sales call
- Follow-up sequences that convert the 80% who don't buy immediately

**6. Ascension**
- Client success systems that generate referrals and testimonials
- Upsell and retention strategies baked in from day one
- Recurring revenue component in every offer stack

### Application Rule
Before generating any strategy or asset, identify which pillar it serves and ensure it solves the client's highest-leverage constraint, not just the loudest symptom.

---

<!-- slug: cro-audit | category: conversion -->

## CRO Audit Framework

### Core Principle
Every page has one job. If it's not converting, the answer is always in the gap between what the visitor expects and what the page delivers. Diagnose the gap; prescribe the fix.

### The Six Conversion Pillars

**1. Headline (25% weight)**
- Does it speak directly to the ICA's #1 pain or desire?
- Is it specific enough to be believable?
- Does it make a clear promise within 5 seconds?
- Red flags: generic industry buzzwords, feature-first language, clever over clear

**2. Value Proposition (20% weight)**
- Is the transformation outcome stated explicitly?
- Is there a Unique Mechanism that makes this different?
- Does it answer "Why you, why now, why this price?"
- Red flags: vague benefits, no differentiation from competitors

**3. Social Proof (20% weight)**
- Specific, outcome-focused testimonials (not "they were great to work with")
- Numbers, timeframes, and before/after results
- Logos, media mentions, case study snippets
- Red flags: generic praise, no specifics, no recency signals

**4. Call to Action (15% weight)**
- Single, dominant CTA per page (no competing actions)
- Outcome-focused button text ("Get My Free Strategy" not "Submit")
- Positioned above fold AND after key proof sections
- Red flags: multiple competing CTAs, weak verb choices, buried placement

**5. Trust Signals (10% weight)**
- Security badges, guarantee statements, money-back language
- Privacy policy, refund terms easily findable
- Author bio and credentials visible
- Red flags: anonymous page, no guarantee, no contact information

**6. Friction (10% weight)**
- Form field count (≤3 is optimal for cold traffic)
- Page load speed and mobile responsiveness
- Unclear next steps after opt-in or purchase
- Red flags: long forms, slow load, confusing UX flow

### Scoring
- 85-100: High performer, optimize for scale
- 70-84: Good, fix 1-2 priority items then test
- 50-69: Moderate, systematic rebuild recommended
- Below 50: Full rewrite required before driving traffic

### Application Rule
Score each pillar independently. Lead with the two lowest-scoring pillars in all recommendations. Never recommend traffic increases to a page scoring below 60.

---

<!-- slug: funnel-recommendation | category: funnels -->

## Funnel Recommendation Framework

### Core Principle
The right funnel for a business is determined by four variables: price point, audience temperature, trust required, and transformation complexity. Forcing the wrong funnel type is the #1 reason funnels fail.

### The Five Core Funnel Blueprints

**1. Lead Magnet → Email Nurture → Application**
- Best for: High-ticket offers ($3k+), cold audiences, complex transformations
- Trust required: High (multiple touchpoints before sale)
- Timeline to sale: 3-21 days
- Key assets: Lead magnet, 5-7 email nurture sequence, application form, discovery call

**2. VSL (Video Sales Letter) → Order Form**
- Best for: Mid-ticket ($500-$3k), warm-ish audiences, clear tangible outcome
- Trust required: Medium (video does the trust-building)
- Timeline to sale: Same session to 48 hours
- Key assets: VSL script, order page, upsell bump, thank you sequence

**3. Webinar → Pitch → Checkout**
- Best for: $997-$5k offers, education-first audiences, complex methodology
- Trust required: Medium-high (90-min relationship building)
- Timeline to sale: Within 24 hours of webinar
- Key assets: Registration page, webinar deck, pitch sequence, replay page

**4. Free + Shipping → Low-Ticket → Core Offer**
- Best for: Physical-adjacent digital products, impulse buyers, building buyer lists
- Trust required: Low (minimal commitment entry point)
- Timeline to sale: Immediate + 7-day ascension
- Key assets: Free offer page, OTO sequence, email ascension, core offer page

**5. Free Community → Content → Launch**
- Best for: High-trust communities, course creators, B2C with large audiences
- Trust required: Very high (community-based trust)
- Timeline to sale: Launch cycles (30-90 days)
- Key assets: Community platform, content calendar, launch sequence, sales page

### Selection Matrix
| Price Point | Audience Temp | Recommended Funnel |
|-------------|---------------|-------------------|
| $10k+       | Cold          | Lead Magnet → Application |
| $3k-$10k    | Warm          | VSL or Webinar |
| $1k-$3k     | Any           | VSL or Webinar |
| Under $1k   | Cold          | Lead Magnet → Email |
| Under $1k   | Warm          | VSL → Order Form |

### Application Rule
Always recommend ONE funnel type per business stage. Never recommend building multiple funnels simultaneously. Funnel clarity beats funnel complexity.

---

<!-- slug: offer-evaluation | category: offers -->

## Offer Evaluation Framework

### Core Principle
A weak offer cannot be saved by great copy or heavy traffic spend. Evaluate the offer first. Fix the offer before fixing the funnel.

### The Six Offer Dimensions

**1. Outcome Clarity (20% weight)**
- Is the end result specific, measurable, and time-bound?
- Can the prospect visualize exactly where they'll be after buying?
- Is the outcome stated in the prospect's language, not yours?
- Strong: "Book 3-5 qualified sales calls per week within 30 days"
- Weak: "Grow your business and get more clients"

**2. Unique Mechanism (20% weight)**
- Is there a named, proprietary system, method, or process?
- Does the mechanism explain WHY this works when other attempts failed?
- Is it defensible. Something competitors can't easily copy?
- Strong: The "DivineX 6-Pillar Growth System", a specific named framework
- Weak: "I use proven strategies and tactics"

**3. Risk Reversal (15% weight)**
- Is there a money-back guarantee? Time period? Conditions?
- Does the guarantee language increase desire or just reduce friction?
- Bold offers use performance guarantees; timid offers use satisfaction guarantees
- Best practice: 30-day results guarantee backed by proof of client outcomes

**4. Value Stack (15% weight)**
- Are all deliverables named, described, and individually valued?
- Does the stack make the price feel like a bargain against total value?
- Is there a bonus that solves the #1 objection?
- Formula: Core + Bonus 1 (objection killer) + Bonus 2 (speed) + Bonus 3 (accountability) + Guarantee

**5. Pricing Anchoring (15% weight)**
- Is price anchored to outcome value, not time or effort?
- Is there a visible "compare to" reference that makes the price rational?
- Are payment plans structured to reduce psychological friction?
- Rule: Price should be 1/10th to 1/5th of the annual value of the outcome

**6. Social Proof Alignment (15% weight)**
- Do existing testimonials specifically validate the claimed outcome?
- Is there a case study that mirrors the ideal buyer's situation?
- Are results recent (within 12 months) and verifiable?

### Scoring
- 85-100: Launch-ready offer
- 70-84: Strengthen 1-2 dimensions before major traffic push
- 50-69: Requires offer revision before launch
- Below 50: Return to ICA research and offer redesign

### Application Rule
Never recommend increasing ad spend or traffic to an offer scoring below 70. Fix the offer first.

---

<!-- slug: lead-magnet-recommendation | category: lead-generation -->

## Lead Magnet Recommendation Framework

### Core Principle
A lead magnet has one job: attract the highest-intent subset of your ICA and earn the right to continue the conversation. Generic lead magnets attract low-intent leads. Specific lead magnets attract buyers.

### The Lead Magnet Selection Matrix

**1. Diagnostic / Quiz / Scorecard**
- Best for: Coaching, consulting, B2B services, complex problems
- Why it works: Self-diagnosis creates awareness of the problem's severity and positions you as the expert with the solution
- Conversion rate: High (interactive = high engagement)
- Implementation: 8-12 questions, personalized results page, segment-based follow-up
- Example: "What's Your #1 Business Growth Bottleneck? (2-min Assessment)"

**2. Cheat Sheet / Quick Reference Guide**
- Best for: B2B, SaaS, productivity niches, experienced audiences
- Why it works: Sophisticated audiences want tools, not education; a cheat sheet respects their time
- Conversion rate: High (low commitment, immediate utility)
- Implementation: 1 page, highly specific, immediately actionable
- Example: "The 7-Point Facebook Ad Audit Checklist"

**3. Template / Swipe File**
- Best for: Marketing, copywriting, sales, content creation niches
- Why it works: Done-for-you tools are more valuable than education for tactical audiences
- Conversion rate: Very high (perceived high value, zero effort to use)
- Implementation: Plug-and-play format, branded, includes brief usage instructions
- Example: "5 Proven Email Sequences That Generated $2M+ (Copy-Paste Ready)"

**4. Mini-Training / Video Series**
- Best for: High-ticket offers, complex methodologies, trust-required niches (finance, health, relationships)
- Why it works: Extended value delivery builds deep trust before the pitch
- Conversion rate: Medium (requires commitment to consume)
- Implementation: 3-5 videos, 10-20 min each, daily delivery via email
- Example: "The 5-Day Authority Accelerator (Free Video Training)"

**5. Free Audit / Assessment Call**
- Best for: Service businesses, agencies, high-ticket consulting
- Why it works: Gives the prospect a custom deliverable while giving you a qualified sales conversation
- Conversion rate: Low volume, very high close rate
- Implementation: 20-30 min structured call with a deliverable report or scorecard
- Example: "Free 30-Min Website CRO Audit ($500 value)"

**6. Report / Research / Data Study**
- Best for: B2B, thought leadership positioning, corporate buyers
- Why it works: Data confers authority and creates urgency around a problem the audience didn't know was this bad
- Conversion rate: Medium
- Implementation: 8-20 pages, proprietary data or synthesized research, branded
- Example: "The State of Online Course Completion: 2024 Data Report"

### Selection Rules
1. Match sophistication: beginners want education; experts want tools
2. Match intent: cold traffic needs low commitment; warm traffic accepts higher commitment
3. One lead magnet per funnel, never offer choices on a lead magnet page
4. The lead magnet must solve a micro-problem that creates desire for the macro-solution (your paid offer)

### Application Rule
Always specify the exact lead magnet title format: "[Specific Outcome] for [Specific ICA] in [Timeframe or Situation]". Vague titles kill opt-in rates.

---

<!-- slug: divinex-copy | category: copywriting -->

## DivineX Copy Framework

### Core Principle
Copy converts when it makes the reader feel understood before it makes them feel sold to. Write to one person. Solve one problem. Make one offer.

### The Five Copy Filters

Every line of copy must pass as many of these five filters as possible. Great copy passes all five simultaneously.

**Filter 1: Specificity**
- Replace every vague word with a specific one
- Weak: "Get more clients" → Strong: "Book 3-5 qualified discovery calls per week"
- Weak: "Make more money" → Strong: "Add $10k/month in recurring revenue within 90 days"
- Weak: "A proven system" → Strong: "The 6-step DivineX Acquisition Engine"
- Rule: If a competitor could say the same thing, it's not specific enough

**Filter 2: Emotion**
- Lead with the pain, amplify it, then offer relief
- Use the reader's exact language (mined from reviews, DMs, comments)
- Emotional sequence: Problem Acknowledgment → Agitation → Hope → Solution
- Forbidden phrases: "synergy", "leverage", "world-class", "proven", "innovative"
- Required: Stories, specifics, and sensory language that makes the reader nod

**Filter 3: Proof**
- Every claim needs evidence: numbers, testimonials, case studies, screenshots
- Hierarchy of proof: Specific case study > Named testimonial > Anonymous testimonial > Your own claim
- Micro-proof throughout: Don't save all proof for the testimonial section
- Rule: Make one claim, then immediately prove it. Repeat for every major claim.

**Filter 4: Urgency**
- Honest urgency only: deadlines, cohort limits, price increases that are real
- No fake countdown timers or false scarcity
- Allowed urgency mechanisms: Cohort start dates, bonuses with real expiry, limited spots, price lock periods
- Frame urgency around opportunity cost: "Every month you wait, [specific loss]"

**Filter 5: CTA Clarity**
- One action per piece of copy
- Outcome-based button/link text: "Get My Free Strategy Session" not "Submit"
- Reduce friction in the ask: tell them exactly what happens next
- Repeat the CTA: beginning, middle (for long copy), end

### Headline Formula
**[Specific Outcome] for [Specific ICA] [Without/Even If] [Biggest Objection] in [Timeframe]**
Example: "How Coaches Book 3-5 Discovery Calls Per Week Without Running Paid Ads or Dancing on TikTok, in 30 Days or Less"

### The Copy Stack (in order)
1. Headline. Makes a specific promise to a specific person
2. Subheadline, reinforces or adds proof
3. Lead, agitate the problem, establish you understand it
4. Story bridge, why you/this solution exists
5. Solution reveal, introduce the mechanism
6. Proof, case studies, testimonials, data
7. Offer breakdown, what they get, value stack
8. Risk reversal, guarantee
9. Urgency/Scarcity, honest reason to act now
10. CTA, single, clear, outcome-based action

### Application Rule
Read every draft aloud. Anything that sounds like a brochure, re-write it. Copy should sound like a smart friend giving advice, not a corporate pitch deck.

---

<!-- slug: divinex-brand-voice | category: brand -->

## DivineX Brand Voice Framework

### Core Principle
Brand voice is the consistent personality that shows up in every piece of communication. It builds recognition, trust, and differentiation. Inconsistent voice = forgettable brand.

### The DivineX Voice Attributes

**1. Direct Without Being Harsh**
- Say the true thing, even when it's uncomfortable
- No corporate softening ("it might be worth considering") → Say it straight ("this is what's blocking you")
- No toxic positivity, acknowledge hard truths before offering solutions
- Tone reference: A respected mentor who tells you what you need to hear, not what you want to hear

**2. Confident Without Arrogance**
- Never hedge on what works: "This will..." not "This might..."
- Position expertise through specificity, not self-proclamation
- Avoid: "In my humble opinion", "I think", "You might want to"
- Use: "Here's what the data shows", "What works is...", "The answer is..."

**3. Sophisticated Without Jargon**
- No marketing buzzwords: "synergy", "leverage", "thought leader", "disruptive", "game-changer"
- Use plain English that a smart 16-year-old could understand
- Technical terms are allowed when the audience is technical, define them once, then use them freely
- The goal: intellectual respect without academic gatekeeping

**4. Warm Without Being Soft**
- Empathy for the struggle: acknowledge the difficulty before demanding action
- Celebration of wins: genuine, specific, proportionate
- No empty cheerleading ("You've got this! You're amazing!")
- Real warmth: "That's a genuinely hard problem. Here's what actually works."

**5. Urgent Without Being Manipulative**
- Urgency rooted in opportunity cost, not artificial scarcity
- Allowed: "Every week you delay this fix costs you approximately [amount]"
- Forbidden: Fake countdown timers, false "only 3 spots left" when there are 30

### Vocabulary Guide

**Use these words:**
- Strategy, system, framework, mechanism, constraint, bottleneck, leverage point, conversion, acquisition, transformation, outcome, specificity, proof, positioning, clarity

**Avoid these words:**
- Amazing, incredible, awesome, game-changer, disruptive, synergy, world-class, proven (without proof), secrets, tricks, hacks, guru, ninja, rockstar

### Format Rules
- Sentences: Short to medium. Max 2 lines before a line break.
- Paragraphs: Max 3-4 sentences in long-form content
- Lists: Prefer bullets over numbered lists unless sequence matters
- Headers: Direct and specific, "The 3 Funnel Mistakes Killing Your Conversions" not "Funnel Optimization Tips"
- Emphasis: Bold for the most important phrase in each section. Italics sparingly.

### Voice in Different Contexts
- **Sales copy**: Direct, proof-heavy, urgency-aware, single CTA
- **Email nurture**: Warm, story-led, insight-first, soft CTA
- **Social content**: Hook-first, controversy-adjacent, value-dense, engagement-inviting
- **Coaching content**: Mentor voice, structured, challenge + solution, accountability-focused
- **Reports/Audits**: Authoritative, specific, evidence-based, action-oriented

### Application Rule
Before publishing any content, read it aloud and ask: "Does this sound like a brilliant, honest friend who happens to be an expert, or does it sound like a marketing department?" Rewrite until it sounds like the former.