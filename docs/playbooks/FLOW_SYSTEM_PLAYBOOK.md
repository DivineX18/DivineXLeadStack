# Flow Playbook

**What Flow is:** the execution engine. It turns a strategy into the assets
that run it, pages, forms, follow-up, bookings, and then operates them.

Ascend decides what should be true. Flow makes it true.

Source of record: `DivineXLeadStack/src/lib/conversion/framework-library.ts`,
`src/lib/funnels/` (frameworks, design-packs, art-direction, cta-integrity,
claim-integrity, evidence-proof, section-completeness, landing-page-critic),
`src/lib/workflows/`, and `firestore.rules`.

---

## 1. The conversion framework library

23 frameworks across five families. Each is a distilled **principle**, not a
fill-in-the-blank template, and that distinction is load-bearing: a dentist and
a SaaS get different pages because the engine reasons with these against the
specific business, rather than swapping words into a fixed skeleton.

Every framework carries the same anatomy:

- **purpose**: one line on what it is for
- **useCases** and **whenNotToUse**: the guardrail against misuse
- **requiredInputs**: what it needs to be applied well
- **decisionRules**: the if-X-then-Y logic the engine selects with
- **psychologicalPrinciples**: the honest mechanism it works through
- **structure**: the ordered moves, never finished copy
- **evaluationCriteria**: how to grade an output, which drives the rewrite loop
- **failureModes**: the anti-patterns to catch
- **compatibleFrameworks**: what stacks with it
- **source**: honest provenance

### The library

**Copywriting**
Outcome + Mechanism Headline · Feature to Benefit Ladder · Objection
Preemption · The Hook (four types) · Old Way vs New Way · Slippery-Slide
Cadence · Single-Idea Email

**Buyer psychology**
Awareness-Level Routing · Market Sophistication Routing · Emotion First, Logic
to Justify · Enter the Conversation in Their Mind · Core Human Motivations ·
The Amplification Test

**Offer**
Value Equation Lens · Offer Value Stack · Honest Risk Reversal · Honest Urgency
and Scarcity

**Landing page**
Unique Mechanism Reveal · Specific, Verifiable Proof · Single-Action CTA · The
One Argument · Page Architecture by Intent

**Email**
Post-Conversion Sequence Design

### The routing primitives

Two inputs decide where a page opens, before any copy is written.

**Awareness** (Schwartz): unaware, problem aware, solution aware, product
aware, most aware. Determines where the page must OPEN. A product-aware reader
does not need the problem explained to them, and a most-aware reader resents it.

**Traffic temperature**: cold, warm, hot.

**Market sophistication**: how many times this market has heard this claim
before. Drives whether you lead with the claim, a bigger claim, the mechanism,
or a new mechanism entirely.

Get the routing wrong and the best copy in the world lands on the wrong ear.

---

## 2. Funnel genres

Every funnel follows one persuasion sequence: **Attention, Problem, Solution,
Benefits, Process, Offer, Trust, FAQ, CTA.** Each genre maps that sequence onto
its own layout, and each stage may allow alternates the engine can substitute
when the business's real evidence fits one better.

| Genre | Purpose |
|---|---|
| `lead_magnet` | Trade a deliverable for contact details. Promises a file, so one must exist. |
| `lead_gen` | Capture without promising a file. |
| `booking` | Get a time in the diary. Promises no file. |
| `vsl` | Video sales letter. |
| `webinar` | Live or evergreen teaching, then an offer. |
| `challenge` | Multi-day sequence. |
| `application` | Qualify before a conversation. |
| `tripwire` | Low-ticket entry purchase. |

The `booking` genre exists because its absence had a customer-visible cost: a
physiotherapy page offering a free assessment was classified `lead_magnet`, the
publish contract then demanded an uploaded file the page never promised, and
the page could not go live at all. **When intent has no way to be represented,
it borrows the semantics of something it is not.**

### Stage slots

Stable ids that stay constant across genres so the engine can reason about
position rather than name: `attention`, `problem`, `problem_solution`,
`mechanism_story`, `old_way_new_way`, `belief_shift`, `benefits`, `features`,
`process`, `process_rollout`, `results`, `trust`, `offer`, `offer_detail`,
`opportunity`, `guarantee`, `faq`, `agenda`, `host`, `application`,
`evaluation`, `cta`.

### Design packs

`classic` · `executive` · `bold` · `premium` · `startup` · `local_business` ·
`wellness`

---

## 3. The integrity contracts

This is the part of Flow most worth protecting. A page can be fully written and
still be broken, and each of these catches a different way that happens.

**Section completeness.** A section may be MINIMAL. A section may be OMITTED. A
section may NOT be EMPTY-BUT-PRESENT. An empty-but-present section is the
failure a visitor always notices and no upstream check caught: the generator
emitted the skeleton, the content never arrived, and the page shipped with dead
zones between real sections. The remedy for an empty section is to omit it,
never to fill it. Inventing proof to satisfy a completeness check would be far
worse than the empty shell.

**The action contract (`cta-integrity`).** Content being present is not the same
as the page working. A section can be completely filled in and still offer a
button that does nothing. Live pages were found doing exactly this.

**The delivery contract.** A working button is not the same as a kept promise.
The form can submit perfectly and still deliver nothing, forever, because the
follow-up built for it is sitting in draft.

**Claim and evidence integrity.** Generated pages must not fabricate social
proof. The recurring failure mode in template generators is invented
testimonials attributed to fictional people, inflated stat badges, phantom
program features and guarantee language implying a refund policy nobody
established. Detection flags for human review; it does not auto-fix, because a
regex cannot know what honest replacement copy should say.

**Visual requirements.** Media is a requirement with a brief, not a picture. A
real upload is recorded as first-party evidence. A generated image never is,
however well it fills the slot.

**The common thread: the page must not assert what the business has not
earned.**

---

## 4. Automation

- **Trigger**: `contact.created`, `contact.tag.added`, `form.submitted`, `pipeline.stage.changed`, `booking.created`, `quote.accepted`, `quote.paid`
- **Filters**: who it applies to. An empty filter means everyone.
- **Steps**: linear via `next`, with `if_else` branching
- **Compliance**: every marketing email carries `{{unsubscribeLink}}`, enforced at the editor and at the send route. Inbound STOP flips the opt-out flag.
- **Send window**: per sub-account, evaluated in the configured timezone. Outside it, the step reschedules rather than sends.
- **Idempotency**: retries check history before acting, so a retry cannot double-send.

---

## 5. Tenancy

Every document carries `agencyId`, `subAccountId` and `createdByUid`. The
sub-account is the tenancy key. A foreign id and a nonexistent id return the
same answer, so no surface can be used to enumerate another tenant.

**White-label is a first-class constraint.** This codebase ships as a template
a buyer brands as their own. Anything that names DivineX must be opt-in and
default to off, or it stamps our name across a customer's deployment. Customer
booking pages render the sub-account's branding, never ours.

---

## 6. Operating rules

1. **Reason, do not template.** Frameworks carry decision rules so the output fits the business.
2. **Route before you write.** Awareness and sophistication decide where the page opens.
3. **One argument per page.** One primary action per section.
4. **Never fabricate proof.** No invented testimonials, stats, credentials or guarantees.
5. **Omit rather than pad.** Minimal is allowed. Empty-but-present is not.
6. **A button must go somewhere, and a promise must be delivered.** Both are enforced at publish.
7. **Default to off for anything that spends money or carries our name.**
