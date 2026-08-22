/**
 * DivineX Conversion Framework Library (v1).
 *
 * The keystone knowledge substrate of the Conversion Engine. Every entry is a
 * distilled PRINCIPLE — purpose, when-to-use, when-NOT, decision rules,
 * psychology, structure, evaluation criteria, failure modes — NOT a
 * fill-in-the-blank template. That distinction is deliberate and load-bearing:
 * a dentist and a SaaS get different pages because the engine REASONS with
 * these frameworks against a Campaign Strategy Object, rather than swapping
 * words into a fixed skeleton.
 *
 * Code-defined + versioned (like lib/funnels/frameworks.ts), NOT Firestore-
 * seeded — this is curated, reviewed-in-git canon. The dynamic, learned layer
 * (the design-intelligence-style reinforcement vault) is a later P3 milestone;
 * it will ADD to this, never replace the canon.
 *
 * Pure module — no "server-only", no Firestore, no side effects — so it can be
 * imported from the server (generation), a script (the verify harness), or the
 * client (a future framework browser) alike.
 *
 * Provenance note: `source` honestly names established public frameworks where
 * a principle originates (Schwartz's awareness/sophistication; value-equation
 * thinking; direct-response practice) — that is attribution, not fabricated
 * authority, and these are principles, not cloned "Hormozi/Brunson templates."
 */

import type {
  ConversionFramework,
  FrameworkFamily,
  CampaignObjective,
  AwarenessLevel,
  TrafficTemperature,
} from "@/types/conversion";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";

const TRAINING = "DivineX training materials (copywriting-principles, winning-ads-vsl-formula, winning-ads-swipe-file)";

