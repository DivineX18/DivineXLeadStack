# DIVINEX GOD MODE PLAYBOOK
### The layer above everything: diagnose with Ascend, decide with the frameworks, build with Flow. One client, one argument, one system.

**Version 1.0 · 2026-10-08 · Sits above `DIVINEX-MASTER-PLAYBOOK.md`, replaces nothing.**

`DIVINEX-MASTER-PLAYBOOK.md` is the production system and it stays the
production system. It is excellent at what it does: order of work, approvals,
page sets, the one-pass rules. Do not replace it.

This file adds the three things the audit found missing, and nothing else:

1. **Stage 0.** Diagnose with Ascend before kickoff, so Stage 2 research starts from an answer instead of a blank page.
2. **The capability map.** What Flow can actually build, so nobody promises a funnel the software has to fake.
3. **One vocabulary.** One Argument, six pillars, used the same way in every document.

Read this once. Then run the master playbook.

---

# 0. THE SPINE

**Ascend decides what should be true. Flow makes it true. Zeno is the one mind
between them.**

```
  Prospect or client
        |
   STAGE 0  Ascend Growth Scan          what is actually wrong, ranked
        |
   STAGE 1-2  Kickoff + Strategy        the argument, the plan   -> MASTER
        |
   STAGE 3  Homepage, A2                the system locked        -> MASTER
        |
   STAGE 4-5  Production, review        everything else          -> MASTER
        |
   STAGE 6  Launch + 30 days            live, measured           -> MASTER
        |
   OPERATE  Flow                        funnels, follow-up, CRM
```

Stage 0 is new. Stages 1 to 6 are the master playbook, unchanged.

---

# 1. STAGE 0, DIAGNOSE BEFORE YOU SELL OR BUILD

**Run the Growth Scan on the prospect's site before the kickoff call.**
`app.divinex.io/growth-scanner`

It takes minutes and returns a scored diagnosis the team currently spends hours
assembling by hand. Use it in two places:

**In the sale.** You walk in knowing their constraint. That is the difference
between "we build websites" and "your offer is clear and your lead capture is
the thing costing you, here is the evidence."

**In delivery.** The scan output feeds `DIVINEX-MASTER §2.1` directly:

| Scan output | Feeds master playbook step |
|---|---|
| Growth Score + stage | Sets the register of the whole engagement |
| Ranked constraint | What the homepage must solve first (§3.3) |
| Category findings | R1 current-site audit, as the starting point |
| Market sophistication read | R2 competitor scan, R5 the argument |
| Recommended funnel type | R10 sitemap, and §5 page-set choice |
| Recommended lead magnet | Funnel §11 and the opt-in spec |

**What the scan does not do, so still do it by hand:** Search Console and GA4
exports (R1), the 12-month click history that decides what is must-keep on a
migration, PSI, and voice-of-customer mining (R3). The scan reads a website. It
does not read your analytics or your customers' words.

### The six pillars, as the shared language

Every finding lands in one of six places. Use these words with the client, in
the Strategy sheet, and in the review packet.

| Pillar | The question it answers |
|---|---|
| **Clarity** | Do they know exactly who this is for and what changes? |
| **Positioning** | Why this, over everything else they have tried? |
| **Offer** | Is the thing being sold worth running traffic at? |
| **Traffic** | Do the right people arrive, and does arrival match the promise? |
| **Conversion** | Does arrival become action? |
| **Ascension** | What happens after the first yes? |

**This is a diagnostic order, not a checklist.** A business with broken Clarity
cannot be fixed by spending on Traffic. Name the binding constraint, fix it,
then ascend. Saying "everything needs work" is not a diagnosis.

### How the score is actually weighted

So nobody over-reads the number in front of a client:

Lead generation 20%, Sales 20%, Offer 15%, Marketing 15%, Website 10%,
Content 10%, Authority 5%, Automation 5%.

