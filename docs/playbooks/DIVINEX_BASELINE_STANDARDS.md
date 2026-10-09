# DIVINEX BASELINE STANDARDS
### What "good" means before the client has said a word. Ship to this bar, then let their feedback move it.

**Version 1.0 · 2026-10-08 · Companion to `DIVINEX-GOD-MODE-PLAYBOOK.md`**

The playbooks say how to do the work. This says **what done looks like**, in
terms you can check before anyone sees it.

Most of this bar is not an opinion. Flow already grades landing pages and copy
automatically, and the numbers below are the thresholds it actually uses. Where
the software grades, the human bar and the machine bar are **the same bar**.
Where it does not grade (emails), the standard is written out and the gap is
named honestly.

**How to use it:** build to the baseline, self-score, fix anything blocking,
then show the client. Their feedback moves the baseline for them, and sometimes
for everyone (§6).

---

# 1. THE TWO GRADERS THAT ALREADY RUN

Every funnel Flow builds gets reviewed twice, automatically, before anyone
looks at it.

| Grader | Type | Output |
|---|---|---|
| **Landing Page Critic** | LLM, judgment | `ready` or `needs_correction`, with findings at blocking / major / minor |
| **Copy Quality Engine** | Deterministic, no LLM | 0 to 100 score, flagged issues, weak-section list, fabrication-risk flag |

Neither rewrites anything. Both flag for a human, deliberately: a rule can tell
that a testimonial is fabricated, but it cannot know what the honest
replacement should say.

**Ship rule: `ready` verdict, copy score 80+, zero fabrication-risk flags, zero
blocking findings.** Anything less is not shown to a client.

---

# 2. LANDING PAGE BASELINE

### The ten things the Critic judges

| Category | The question |
|---|---|
| `visual_hierarchy` | Does the eye land where the argument needs it to? |
| `visual_rhythm` | Does the page breathe, or is it a wall? |
| `generic_feel` | Could this be any competitor's page? |
| `imagery_weakens` | Is a picture making this worse than no picture? |
| `text_would_be_stronger` | Would plain type beat this visual? |
| `density` | Too much, too little? |
| `coherence` | Does it hold together as one argument? |
| `heading_content_mismatch` | Does the heading promise what the section delivers? |
| `incomplete_section` | Is anything a shell? |
| `cta_quality` | Does the action read as worth taking? |

### Structural defaults (ship these unless the brief says otherwise)

- **One page, one job, one primary action.** Above the fold and repeated at the end. Same action, same label everywhere.
- **The sequence**: Attention, Problem, Solution, Benefits, Process, Offer, Trust, FAQ, CTA. Genres reorder it; none skip the spine.
- **Open where the reader is.** Awareness level decides the opening, not taste. Talking to a problem-aware reader as if they were product-aware is the single most common failure.
- **Sophistication decides the claim.** Stage 1 to 2: lead with the claim. Stage 3 to 5: lead with the mechanism.
- **Minimal is allowed. Empty is not.** A section with nothing real in it gets removed, never padded.
- **Every button goes somewhere.** A dead button fails publish, and should.
- **Reading level**: landing pages grade 4, core pages grade 5 to 8, city pages and posts grade 3 to 4.

### Media

- A real photo the client supplied is **evidence**. A generated image never is, however well it fits.
- No photo is better than a wrong photo. If `imagery_weakens` fires, remove it.
- Missing media is a **labelled placeholder with a shot brief**, listed in the review packet. Never a stock substitute passed off as theirs.

---

# 3. COPY BASELINE

### The four automatic flags

**1. Generic filler.** These are flagged on sight. They are not banned because
they are ugly; they are banned because they could be pasted onto any
competitor's page:

> unlock, unlock your potential, elevate, seamless, revolutionize, empower,
> unparalleled, cutting-edge, game-changing, next-level, world-class, unleash,
> supercharge, effortless, holistic, robust, dynamic, tailored, transformative,
> comprehensive, best-in-class, state-of-the-art, turnkey, paradigm, synergy

Replace with a specific outcome, a number, or the mechanism.

**2. The name-swap test.** If the business name could be swapped out and the
headline still works, the headline says nothing. These shells fail
automatically:

> "grow your business" · "transform your life/business/results" · "take X to
> the next level" · "unlock your potential" · "achieve your goals" · "reach
> your full potential" · "your success starts here" · "the smart/better/easy
> way to..."

**3. Vague CTAs.** A CTA names the outcome, not the mechanics. These fail:

> Submit · Learn more · Click here · Read more · Continue · Next · Go · Sign up
> · Get started

**4. Fabrication risk.** High severity, stops the page:

- Invented social-proof counts: "10,000+ happy customers", "500+ satisfied clients"
- Guarantee or refund language the business never offered. **This one shipped once**: a page whose brief supplied no guarantee got an invented "7-day money-back guarantee". That is a legal commitment the business never made.
- Legal or organisational status: tax-deductible, 501(c)(3), registered charity, licensed and insured

