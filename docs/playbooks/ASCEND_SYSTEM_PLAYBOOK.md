# Ascend Playbook

**What Ascend is:** the intelligence layer. It looks at a business, scores it,
names the one thing holding it back, and writes the plan to fix it.

Everything below is pulled from the running system, not from a whiteboard.
Where a number or a rule appears here, it is the number the code actually uses.

Source of record:
`DivineX-Business-Intelligence/artifacts/api-server/src/` (growthEngine,
growthScanEngine, zenoPromptEngine, aqaVerifier, aqaQualityCritic,
frameworkContext, seedFrameworks, seedKnowledge, seedPatterns) and
`docs/marketing-frameworks/`.

---

## 1. The six pillars

The master operating system. Every strategy, asset and recommendation is
checked against these. Weakness in any one pillar sets a ceiling on growth, so
the job is always: find the binding constraint, fix it, then ascend.

| Pillar | What it governs |
|---|---|
| **Clarity** | Ideal client avatar in their own words. A defined before-state and after-state with measurable outcomes. Niche specificity. |
| **Positioning** | The unique mechanism, named. Why this beats the alternatives they have already tried. The authority stack. |
| **Offer** | What is sold, to whom, at what price, with what proof and what risk reversal. |
| **Traffic** | How strangers arrive, and whether the arrival matches the promise. |
| **Conversion** | Whether arrival becomes action. |
| **Ascension** | What happens after the first yes. |

The pillars are a diagnostic order, not a checklist. A business with broken
Clarity cannot be fixed by spending on Traffic, and the scan is built to say so
rather than sell the easier fix.

---

## 2. The Growth Score

Nine categories, weighted. The composite is what the customer sees as their
Growth Score.

| Category | Weight |
|---|---|
| Lead generation | 20% |
| Sales | 20% |
| Offer | 15% |
| Marketing | 15% |
| Website | 10% |
| Content | 10% |
| Authority | 5% |
| Automation | 5% |
| Business clarity | 0% (scored, excluded from the composite) |

**Business clarity carries 0% of the composite but 10% of the bottleneck
ranking.** That asymmetry is deliberate. Clarity is upstream of everything, so
it must be able to surface as the thing to fix first without dragging the
headline score around when a business simply has not written its positioning
down yet.

### Growth stages

| Score | Stage |
|---|---|
| 80+ | Scale |
| 60 to 79 | Optimization |
| 40 to 59 | Growth |
| under 40 | Foundation |

The stage sets the register of the advice. A Foundation business is told to
build one thing. A Scale business is told what to optimise.

---

## 3. The framework library

Seven curated frameworks, versioned in git, seeded into Postgres and loaded
into every reasoning call. They are principles with decision rules, not
templates.

| Framework | Category | What it decides |
|---|---|---|
| DivineX Business Framework | core | The six pillars. The lens on everything else. |
| CRO Audit Framework | conversion | How a page is graded, and in what order. |
| Funnel Recommendation Framework | funnels | Which funnel shape fits which business model. |
| Offer Evaluation Framework | offers | Whether an offer is worth running traffic at. |
| Lead Magnet Recommendation Framework | lead-generation | What to give away, and why that thing. |
| DivineX Copy Framework | copywriting | How the words are built. |
| DivineX Brand Voice Framework | brand | How it sounds. |

Alongside them sit the **recommendation patterns**: real corrections from real
audits, each carrying an industry, a constraint, the winning funnel, lead
magnet and offer, and a confidence score. These exist because the model was
wrong in a specific, traceable way and the correction was worth keeping.

> The window-and-door pattern is the archetype. The AI flagged "add a quote
> form above the fold" on a site that already had a quote form in the nav and a
> sticky form on every page. The real finding was CTA hierarchy confusion. The
> pattern now tells the engine: for home services, always check for existing
> CTAs before recommending new ones.

**The rule that pattern encodes: never recommend adding a thing that already
exists. Evaluate its quality instead.**

---

## 4. The funnel-model rule

The single most load-bearing correction in the scan engine. Infer the business
MODEL from the site first, then describe the journey that fits that model,
using the business's own service names.

| Model | Journey |
|---|---|
| SaaS / software | Landing, start free trial or book demo, onboarding, activation, paid plan |
| Ecommerce / physical | Traffic, product page, add to cart, checkout, post-purchase upsell and email |
| Local service | Search, service page, request estimate or book, consultation, job booked |
| Coaching / courses / info | Webinar or workshop, or application |
| Agency / high-ticket | Strategy call, proposal, engagement |

The consulting journey (lead magnet, nurture, sales call, proposal, retainer)
is correct for agencies and high-ticket done-for-you work **only**. Defaulting
every business to it is the failure this rule exists to prevent.

---

## 5. AQA: the quality pipeline

A scan is not trusted because a model wrote it. It is trusted because it
survived the pipeline.

| Stage | What it does |
|---|---|
| 1 to 2 | Crawl and generate. |
| 3 and 4 | Deterministic verification of finished findings against the crawler's verified facts. Rules, not judgment. |
| 5 | **The AI verifier.** A separate, more capable model (Sonnet auditing Haiku's output) whose only job is to strip or hedge anything not grounded in the crawl. It never writes new content. |
| 6 | **The quality critic.** Grades each finding, returns 0 to 100 plus the weak sections. |
| 7 | **Targeted regeneration.** Rewrites only the sections Stage 6 marked weak. Never the whole report. |

Two design decisions worth preserving:

**A different model for the audit.** The generator's blind spots are not the
verifier's. Using the same model to check its own work buys very little.

**Best-effort, never blocking.** Any stage failing returns its input unchanged.
The report still ships, already gated by the deterministic stages, just without
that run's extra audit. Quality degrades, it does not fail closed on the
customer.

### What the scan may never claim

A website scan observes a website. It cannot see what happens after the visitor
leaves. The engine is explicitly forbidden from claiming whether an email
nurture or retargeting sequence exists, because that is off-site and
unobservable. Post-click clarity **is** observable from on-site copy, and is
fair game.

This is the general principle: **evidence bounds the claim.**

---

## 6. The blueprint

What Zeno produces on the Ascend side, in order:

1. **Positioning**: who you help, the problem, the core transformation, the unique positioning, mission, brand statement
2. **Niche statement**, versioned
3. **Offers**: name, price range, deliverables, outcome, best buyer, why it fits
4. **Lead magnets**
5. **Funnel strategy**
6. **VSL outline**
7. **Email sequence**
8. **Content plan**
9. **Roadmap**

The order is the dependency chain. Offers that are written before positioning
are guesses.

---

## 7. Operating rules

1. **Find the constraint before prescribing.** Ranked by bottleneck weight, not by what is easiest to sell.
2. **Evidence bounds the claim.** If the crawl did not see it, the report does not assert it.
3. **Never recommend what already exists.** Evaluate its quality instead.
4. **Model before journey.** Infer the business model, then the funnel.
5. **Use their words.** Funnel stages carry the business's real service names, never generic placeholders.
6. **Specificity is the deliverable.** "Add testimonials" is not advice. "Replace 'Great service!' with an outcome-specific quote and put the Google review count in the header" is.
7. **Degrade, do not fail.** Every quality stage is best-effort.