**Business clarity scores 0% of the number and 10% of the constraint ranking.**
That is deliberate. Clarity is upstream of everything, so it must be able to
surface as the thing to fix first without dragging the headline score around
when a business simply has not written its positioning down yet.

Stages: Foundation under 40, Growth 40 to 59, Optimization 60 to 79, Scale 80+.
A Foundation client is told to build one thing. A Scale client is told what to
optimise. Do not hand a Foundation client an optimisation plan.

---

# 2. THE CAPABILITY MAP

**Never promise a funnel the software has to fake.**

`FUNNEL-MASTER §11` lists 14 funnel types. Flow builds 8 genres natively. Check
here before the Strategy sheet goes out.

| Funnel type (Funnel §11) | Build it in Flow as | Status |
|---|---|---|
| Lead magnet | `lead_magnet` genre | Native |
| Tripwire / SLO | `tripwire` + `checkout` section | Native |
| Quiz / assessment / scan | `lead_gen` + `multi_step_form` section | **Native, but not a genre.** Ask for a stepped assessment, not a "quiz funnel" |
| Webinar | `webinar` genre, set `eventStartAt` | Native |
| VSL | `vsl` genre | Native |
| Challenge | `challenge` genre | Native |
| Application | `application` genre | Native |
| Free consultation | `booking` genre | Native |
| Local service | `booking`, or `lead_gen` for form-first | Native |
| Ecommerce / free-plus-shipping | `checkout` + `upsell_offer` sections | **Sections only, no genre.** Needs BYO-Stripe connected |
| Membership / continuity | The Community product, not a funnel | **Different system** |
| Product launch (PLF) | Nothing native | **Build as a sequence of funnels + workflow** |
| Donation | Nothing native | **Not supported.** Use an external processor and a `lead_gen` page |
| Event registration | `webinar` is the nearest fit | **Borrowed semantics, flag it** |

### Why "borrowed semantics" is a real risk

Flow added its `booking` genre because a physiotherapy page offering a free
assessment had been classified `lead_magnet`. The publish contract then
demanded an uploaded file the page never promised, and **the page could not go
live at all**.

When a funnel's intent has no way to be represented, it borrows the semantics
of something it is not, and the bill arrives at publish time, not at planning
time. If you are reaching for the "nearest fit", say so in the Strategy sheet
and budget for the workaround.

### The 28 sections Flow can build

`hero` · `proof_strip` · `offer` · `story` · `faq` · `cta_banner` ·
`countdown` · `agenda` · `ticket_tiers` · `guarantee` · `trust_badges` ·
`checkout` · `upsell_offer` · `video` · `benefits_grid` · `problem_solution` ·
`before_after` · `included` · `value_stack` · `comparison` · `testimonials` ·
`stats` · `callout` · `team` · `business_footer` · `image_text` ·
`photo_gallery` · `multi_step_form`

If a page spec needs something not on this list, it is a custom build, not a
Flow funnel. Decide that at A1, not at A3.

---

# 3. ONE VOCABULARY

The same idea had three names. From now on:

| Use this | Not these | Why |
|---|---|---|
| **The One Argument** | One Belief, Big Domino | It is what the software calls it and what the winning-ads corpus calls it. Copy may note "also called the One Belief" once. |
| **Unique mechanism** | the how, the method | Already consistent. Keep it. |
| **Constraint** | bottleneck, blocker | Ascend ranks constraints. One word. |
| **Awareness level** · **sophistication stage** | Schwartz stages, market stage | Two different axes. Never collapse them. |

**One argument. One mechanism. One outcome. One prospect.** Branches, second
offers and bonus audiences go to a different page or a different ad.

---

# 4. THE RULES THAT ARE ENFORCED IN CODE

The master playbook's hard rules are not aspirations. Flow enforces most of
them at publish, and a page that breaks them **cannot go live**. Knowing which
is which saves arguing with the software.