Medium severity, verify before shipping: star ratings, percentages and
statistics, "as seen in", "trusted by", "voted #1".

### The writing order, never reordered

1. Research (VOC, buyer questions, awareness, sophistication)
2. **The One Argument approved** (also called the One Belief)
3. Mechanism named, passing the better-easier-certain test
4. Headline and lead
5. Body, proof, offer, CTA
6. Voice pass
7. Compliance pass
8. Score and rewrite

**Nobody writes a headline before the brief exists.**

### Minimum research before writing

- **20+ verbatim customer phrases**, three-star reviews especially
- Awareness level and sophistication stage, decided and written down
- A proof inventory: what can we actually evidence, and what can we not

---

# 4. EMAIL BASELINE

**Be aware: nothing grades emails automatically.** The only enforced check is
that the body contains `{{unsubscribeLink}}`, which is compliance, not quality.
Everything below is a human bar, so it needs a human to hold it.

### Per email

- **One idea.** An email arguing two things persuades of neither.
- **Subject earns the open, first line earns the second.** No clickbait the body does not honour.
- **One primary action.** The same action the funnel is driving at.
- **The same One Argument as the page.** An email that argues something new is a different campaign.
- `{{unsubscribeLink}}` present. Enforced, and it will reject the save without it.
- The copy rules in §3 apply unchanged: no filler, no name-swap shells, no vague CTAs, no invented proof.

### Per sequence

- **The bridge is the job.** Most sequences fail because the delivery email delivers and then nothing connects the download to the offer. Name the bridge email explicitly.
- **Timing is a decision, not a default.** "One day after" means a wait step exists. Write the gap deliberately.
- **Send window and opt-out respected.** Flow enforces both.
- **A promise made on the page is kept by the sequence.** A lead-magnet funnel whose follow-up sits in draft fails publish, and should.

### Default shape (lead magnet)

| # | Timing | Job |
|---|---|---|
| 1 | Immediate | Deliver the thing. Nothing else. |
| 2 | +1 day | The one insight from it that changes how they see the problem |
| 3 | +2 days | Proof, and the bridge to the offer |
| 4 | +3 days | The offer, stated plainly, with the real risk reversal |
| 5 | +5 days | Last call, honest urgency only |

Modify per client. Do not skip the bridge.

---

# 5. THE PRE-CLIENT SCORECARD

Run this before anything is shown. Evidence, not adjectives.

| # | Check | Pass |
|---|---|---|
| 1 | Critic verdict | `ready`, zero blocking |
| 2 | Copy score | 80+ |
| 3 | Fabrication flags | zero |
| 4 | Name-swap test on every headline | survives |
| 5 | One primary action per page, consistent label | yes |
| 6 | Every CTA resolves | yes |
| 7 | Promise delivered by a live sequence | yes |
| 8 | Awareness and sophistication recorded | yes |
| 9 | Placeholders labelled and listed | yes |
| 10 | Desktop + 390px opened and looked at | yes |
| 11 | Reading level on target | yes |
| 12 | Compliance pass | yes |

Report it the way the master playbook reports everything else: *"41/41 pages
200, copy 87, critic ready, 3 placeholders listed below"*, not "it looks great".

---

# 6. THE OPTIMIZATION LOOP

The baseline is a starting position, not a verdict. It moves in three ways.

**Client feedback, this client.** Record it in their folder. If they reject
something the baseline required, write down what they wanted instead and why.
That becomes their standard.

**A pattern, every client.** When the same correction comes up for the third
time, it stops being feedback and becomes canon. Ascend already does exactly
this with recommendation patterns: industry, constraint, what actually won, and
why the first answer was wrong. The window-and-door CTA correction became a
rule that way.

**Measured results, after launch.** Opt-in rate, show rate, close rate, by
funnel type. When a real number contradicts the baseline, the number wins.

### What to record when the baseline is wrong

- What we shipped, and the score it passed with
- What the client or the data said
- What we changed
- Whether this is one client's taste or a rule

**The library grows by being wrong in traceable ways and keeping the
corrections.** A baseline nobody ever overrides is a baseline nobody is
checking.

---

# 7. KNOWN GAPS

Stated plainly so nobody assumes coverage that does not exist.

| Gap | Consequence |
|---|---|
| **No automatic email grading** | §4 is a human bar. It will drift unless someone checks it. |
| **Copy score is heuristic** | 0 to 100 on detectable faults. It is not a conversion prediction, and a page can score 90 and still not sell. |
| **Detection never rewrites** | Every flag needs a human to write the honest replacement. |
| **No baseline is proven against outcomes yet** | These are our best assumptions plus what the software enforces. §6 is how they earn their keep. |