export const CONVERSION_FRAMEWORKS: ConversionFramework[] = [
  // ─── COPYWRITING ─────────────────────────────────────────────────────────
  {
    id: "headline-outcome-mechanism",
    family: "copywriting",
    name: "Outcome + Mechanism Headline",
    version: "1.0.0",
    purpose:
      "Write a hero headline that names a specific desired outcome AND hints at the unique mechanism that makes it believable.",
    useCases: [
      "The hero of nearly any conversion page",
      "Cold/paid traffic that must grasp the promise in under two seconds",
      "Offers whose credibility depends on a 'how' the reader hasn't heard",
    ],
    whenNotToUse: [
      "Most-aware traffic that already trusts the brand and just needs the offer/price",
      "When no honest, specific outcome can be stated (fix the offer first, not the headline)",
    ],
    requiredInputs: ["primaryDesiredOutcome", "uniqueMechanism", "audience awareness"],
    decisionRules: [
      "State a concrete outcome (a number, a named result, a removed pain) before any adjective.",
      "If the market is sophistication 3+, lead with the MECHANISM — the claim alone is burned out.",
      "If the reader is problem-aware but not solution-aware, name the outcome; hint the mechanism, don't explain it.",
      "Never promise a result the offer can't honestly deliver — a strong headline over a weak offer just speeds the bounce.",
    ],
    psychologicalPrinciples: [
      "Specificity signals truth (a specific claim is harder to fake than a vague one)",
      "A novel mechanism restores belief in a claim the market has heard before",
    ],
    structure: [
      "[Specific outcome] + [without the feared cost / old way] + [via the mechanism]",
      "Optional eyebrow above to set audience/context; subheadline below to expand the mechanism in one line",
    ],
    evaluationCriteria: [
      "Would it still be true if a competitor's name replaced yours? If yes, it's too generic — fail.",
      "Is the outcome concrete (name/number/removed-pain) rather than an adjective?",
      "Does a skeptical reader get WHY it could work, not just WHAT is promised?",
    ],
    failureModes: [
      "Adjective soup ('transformative', 'next-level') standing in for a real outcome",
      "Mechanism-free claim to a sophistication-3+ market that's already immune to it",
      "Clever wordplay that hides the promise instead of landing it",
    ],
    compatibleFrameworks: ["awareness-routing", "sophistication-routing", "mechanism-reveal", "proof-specificity"],
    tags: ["headline", "hero", "hook", "above the fold", "promise"],
    source: `${TRAINING} + Eugene Schwartz (market sophistication)`,
  },
  {
    id: "mechanism-reveal",
    family: "copywriting",
    name: "Unique Mechanism Reveal",
    version: "1.0.0",
    purpose:
      "Explain WHY this offer works differently — the specific mechanism — so a reader who's tried other things believes it won't fail the same way.",
    useCases: [
      "Sophisticated markets that have tried competing solutions",
      "Any offer whose central claim needs a reason-to-believe",
      "The 'solution' beat of a VSL or long-form page",
    ],
    whenNotToUse: [
      "Simple, low-consideration offers where the mechanism is obvious (a coupon doesn't need a mechanism)",
      "When there is no genuinely distinct mechanism — do not invent one; compete on proof or offer instead",
    ],
    requiredInputs: ["uniqueMechanism", "the old way / why alternatives fail"],
    decisionRules: [
      "Frame the villain as a BEHAVIOR, belief, or system the reader inherited — never a person or the reader themselves.",
      "Contrast the old way's failure point with the exact step the mechanism changes.",
      "Name the mechanism so it becomes a thing the reader can remember and repeat.",
    ],
    psychologicalPrinciples: [
      "A new mechanism reframes past failure as 'not your fault, wrong method' — restoring hope",
      "Naming a mechanism creates perceived proprietary advantage",
    ],
    structure: [
      "Old way → why it structurally fails → the overlooked lever → the named mechanism → the outcome it unlocks",
    ],
    evaluationCriteria: [
      "Does it explain failure of alternatives without attacking the reader?",
      "Is the mechanism specific enough to feel real, simple enough to remember?",
    ],
    failureModes: [
      "A 'mechanism' that's just the outcome restated",
      "Blaming the reader for past failure (kills the reframe)",
      "Inventing a fake proprietary system — a verification failure and a trust killer",
    ],
    compatibleFrameworks: ["headline-outcome-mechanism", "sophistication-routing", "objection-preemption"],
    tags: ["mechanism", "how it works", "reason to believe", "villain", "reframe"],
    source: `${TRAINING}`,
  },
  {
    id: "feature-to-benefit-ladder",
    family: "copywriting",
    name: "Feature → Benefit Ladder",
    version: "1.0.0",
    purpose:
      "Convert every feature into the outcome and identity the reader actually buys, so the page sells results, not specs.",
    useCases: ["Benefits sections, 'what's included' blocks, deliverable lists", "Feature-heavy offers (SaaS, service packages)"],
    whenNotToUse: ["Pure identity/luxury plays where the feeling, not the feature, is the product"],
    requiredInputs: ["deliverables / features", "primaryDesiredOutcome"],
    decisionRules: [
      "For each feature, climb the ladder: feature → what it does → what that means for them → who it lets them become.",
      "Stop at the rung that matches the audience's motivation (rational buyers want the mechanism rung; emotional buyers want the identity rung).",
    ],
    psychologicalPrinciples: ["People buy outcomes and identity, not attributes", "Concreteness makes a benefit feel attainable"],
    structure: ["[Feature] so you can [capability] which means [outcome] — [identity payoff]"],
    evaluationCriteria: [
      "Does each line answer 'so what?' at least once?",
      "Is the benefit specific to THIS business, not any business in the category?",
    ],
    failureModes: ["Listing features with no 'so what'", "Benefit inflation into vague grandiosity", "Every bullet climbing to the same generic identity"],
    compatibleFrameworks: ["value-equation-lens", "offer-value-stack"],
    tags: ["benefits", "features", "so what", "deliverables", "bullets"],
    source: `${TRAINING}`,
  },
  {
    id: "objection-preemption",
    family: "copywriting",
    name: "Objection Preemption",
    version: "1.0.0",
    purpose: "Name the single biggest reason the reader would NOT act, and dissolve it before the CTA — on the page, not in a later email.",
    useCases: ["Any priced offer", "High-consideration or high-ticket pages", "FAQ and guarantee sections"],
    whenNotToUse: ["Ultra-low-friction free offers where surfacing objections manufactures doubt that wasn't there"],
    requiredInputs: ["audience.objections", "the primary purchase blocker"],
    decisionRules: [
      "Rank objections; handle the #1 in the body, the rest in the FAQ.",
      "Answer with evidence or a mechanism, not a reassurance ('trust us' is not an answer).",
      "If the honest answer is 'it might not be for you', qualify OUT — that raises conversion of the right buyer.",
    ],
    psychologicalPrinciples: ["Unspoken objections don't disappear; they become silent exits", "Naming a doubt first earns permission to answer it"],
    structure: ["Name the objection in the reader's own words → validate it → answer with proof/mechanism → restate the low-risk next step"],
    evaluationCriteria: ["Is the #1 real objection actually addressed, not a strawman?", "Is the answer evidence-backed rather than a platitude?"],
    failureModes: ["Handling easy objections while dodging the real one", "Defensive tone that amplifies the doubt", "Fabricating proof to close the objection"],
    compatibleFrameworks: ["honest-risk-reversal", "proof-specificity", "single-cta-clarity"],
    tags: ["objections", "faq", "risk", "doubt", "friction"],
    source: `${TRAINING}`,
  },
  {
    id: "proof-specificity",
    family: "copywriting",
    name: "Specific, Verifiable Proof",
    version: "1.0.0",
    purpose: "Make claims believable with concrete, real proof — and stay silent where no real proof exists, rather than inventing it.",
    useCases: ["Trust/social-proof sections", "After any bold claim", "High-skepticism markets"],
    whenNotToUse: ["When no real proof exists — then lean on mechanism, specificity, and risk reversal instead of faking proof"],
    requiredInputs: ["offer.proof (real only)", "real testimonials/results if the operator provided them"],
    decisionRules: [
      "A number beats an adjective; a named specific beats a round number.",
      "Only use testimonials/results/logos/awards the operator actually supplied — NEVER fabricate any of them.",
      "If proof is thin, substitute demonstrated mechanism and a strong guarantee; do not manufacture social proof.",
    ],
    psychologicalPrinciples: ["Specificity is a truth signal", "Third-party proof outweighs first-party claims"],
    structure: ["Claim → specific evidence for the claim → attribution (real) → relevance to the reader's situation"],
    evaluationCriteria: [
      "Does every proof element trace to a real, supplied source?",
      "Are the numbers specific rather than suspiciously round?",
    ],
    failureModes: ["Invented testimonials/stats/customer-counts/revenue/awards (a hard verification failure)", "Vague proof ('trusted by many')", "Proof irrelevant to the reader's situation"],
    compatibleFrameworks: ["objection-preemption", "headline-outcome-mechanism"],
    tags: ["proof", "social proof", "testimonials", "credibility", "trust", "specificity"],
    source: `${TRAINING} — with the DivineX no-fabrication rule`,
  },
  {
    id: "single-cta-clarity",
    family: "copywriting",
    name: "Single-Action CTA",
    version: "1.0.0",
    purpose: "Give the page one primary action, stated as an outcome the reader gets — repeated, never competing with itself.",
    useCases: ["Every conversion page", "CTA buttons, banners, sticky bars"],
    whenNotToUse: ["Genuinely multi-path pages (a pricing page with distinct plans) — but even then, one action per option"],
    requiredInputs: ["offer.cta", "conversionEvent", "trafficTemperature"],
    decisionRules: [
      "One primary action per page; a secondary link (not button) at most.",
      "Label the button with the outcome or the thing received, not 'Submit'.",
      "Match CTA friction to commitment: a free lead magnet earns one click; a high-ticket call earns a qualifying step.",
      "Repeat the same CTA at each natural decision point — same words, same destination.",
    ],
    psychologicalPrinciples: ["Choice overload reduces action", "Clarity of next step lowers perceived risk"],
    structure: ["Restate the value → the single action as an outcome → risk/again-reassurance microcopy under it"],
    evaluationCriteria: ["Is there exactly one primary action?", "Does the button promise the outcome, not the mechanics?", "Do all CTAs point to the same destination?"],
    failureModes: ["Competing CTAs stealing each other's clicks", "Generic 'Submit'/'Learn more' labels", "CTA friction mismatched to the offer's commitment"],
    compatibleFrameworks: ["objection-preemption", "honest-urgency"],
    tags: ["cta", "call to action", "button", "conversion", "next step"],
    source: `${TRAINING}`,
  },

  // ─── BUYER PSYCHOLOGY ─────────────────────────────────────────────────────
  {
    id: "awareness-routing",
    family: "buyer_psychology",
    name: "Awareness-Level Routing",
    version: "1.0.0",
    purpose: "Open the page at the reader's actual awareness level so the first screen meets them where they are — the single biggest lever on message-market match.",
    useCases: ["Choosing the hero angle for any page", "Deciding how much problem-education precedes the offer"],
    whenNotToUse: ["Never skip it — every page has an implicit awareness assumption; make it explicit"],
    requiredInputs: ["audience.awareness", "trafficSource / searchIntent"],
    decisionRules: [
      "Unaware → open on the problem/symptom, not the offer; earn the right to sell.",
      "Problem-aware → open on the desired outcome + agitate the cost of staying stuck.",
      "Solution-aware → open on your mechanism vs. the category of solutions.",
      "Product-aware → open on why YOU (differentiators, proof, offer terms).",
      "Most-aware → open on the offer, price, and CTA; cut the education.",
      "Infer awareness from traffic: high-intent search skews product/most-aware; cold interest ads skew problem/unaware.",
    ],
    psychologicalPrinciples: ["A message that assumes the wrong awareness reads as irrelevant and bounces", "Meeting the reader's current thought earns the next sentence"],
    structure: ["Diagnose awareness → pick the matching hero angle → sequence sections to close the remaining awareness gap → offer"],
    evaluationCriteria: ["Does the first screen match where this traffic actually is?", "Is there wasted education for already-aware traffic (or a missing bridge for unaware)?"],
    failureModes: ["Selling the offer to unaware traffic", "Over-educating most-aware, high-intent traffic into boredom", "Assuming one awareness level for mixed traffic sources"],
    compatibleFrameworks: ["headline-outcome-mechanism", "sophistication-routing", "page-architecture-by-intent"],
    tags: ["awareness", "message match", "hook", "traffic", "schwartz"],
    source: "Eugene Schwartz, Breakthrough Advertising (five awareness levels) — applied per DivineX",
  },
  {
    id: "sophistication-routing",
    family: "buyer_psychology",
    name: "Market Sophistication Routing",
    version: "1.0.0",
    purpose: "Calibrate how hard the claim must work based on how many similar claims the market has already heard.",
    useCases: ["Deciding whether to lead with a claim, a bigger claim, a mechanism, or an identity", "Crowded categories"],
    whenNotToUse: ["Brand-new categories with no prior claims (stage 1) — there, the simple direct claim wins"],
    requiredInputs: ["audience.sophistication", "competitive context"],
    decisionRules: [
      "Stage 1 (first claim): state the direct benefit plainly.",
      "Stage 2 (claims exist): make a bigger/more specific claim.",
      "Stage 3 (claims tired): lead with the MECHANISM — the how, not the what.",
      "Stage 4 (mechanisms tired): make the mechanism bigger/easier/faster, or add a new one.",
      "Stage 5 (burned out): lead with identity, belief, and experience; the market no longer believes claims OR mechanisms.",
    ],
    psychologicalPrinciples: ["Claims decay as a market hears them repeated", "Novelty of angle restores attention when the claim can't"],
    structure: ["Assess how saturated the claim is → pick the stage-appropriate angle → escalate only as far as the market requires"],
    evaluationCriteria: ["Does the angle match the market's fatigue level?", "Are we over-escalating (identity play to a stage-1 market) or under (bare claim to a stage-4 market)?"],
    failureModes: ["Bare claim to a burned-out market", "Jumping to identity/belief when a simple claim would still land", "Ignoring that different traffic sources sit at different stages"],
    compatibleFrameworks: ["headline-outcome-mechanism", "mechanism-reveal", "awareness-routing"],
    tags: ["sophistication", "positioning", "competition", "claim", "schwartz"],
    source: "Eugene Schwartz, Breakthrough Advertising (five sophistication stages) — applied per DivineX",
  },
  {
    id: "value-equation-lens",
    family: "buyer_psychology",
    name: "Value Equation Lens",
    version: "1.0.0",
    purpose: "Diagnose and strengthen how desirable an offer FEELS: raise the dream outcome and perceived likelihood; cut the time and effort/sacrifice.",
    useCases: ["Auditing an offer before writing the page", "Deciding which offer levers the copy should emphasize"],
    whenNotToUse: ["As a copy template — it's a diagnostic lens, not a section to render"],
    requiredInputs: ["offer.transformation", "offer.mechanism", "time-to-result", "effort required", "proof of likelihood"],
    decisionRules: [
      "If desire is low, raise the dream outcome (make it more specific and vivid) — do not inflate it falsely.",
      "If belief is low, raise perceived likelihood with proof, mechanism, and a guarantee.",
      "If the offer feels heavy, cut the time-to-result and the effort/sacrifice the reader must make — and SAY so on the page.",
      "The biggest weakness in the equation is where the copy should spend the most words.",
    ],
    psychologicalPrinciples: ["Perceived value rises with dream outcome × likelihood, and falls with time × effort", "Reducing perceived effort often beats increasing perceived benefit"],
    structure: ["Score the four levers → identify the weakest → route copy and offer changes to fix the weakest first"],
    evaluationCriteria: ["Does the page visibly address time and effort, not just outcome?", "Is perceived likelihood backed by real proof/mechanism, not just enthusiasm?"],
    failureModes: ["Only ever amplifying the dream outcome while ignoring time/effort", "Raising likelihood with fabricated proof (a verification failure)", "Treating the equation as copy instead of diagnosis"],
    compatibleFrameworks: ["offer-value-stack", "feature-to-benefit-ladder", "honest-risk-reversal"],
    tags: ["offer strength", "desire", "value", "diagnosis", "likelihood", "effort"],
    source: `${TRAINING} + established value-equation thinking in direct response`,
  },
  {
    id: "emotion-then-justification",
    family: "buyer_psychology",
    name: "Emotion First, Logic to Justify",
    version: "1.0.0",
    purpose: "Lead with the emotional driver that makes someone WANT to act, then give the rational reasons that let them feel smart doing it.",
    useCases: ["Most consumer and personal-brand offers", "Sequencing a page's persuasion arc"],
    whenNotToUse: ["Highly rational enterprise/procurement buys where feeling-led copy reads as unserious — there, lead with the business case"],
    requiredInputs: ["audience.motivations", "audience.fears", "whether the purchase is emotional or rational for this buyer"],
    decisionRules: [
      "Decide if THIS purchase is primarily emotional or rational for THIS audience, and lead accordingly.",
      "Even rational buyers need an emotional reason to move now; even emotional buyers need logic to justify the spend afterward.",
      "Place the emotional hook up top; cluster the logical justification (specs, ROI, proof) near the decision point.",
    ],
    psychologicalPrinciples: ["Decisions are made emotionally and justified rationally", "Justification reduces post-decision regret and refund risk"],
    structure: ["Emotional hook (desire/fear) → vision of the outcome → rational justification (proof, math, terms) → CTA"],
    evaluationCriteria: ["Is there a genuine emotional reason to act now?", "Is there enough logic to justify the decision to a skeptical part of the reader (or their boss/spouse)?"],
    failureModes: ["All logic, no desire (nothing pulls the reader to act)", "All hype, no justification (buyer's remorse, refunds)", "Leading emotional to a rational enterprise buyer"],
    compatibleFrameworks: ["awareness-routing", "objection-preemption"],
    tags: ["emotion", "logic", "motivation", "persuasion arc", "sequencing"],
    source: `${TRAINING}`,
  },

  // ─── OFFER ────────────────────────────────────────────────────────────────
  {
    id: "offer-value-stack",
    family: "offer",
    name: "Offer Value Stack",
    version: "1.0.0",
    purpose: "Present the offer as a stack of the operator's REAL deliverables, each with an honest value, so the total dwarfs the price — making the price feel like a discount on the value.",
    useCases: ["Priced offers (tripwire, course, high-ticket, productized service)", "The offer section of a sales page or VSL"],
    whenNotToUse: [
      "Free lead magnets (nothing to price-anchor)",
      "When the deliverables are thin — do not pad the stack with invented bonuses or fake values",
      "Ultra-premium/luxury positioning where itemized 'value' cheapens the brand",
    ],
    requiredInputs: ["offer.productOrService", "the REAL list of deliverables/bonuses", "offer.priceCents", "an honest value for each item"],
    decisionRules: [
      "Every stack item must be a REAL deliverable the buyer actually receives — never invented to inflate the total.",
      "Anchor each item's value against a real comparable (what the buyer would pay to get it elsewhere), not a made-up number.",
      "Sum to a genuine total value, then reveal the price beneath it — the gap does the persuading.",
      "Bonuses should solve the NEXT objection the buyer has after the core offer, not just add bulk.",
      "Pair the stack with a real guarantee to collapse the remaining risk.",
    ],
    psychologicalPrinciples: ["Price is judged relative to an anchor", "Itemization makes abstract value concrete", "Reciprocity and completeness raise perceived fairness"],
    structure: ["Core deliverable (value) → supporting deliverables (values) → objection-solving bonuses (values) → total value → price reveal → guarantee → CTA"],
    evaluationCriteria: [
      "Is every item real and actually delivered?",
      "Are the values defensible against real comparables, not fabricated?",
      "Does each bonus solve a specific next objection?",
    ],
    failureModes: [
      "Fabricated bonuses or inflated/round 'values' with no basis (a verification failure)",
      "A stack of filler that pads the total without adding real value",
      "Value stacking a luxury offer into feeling cheap",
    ],
    compatibleFrameworks: ["value-equation-lens", "honest-risk-reversal", "feature-to-benefit-ladder", "honest-urgency"],
    tags: ["offer", "value stack", "pricing", "bonuses", "anchor", "price reveal"],
    source: `${TRAINING} + established offer-stacking practice — bounded by the DivineX no-fabrication rule`,
  },
  {
    id: "honest-risk-reversal",
    family: "offer",
    name: "Honest Risk Reversal",
    version: "1.0.0",
    purpose: "Move the risk of the transaction from the buyer to the business with a guarantee the business genuinely offers — so 'what if it doesn't work' stops blocking the sale.",
    useCases: ["Any priced offer", "High-skepticism markets", "After the offer, before the final CTA"],
    whenNotToUse: ["When the business does NOT actually offer a guarantee — never invent one; use proof and a smaller first commitment instead"],
    requiredInputs: ["offer.guarantee (real, in the operator's own terms)"],
    decisionRules: [
      "Only state a guarantee the operator confirmed they honor — this is a legal and trust commitment, never fabricated.",
      "The stronger and more specific the guarantee, the more it converts — but it must be real.",
      "Name the exact terms (what, how long, how to claim) so it reads as a real promise, not marketing air.",
      "If no guarantee exists, reduce risk another honest way: a smaller first step, a trial, or transparent proof.",
    ],
    psychologicalPrinciples: ["Loss aversion — buyers fear wasting money more than they desire the gain", "A confident guarantee signals the seller's belief in the product"],
    structure: ["Name the risk the buyer feels → state the real guarantee and its exact terms → make claiming it easy → return to the CTA"],
    evaluationCriteria: ["Is the guarantee one the operator actually offers?", "Are the terms specific enough to be believed and honored?"],
    failureModes: ["Inventing a guarantee the business won't honor (a verification and legal failure)", "Vague 'satisfaction guaranteed' with no terms", "Burying the guarantee where the anxious buyer won't see it"],
    compatibleFrameworks: ["offer-value-stack", "objection-preemption", "single-cta-clarity"],
    tags: ["guarantee", "risk reversal", "refund", "trust", "offer"],
    source: `${TRAINING} — bounded by the DivineX no-fabrication rule`,
  },
  {
    id: "honest-urgency",
    family: "offer",
    name: "Honest Urgency & Scarcity",
    version: "1.0.0",
    purpose: "Give the reader a real reason to act now instead of later — using only genuine deadlines, limits, or costs of delay.",
    useCases: ["Enrollment windows, real capacity limits, genuine price changes, seasonal relevance", "Near the CTA"],
    whenNotToUse: ["When no genuine urgency exists — do NOT fabricate countdowns, fake scarcity, or invented deadlines"],
    requiredInputs: ["offer.urgency (real)", "any genuine deadline/limit/cost-of-delay"],
    decisionRules: [
      "Only use urgency that is TRUE: a real close date, real limited capacity, a real upcoming price change, or the genuine cost of staying stuck.",
      "The cost-of-delay (what staying in the problem keeps costing) is the most durable and always-honest form of urgency.",
      "Never reset a fake countdown or claim a scarcity the business doesn't have — it destroys trust and creates liability.",
    ],
    psychologicalPrinciples: ["Scarcity increases perceived value", "A deadline converts intention into action", "Loss framing (cost of delay) motivates more than gain framing"],
    structure: ["Establish the real constraint or cost of delay → make it concrete → tie it to the CTA (act before X)"],
    evaluationCriteria: ["Is the urgency literally true?", "Would it survive a customer asking 'is this deadline real?'"],
    failureModes: ["Fake countdown timers and invented scarcity (a verification failure and a trust killer)", "Manufactured pressure with no real basis", "Urgency with no consequence stated (a deadline for nothing)"],
    compatibleFrameworks: ["offer-value-stack", "single-cta-clarity"],
    tags: ["urgency", "scarcity", "deadline", "cost of delay", "offer"],
    source: `${TRAINING} — bounded by the DivineX no-fabrication rule`,
  },

  // ─── LANDING PAGE ─────────────────────────────────────────────────────────
  {
    id: "page-architecture-by-intent",
    family: "landing_page",
    name: "Page Architecture by Intent",
    version: "1.0.0",
    purpose: "Select the page's structure, length, and section set from the campaign objective, traffic temperature, and awareness — so commitment level drives architecture, not habit.",
    useCases: ["The first decision of any landing-page build — before any copy is written", "Mapping a strategy to a funnel genre + section sequence"],
    whenNotToUse: ["Never skip — even a one-fold page is a deliberate architecture choice"],
    requiredInputs: ["context.objective", "context.temperature", "audience.awareness", "offer.priceCents (free vs priced)"],
    decisionRules: [
      "Match page length to commitment: a free lead magnet earns a one-fold page; a card-number ask (paid tripwire/high-ticket) earns the full problem→proof→guarantee runway.",
      "lead_generation / lead_magnet → short, one hero + capture; minimal persuasion runway.",
      "appointment / consultation → outcome hero + who-it's-for + process + proof + booking.",
      "application (qualify-first) → hero + who-it's-for + who-it's-NOT-for + process + results + application.",
      "free_trial (SaaS) → outcome hero + product proof (mockups) + how-it-works + trial CTA; light on emotional runway.",
      "audit_request → problem hero + what-you'll-learn + credibility + request form.",
      "webinar_registration → hero + agenda + benefits + host + register.",
      "purchase (tripwire/sales) → hero + problem/solution + mechanism + proof + offer stack + guarantee + FAQ.",
      "Cold traffic needs more problem-education up top; hot traffic can jump toward the offer.",
      "Prefer reusable layout blocks (cards, grids, timelines, comparisons) over walls of text.",
    ],
    psychologicalPrinciples: ["Persuasion runway should scale with the size of the ask", "Structure itself communicates seriousness and fit"],
    structure: ["Objective + temperature + awareness → funnel genre → ordered section set → CTA cadence → form placement"],
    evaluationCriteria: [
      "Could a strategist explain why each section exists for THIS objective?",
      "Is the page length proportional to the commitment being asked?",
      "Would two different objectives produce visibly different architectures? (If a dentist and a SaaS get the same skeleton — fail.)",
    ],
    failureModes: ["Forcing every campaign into one fixed sequence", "A long sales page for a free download (or a one-fold page for a $5k ask)", "Section order that ignores awareness/temperature"],
    compatibleFrameworks: ["awareness-routing", "single-cta-clarity", "post-conversion-sequence-design"],
    tags: ["landing page", "architecture", "structure", "funnel", "sections", "page length"],
    source: `${TRAINING} + DivineX funnel frameworks (lib/funnels/frameworks.ts)`,
  },

  // ─── EMAIL ────────────────────────────────────────────────────────────────
  {
    id: "post-conversion-sequence-design",
    family: "email",
    name: "Post-Conversion Sequence Design",
    version: "1.0.0",
    purpose: "Design the email sequence that fires AFTER conversion from the same strategy as the page — with length and timing set by the objective, and a state transition that stops the sequence the moment the goal is met.",
    useCases: ["Every campaign with a follow-up (lead, appointment, trial, audit, purchase)", "Deciding sequence length + cadence + exit conditions"],
    whenNotToUse: ["Pure transactional confirmations with no nurture goal (a receipt is not a sequence)"],
    requiredInputs: ["context.objective", "conversionEvent", "the goal state that should STOP the sequence", "centralPromise (for message match)"],
    decisionRules: [
      "The sequence continues the PAGE's promise and mechanism — same central promise, no new positioning invented in email.",
      "Set length/timing from objective, not habit: lead nurture runs longer and educates; an appointment sequence is short and reduces no-shows; a trial sequence is paced to activation milestones.",
      "Every email must ADVANCE the conversation — email 2 is never email 1 reworded.",
      "Define the stop condition up front: booking booked → stop booking nurture; purchase made → stop sales sequence; unsubscribe → stop all marketing; no-show → branch to a no-show flow.",
      "Map the emotional/awareness journey across the sequence: deliver value → set expectations → educate → handle objections → prove → offer → follow up.",
    ],
    psychologicalPrinciples: ["Consistency: the follow-up must match the promise that converted them, or trust breaks", "Progress: each touch must move the relationship forward to keep attention"],
    structure: ["Immediate value/confirmation → expectation-setting → education → mechanism → objection handling → proof → offer/CTA → paced follow-up, with explicit branch + stop conditions"],
    evaluationCriteria: [
      "Does the sequence continue the page's exact promise (message match)?",
      "Does each email advance rather than repeat?",
      "Is there an explicit convert-and-stop transition so no one is stuck in the wrong sequence?",
    ],
    failureModes: [
      "Email 2 rehashing email 1",
      "A different promise/positioning than the landing page (message-match break)",
      "No stop condition — a converted buyer keeps getting sold, or a booked lead keeps getting booking nudges",
      "Fixed sequence length regardless of objective",
    ],
    compatibleFrameworks: ["single-idea-email", "page-architecture-by-intent", "objection-preemption"],
    tags: ["email", "sequence", "automation", "nurture", "lifecycle", "state transition", "message match"],
    source: `${TRAINING} + DivineX workflow engine (lib/workflows)`,
  },
  {
    id: "single-idea-email",
    family: "email",
    name: "Single-Idea Email",
    version: "1.0.0",
    purpose: "Build each email around one idea, one CTA, and one intended next state — so it's read, understood, and acted on.",
    useCases: ["Every email in a sequence", "Broadcasts and nurtures alike"],
    whenNotToUse: ["Rich transactional receipts/statements where completeness matters more than a single idea"],
    requiredInputs: ["the email's objective", "recipient state", "the one idea", "the one CTA"],
    decisionRules: [
      "One idea per email; if there are two, it's two emails.",
      "Subject + preview earn the open together — generate several subject candidates and pick the strongest, don't ship the first.",
      "Open with the reader's world, not the sender's ('Hope you're well' / 'Just checking in' / 'We wanted to reach out' are banned unless context truly calls for them).",
      "One clear CTA tied to the sequence's next state.",
    ],
    psychologicalPrinciples: ["Cognitive load: one idea is remembered and acted on; five are ignored", "Curiosity + relevance in the subject drive the open"],
    structure: ["Subject (tested) + preview → relevant opening → one useful idea → one CTA → sign-off that sets up the next email"],
    evaluationCriteria: ["Is there exactly one idea and one CTA?", "Would the subject earn an open in a full inbox?", "Does the opening speak to the reader, not the sender?"],
    failureModes: ["Multiple competing ideas/CTAs", "Filler openings ('just checking in')", "Shipping the first subject line without alternatives", "No clear next action"],
    compatibleFrameworks: ["post-conversion-sequence-design", "single-cta-clarity"],
    tags: ["email", "subject line", "cta", "copywriting", "one idea"],
    source: `${TRAINING}`,
  },
];

