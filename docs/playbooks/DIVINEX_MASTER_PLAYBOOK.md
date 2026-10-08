# The DivineX Master Playbook

**Written for: the DivineX team, and for whoever trains or extends the apps next.**

This is the canon. Everything DivineX teaches its software is either in this
document or in one of the six it indexes. If a framework is not written down
here, it is not canon, it is someone's habit.

The frameworks live in git deliberately. They were scattered across seed
scripts, TypeScript constants and Google Docs that could be edited out from
under us. Locked here, they can be reviewed, versioned and argued with.

---

## The index

| Document | What it holds | Size |
|---|---|---|
| [ASCEND_FRAMEWORK_LIBRARY.md](ASCEND_FRAMEWORK_LIBRARY.md) | The 7 curated frameworks Zeno reasons from on Ascend | 7 frameworks |
| [ASCEND_KNOWLEDGE_CANON.md](ASCEND_KNOWLEDGE_CANON.md) | The shared knowledge every tenant draws on | 10 docs, 7 articles |
| [FLOW_CONVERSION_FRAMEWORKS.md](FLOW_CONVERSION_FRAMEWORKS.md) | The 23 conversion frameworks that build the assets | 23 frameworks |
| [ZENO_REASONING_FRAMEWORK.md](ZENO_REASONING_FRAMEWORK.md) | How Zeno thinks: identity, context hierarchy, rules, workflows | the live system prompt |
| [DIVINEX_COPY_CORPUS.md](DIVINEX_COPY_CORPUS.md) | The copywriting and persuasion source material | ~6,000 paragraphs |
| [ASCEND_SYSTEM_PLAYBOOK.md](ASCEND_SYSTEM_PLAYBOOK.md) · [FLOW_SYSTEM_PLAYBOOK.md](FLOW_SYSTEM_PLAYBOOK.md) | How each product is built, for engineers | |

Every one was extracted from running code. Where a number appears, it is the
number the system uses.

---

## 1. The spine

Three products, one argument.

**Ascend decides what should be true. Flow makes it true. Zeno is the one mind
that moves between them.**

```
    Business  ->  Ascend: diagnose the constraint, write the plan
                     |
                  Zeno reasons across both
                     |
              Flow: build the assets, run them, report back
```

Ascend without Flow is a report nobody acts on. Flow without Ascend is a page
builder. Zeno without both is a chatbot.

---

## 2. The six pillars

The master lens. Every recommendation, asset and score is checked against them.

**Clarity, Positioning, Offer, Traffic, Conversion, Ascension.**

Weakness in any one sets a ceiling on growth. The job is never "improve
everything". It is: find the binding constraint, fix it, then ascend.

This is a diagnostic ORDER, not a checklist. A business with broken Clarity
cannot be fixed by spending on Traffic, and the system is built to say so
rather than sell the easier fix.

---

## 3. What the scoring actually weights

Nine categories. Lead generation and Sales carry 20% each, Offer and Marketing
15%, Website and Content 10%, Authority and Automation 5%.

**Business clarity carries 0% of the score and 10% of the bottleneck ranking.**
That asymmetry is the most considered number in the system. Clarity is upstream
of everything, so it must be able to surface as the thing to fix first without
dragging the headline score around when a business simply has not written its
positioning down yet.

Stages: **Foundation** under 40, **Growth** 40 to 59, **Optimization** 60 to
79, **Scale** 80+. The stage sets the register of the advice. A Foundation
business is told to build one thing. A Scale business is told what to optimise.

---

## 4. The routing primitives

Before a word is written, three questions decide where the page opens.

**Awareness** (Schwartz): unaware, problem aware, solution aware, product
aware, most aware. A product-aware reader does not need the problem explained,
and a most-aware reader resents it.

**Market sophistication**: how many times has this market heard this claim?
That decides whether you lead with the claim, a bigger claim, the mechanism, or
a new mechanism entirely.

**Traffic temperature**: cold, warm, hot.

Get the routing wrong and the best copy in the world lands on the wrong ear.

---

## 5. One argument, one mechanism

From the winning-ads corpus, and the thing most work gets wrong:

> One argument. One mechanism. Every line makes the result feel more desirable,
> certain, achievable, or urgent.