| Rule | Enforced where |
|---|---|
| Nothing invented (hard rule 3) | Claim integrity, evidence proof, visual requirements. Flags for human review, never auto-fixes |
| One page, one job, one action (hard rule 7) | `single-cta-clarity` framework, and the action contract at publish |
| A button must go somewhere | CTA integrity. A filled-in section with a dead button fails publish |
| A promise must be delivered | Delivery contract. A lead-magnet funnel whose follow-up is still in draft fails publish |
| Minimal is fine, empty is not | Section completeness. An empty-but-present section is pruned or the save fails |
| Real photos are evidence | A first-party upload counts as evidence. A generated image never does |

**Why detection does not auto-fix:** a rule can tell that a testimonial is
fabricated. It cannot know what the honest replacement should say. So it stops
and asks a human, which is the correct behaviour and will sometimes feel slow.

---

# 5. THE FRAMEWORK STACK

Three layers. Use the deepest one that answers the question.

| Layer | Where | When to open it |
|---|---|---|
| **Delivery** | `DIVINEX-MASTER` + the 9 reference playbooks | Running a client engagement. Always start here. |
| **Canon** | `DivineX App Frameworks/FLOW-CONVERSION-FRAMEWORKS.md` (23 frameworks) and `ASCEND-FRAMEWORK-LIBRARY.md` (7) | "What are the decision rules for this?" Each carries when NOT to use it, failure modes, and how to grade the output. |
| **Source** | `DivineX App Frameworks/SOURCE-COPY-CORPUS.md` | "What did the original actually say?" The raw Google Docs text, cleaned. |

**And one bar across all three:** `DIVINEX-BASELINE-STANDARDS.md` says what
"done" looks like for landing pages, copy and emails, using the thresholds Flow
already grades against. Build to it, self-score, then show the client.

The Copywriting and Ads playbooks were built from the same source corpus and
are the executed working specs. Use them to work. Use the corpus to check.

---

# 6. PRECEDENCE, UPDATED

`DIVINEX-MASTER §0.4` has the precedence order. Insert one line:

1. The owner's explicit instruction for this client
2. The client's existing brand guidelines
3. **Landing**, for paid and campaign landing pages only
4. Locked doctrine: `IMAGE_DIRECTION.md`
5. **→ The capability map in §2 of this file, when a funnel type is being chosen.** What the software can build beats what a playbook describes.
6. `DIVINEX-MASTER` + WebDev house defaults
7. The reference playbooks
8. General design and writing skills

Everything else in §0.4 is unchanged.

---

# 7. WHAT TO FIX IN THE EXISTING PLAYBOOKS

Small, surgical edits. None of them require a rewrite.

| File | Edit |
|---|---|
| `DIVINEX-MASTER §0.2` | Add Stage 0 to the four-moments table as an internal step before Moment 1 |
| `DIVINEX-MASTER §2.1` | R1 and R2: "start from the Growth Scan output, then add GSC, GA4 and PSI" |
| `DIVINEX-MASTER §0.4` | Insert the capability-map precedence line above |
| `FUNNEL-MASTER §11.15` | Add a "Build in Flow as" column from §2 of this file |
| `FUNNEL-MASTER §11.3` | The Growth Scan is a delivery tool, not only DivineX's own example |
| `COPYWRITING-MASTER §6` | "The One Argument (also called the One Belief or Big Domino)" |
| All | Where a strategy is explained, name the pillar it belongs to |

---

# 8. THE ONE-LINE INSTRUCTION

> Run the Growth Scan on their site. Read `DIVINEX-GOD-MODE-PLAYBOOK.md` §1-§3,
> then `DIVINEX-MASTER-PLAYBOOK.md` and `CLIENT-BRIEF.md`. Run Stages 1 to 2.
> Ask me everything missing in one message, then deliver the Strategy and
> Direction sheet with the constraint named and the funnel type checked against
> the capability map.