// ─── Query + selection helpers (pure) ─────────────────────────────────────

const BY_ID: Map<string, ConversionFramework> = new Map(
  CONVERSION_FRAMEWORKS.map((f) => [f.id, f]),
);

export function getFramework(id: string): ConversionFramework | undefined {
  return BY_ID.get(id);
}

export function allFrameworkIds(): string[] {
  return CONVERSION_FRAMEWORKS.map((f) => f.id);
}

export function frameworksByFamily(family: FrameworkFamily): ConversionFramework[] {
  return CONVERSION_FRAMEWORKS.filter((f) => f.family === family);
}

/**
 * Select a starter framework stack for a campaign from its objective,
 * awareness, and traffic temperature. Deliberately simple + rule-based for
 * v1 — a transparent default the strategy builder (next milestone) refines,
 * not a black box. Always returns real, existing framework ids.
 */
export function frameworksForStrategy(input: {
  objective: CampaignObjective | null;
  awareness: AwarenessLevel | null;
  temperature: TrafficTemperature | null;
  priced: boolean;
}): string[] {
  const stack = new Set<string>();

  // Foundational reasoning frameworks apply to every campaign.
  stack.add("awareness-routing");
  stack.add("sophistication-routing");
  stack.add("value-equation-lens");
  stack.add("page-architecture-by-intent");
  stack.add("headline-outcome-mechanism");
  stack.add("single-cta-clarity");
  stack.add("proof-specificity");
  stack.add("emotion-then-justification");

  // Priced offers earn the full offer + objection + risk machinery.
  if (input.priced) {
    stack.add("offer-value-stack");
    stack.add("honest-risk-reversal");
    stack.add("objection-preemption");
    stack.add("mechanism-reveal");
    stack.add("honest-urgency");
    stack.add("feature-to-benefit-ladder");
  } else {
    // Free/lead offers: keep it tight; lean on outcome + benefit + light proof.
    stack.add("feature-to-benefit-ladder");
  }

  // Colder traffic needs the mechanism + objection work to build belief.
  if (input.temperature === "cold" && !stack.has("mechanism-reveal")) {
    stack.add("mechanism-reveal");
    stack.add("objection-preemption");
  }

  // Every campaign with follow-up gets the email design frameworks.
  stack.add("post-conversion-sequence-design");
  stack.add("single-idea-email");

  return [...stack];
}