Every ad routes back to one mechanism as the better route to the prospect's
outcome. A page making three arguments makes none of them.

The corollary in Flow: **one primary action per section.**

---

## 6. Model before journey

The single most load-bearing correction in the scan engine. Infer the business
MODEL first, then describe the journey that fits it, using the business's own
service names.

| Model | Journey |
|---|---|
| SaaS | Landing, free trial or demo, onboarding, activation, paid |
| Ecommerce | Traffic, product page, cart, checkout, post-purchase |
| Local service | Search, service page, request estimate, consultation, booked |
| Coaching / info | Webinar or workshop, or application |
| Agency / high-ticket | Strategy call, proposal, engagement |

The consulting journey (lead magnet, nurture, sales call, proposal, retainer)
is correct for agencies and high-ticket done-for-you work **only**. Defaulting
every business to it is the failure this rule exists to prevent.

---

## 7. Honesty is a system property

The rules that stop the software lying. These are not tone preferences, they
are enforced in code, and each exists because something shipped that should
not have.

**Evidence bounds the claim.** A website scan observes a website. It may not
assert whether an email sequence exists, because that happens off-site and is
unobservable. Post-click clarity IS observable from on-site copy, and is fair
game.

**Never recommend what already exists.** Evaluate its quality instead. A real
audit flagged "add a quote form above the fold" on a site that already had one
in the nav and sticky on every page. The real finding was CTA hierarchy
confusion.

**Never fabricate proof.** No invented testimonials, no inflated stat badges,
no phantom program features, no guarantee language implying a refund policy
nobody established. Detection flags for human review and does not auto-fix,
because a regex cannot know what honest replacement copy should say.

**Omit rather than pad.** A section may be minimal. A section may be omitted. A
section may not be empty-but-present. The remedy for an empty section is to
remove it, never to fill it with invention.

**A button must go somewhere, and a promise must be delivered.** Content being
present is not the same as the page working. A working button is not the same
as a kept promise: the form can submit perfectly and still deliver nothing,
forever, because the follow-up is sitting in draft. Both are enforced at
publish.

**A real upload is evidence. A generated image never is**, however well it
fills the slot.

**Specificity is the deliverable.** "Add testimonials" is not advice. "Replace
'Great service!' with an outcome-specific quote and put the Google review count
in the header" is.

---

## 8. Quality is a pipeline, not a prompt

A scan is not trusted because a model wrote it. It is trusted because it
survived seven stages: generate, verify deterministically against the crawl,
**audit with a different and more capable model**, grade each finding 0 to 100,
then regenerate only the weak sections.

Two decisions worth keeping:

**A different model does the audit.** The generator's blind spots are not the
verifier's. A model checking its own work buys very little.

**Every stage is best-effort.** A failing stage returns its input unchanged.
The report still ships, already gated deterministically, just without that
run's extra audit. Quality degrades. It never fails closed on the customer.

The same shape governs Flow: reason, then critique, then correct.

---

## 9. Reason, do not template

The distinction the whole library rests on.

Every framework is a distilled PRINCIPLE carrying purpose, when to use it, when
it actively hurts, decision rules, the honest psychology, the structural moves,
how to grade the output, and how it is executed badly.

It is never a fill-in-the-blank skeleton. That is why a dentist and a SaaS get
different pages: the engine reasons with these against the specific business,
rather than swapping words into a fixed shape.

Provenance is named honestly. Where a principle originates in established
public work (Schwartz on awareness and sophistication, value-equation thinking,
direct-response practice), it is attributed. These are principles, not cloned
templates, and the library never fabricates authority.

---

## 10. How to extend this

1. **Add the framework to the code, not just the doc.** `framework-library.ts` for Flow, `seedFrameworks.ts` for Ascend. The doc is extracted from the code, so the code is the source of record.
2. **Give it decision rules and failure modes.** A framework without `whenNotToUse` will be misapplied.
3. **Re-extract.** The playbooks are generated, so regenerate rather than hand-edit.
4. **If a real audit proves the system wrong, record the correction as a pattern.** Industry, constraint, what actually won, and why the first answer was wrong. That is how the window-and-door correction became a rule.

The library grows by being wrong in traceable ways and keeping the corrections.