/**
 * Renders framework entries into the AiSuiteKnowledgeCard shape the existing
 * prompt builder already knows how to inject (mirrors
 * design-intelligence/principles.ts::renderPrinciplesAsCards). One card per
 * family, compact — purpose + the load-bearing decision rules + the failure
 * modes to avoid — so a later milestone can feed the selected stack into
 * create_funnel / the copy engine WITHOUT bloating the prompt or adding a
 * second parallel prompt section. Not wired into any live prompt yet.
 */
export function renderFrameworksAsCards(
  frameworks: ConversionFramework[],
): AiSuiteKnowledgeCard[] {
  if (frameworks.length === 0) return [];
  const byFamily = new Map<FrameworkFamily, ConversionFramework[]>();
  for (const f of frameworks) {
    const list = byFamily.get(f.family) ?? [];
    list.push(f);
    byFamily.set(f.family, list);
  }
  const FAMILY_TITLES: Record<FrameworkFamily, string> = {
    copywriting: "Conversion frameworks — copywriting",
    buyer_psychology: "Conversion frameworks — buyer psychology",
    offer: "Conversion frameworks — offer design",
    landing_page: "Conversion frameworks — landing-page architecture",
    email: "Conversion frameworks — email & lifecycle",
  };
  const cards: AiSuiteKnowledgeCard[] = [];
  for (const [family, list] of byFamily) {
    const body =
      "Reason with these when building this campaign — they are principles to apply against the strategy, not templates to paste, and every one is bounded by the no-fabrication rule (never invent proof, guarantees, stats, or urgency):\n\n" +
      list
        .map(
          (f) =>
            `• ${f.name} — ${f.purpose}\n` +
            `  Apply: ${f.decisionRules.slice(0, 3).join(" ")}\n` +
            `  Avoid: ${f.failureModes.slice(0, 2).join("; ")}`,
        )
        .join("\n\n");
    cards.push({
      id: `conversion-framework-${family}`,
      levels: ["sub-account"],
      title: FAMILY_TITLES[family],
      location: "DivineX Conversion Framework Library",
      keywords: ["conversion", "copywriting", "funnel", "landing page", "campaign", family, ...list.flatMap((f) => f.tags)],
      body,
    });
  }
  return cards;
}
