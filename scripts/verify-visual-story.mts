/**
 * THE VISUAL STORY — planner + source hierarchy.
 *
 * Two questions this has to keep answerable:
 *
 *   1. Does every visual serve a NAMED argument, in the page's own words?
 *   2. Did the source hierarchy get walked, rather than collapsed back into
 *      "no photograph, therefore text"?
 *
 * The second is the correction this suite exists to lock: a failed photo
 * search is a rung-2 declension, not a verdict about the page.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-visual-story.mts
 */
import { planVisualStory, describeVisualStory, conceptsOverlap, type ArgumentContext } from "../src/lib/funnels/visual-story.ts";
import { resolveVisualSource, resolveVisualStory, photoWouldQualify, type SourceInventory } from "../src/lib/funnels/visual-source.ts";
import { photoBriefForVisualJob } from "../src/lib/funnels/media-intent.ts";
import { compositionForSection, compositionAcceptsShape, compositionAcceptsPhoto } from "../src/lib/funnels/visual-placement.ts";
import type { FunnelSection } from "../src/types/funnels";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

type VisualJobLike = string;
const sec = (id: string, type: string, argumentRole: string, servesBelief?: string): FunnelSection =>
  ({ id, type, config: {}, argumentRole, ...(servesBelief ? { servesBelief } : {}) }) as unknown as FunnelSection;

// NORTHSTAR, as the page's own argument states it.
const NORTHSTAR: ArgumentContext = {
  arrivalContext: "Reading after another week of firefighting the same operational problems",
  currentBelief: "We need to hire our way out of this",
  oldWay: "Hire another delivery lead and hope the backlog clears",
  whyOldWayFails: "Every decision still routes back through the owner, so headcount multiplies an unclear process instead of fixing it",
  mechanism: "A delivery-path map that finds where the work actually stalls",
  corePromise: "Know which single operational fix to make before you hire again",
  primaryObjection: "Consultants produce a deck and disappear",
  closeReason: "Fixed scope, written findings, no retainer attached",
};

const NORTHSTAR_PAGE = [
  sec("s1", "hero", "hook"),
  sec("s2", "problem_solution", "belief_shift"),
  sec("s3", "benefits_grid", "promise"),
  sec("s4", "story", "mechanism"),
  sec("s5", "offer", "offer"),
  sec("s6", "faq", "objections"),
  sec("s7", "cta_banner", "close"),
];

// ── 1. The story follows the argument ───────────────────────────────────────
console.log("\n══ every visual serves a named argument ══");
{
  const beats = planVisualStory(NORTHSTAR_PAGE, NORTHSTAR);
  check("the page produces a visual story", beats.length >= 4, `${beats.length} beats`);
  check(
    "each beat names the job its section's role is asking for",
    beats.every((b) => !!b.visualJob && !!b.argumentRole),
  );
  check(
    "the problem beat is about the cost of the current state",
    beats.find((b) => b.argumentRole === "belief_shift")?.visualJob === "show_cost_of_current_state",
  );
  check(
    "... and its concept is the page's own sentence about the owner bottleneck",
    (beats.find((b) => b.argumentRole === "belief_shift")?.concept ?? "").includes("routes back through the owner"),
    beats.find((b) => b.argumentRole === "belief_shift")?.concept ?? "",
  );
  check(
    "the mechanism beat explains the mechanism",
    beats.find((b) => b.argumentRole === "mechanism")?.visualJob === "explain_mechanism",
  );
  // THE CLOSE IS NOT VISUALISED. A picture beside the ask competes with it.
  check("the close is left alone", !beats.some((b) => b.argumentRole === "close"));

  const story = describeVisualStory(beats);
  check("no concept is drawn twice", !story.repeatsConcept);
  check("no visual merely restates the one before it", !story.restatesPrevious);
  check("every beat but the first knows what it follows", beats.slice(1).every((b) => b.continuesFrom !== null));
  console.log(`     visual story: ${story.jobs.join(" → ")}`);
}
{
  // A JOB MAY RECUR WHEN IT CARRIES SOMETHING DIFFERENT. Three distinct
  // objections each deserve answering; what they may not do is share a
  // proposition.
  const twoObjections = [
    sec("o1", "faq", "objections", "Consultants produce a deck and disappear"),
    sec("o2", "faq", "objections", "We cannot pause delivery for a review"),
  ];
  const beats = planVisualStory(twoObjections, NORTHSTAR);
  check("a recurring job is allowed", beats.length === 2, `${beats.length} beats`);
  check("both are the same job", beats.every((b) => b.visualJob === "answer_objection"));
  check("carrying genuinely different concepts", !describeVisualStory(beats).repeatsConcept);
  check("and the recurrence is reported, not treated as a defect", describeVisualStory(beats).recurringJobs.includes("answer_objection"));

  // ... but the SAME objection twice is still refused.
  const sameTwice = [
    sec("o1", "faq", "objections", "Consultants produce a deck and disappear"),
    sec("o2", "faq", "objections", "Consultants just produce a deck and then disappear"),
  ];
  check("the same objection is not answered twice", planVisualStory(sameTwice, NORTHSTAR).length === 1);
}
{
  // NOTHING TRUE TO SAY, NOTHING TO SHOW.
  const empty = planVisualStory(NORTHSTAR_PAGE, {});
  check("an argument with no content produces no visuals", empty.length === 0, `${empty.length} beats`);
}
{
  // A repeated proposition is refused even across different roles.
  const repeated: ArgumentContext = { whyOldWayFails: "Work routes back through the owner", corePromise: "Work routes back through the owner" };
  const beats = planVisualStory(NORTHSTAR_PAGE, repeated);
  check("the same proposition is never drawn twice", beats.length === 1, `${beats.length} beats`);
  check("two ways of saying one thing still count as one", conceptsOverlap("Work routes back through the owner", "work routes back through the owner every time"));
  check("two genuinely different propositions do not", !conceptsOverlap("Work routes back through the owner", "Fixed scope and written findings in ten days"));
}

// ── 2. The source hierarchy is WALKED, not collapsed ────────────────────────
console.log("\n══ a rejected photograph is not a verdict ══");
const beats = planVisualStory(NORTHSTAR_PAGE, NORTHSTAR);
const problemBeat = beats.find((b) => b.visualJob === "show_cost_of_current_state")!;
const promiseBeat = beats.find((b) => b.visualJob === "make_future_tangible")!;
// A host that CAN compose. Most sections cannot, and a beat whose host cannot
// is text-led by design — the cases below are about the hierarchy, so they are
// given a host that composes and the placement rules get their own section.
const base: SourceInventory = { category: "b2b_services", photos: [], hostComposition: "split" };

{
  // THE NORTHSTAR CASE, END TO END. Real generic business stock, of the kind
  // the provider actually returns for this page — none of it about the
  // concept, all of it correctly rejected at rung 2.
  const photos = [
    { url: "a", alt: "Close-up of hands reviewing business charts and notes on a wooden desk" },
    { url: "b", alt: "Two business professionals engaged in a collaborative meeting" },
    { url: "c", alt: "Surgeons in an operating room performing a delicate procedure" },
  ];
  check(
    "none of the real candidates clears the relevance bar",
    !photos.some((p) => photoWouldQualify(problemBeat.concept, p.alt)),
  );
  const resolved = resolveVisualSource(problemBeat, { ...base, photos });
  check("so the beat falls THROUGH photography, not out of the story", resolved.source !== "text_led", resolved.source);
  check("and lands on a constructed visual", resolved.source === "constructed", `${resolved.source} (${resolved.reason})`);
  check("drawn as the owner bottleneck", resolved.shape === "hub_bottleneck", resolved.shape ?? "");
}
{
  // A SHAPE IS EARNED BY THE CONCEPT, NEVER ISSUED BY THE JOB.
  //
  // This used to assert that the promise beat "draws a different shape",
  // which it did — from a per-job DEFAULT. Probed across twelve real
  // model-written arguments, that default produced a wrong diagram every
  // single time (a network for "at $29 this is accessible enough to try").
  // Northstar's promise, "know what to fix before you hire again", asserts no
  // relationship at all, so there is nothing honest to draw.
  const forward = resolveVisualSource(promiseBeat, base);
  check("a concept asserting no relationship is not drawn", forward.source === "text_led", `${forward.source}/${forward.shape ?? ""}`);
  check("... and no default shape is issued for its job", forward.shape === undefined, forward.shape ?? "none");

  // The same JOB, with a concept that genuinely asserts a spread, is drawn.
  const spread = { ...promiseBeat, concept: "the work is distributed across the team instead of waiting on you" };
  const drawn = resolveVisualSource(spread, base);
  check("the same job IS drawn when the concept asserts one", drawn.shape === "distributed_network", drawn.shape ?? "none");
  check("which is not the shape of the problem", drawn.shape !== "hub_bottleneck");
}
{
  // SUMMIT. Where a photograph genuinely is about the concept, rung 2 wins and
  // rung 3 is never reached — constructed visuals must not displace real ones.
  const roofBeat = { ...problemBeat, concept: "residential roof inspection documenting storm damage" };
  const resolved = resolveVisualSource(roofBeat, {
    category: "local_service_trade",
    hostComposition: "split",
    serviceDomain: "residential roof inspection",
    photos: [
      { url: "x", alt: "Office desk with a laptop" },
      { url: "y", alt: "Roof inspection of a residential roof showing damaged shingles" },
    ],
  });
  check("a relevant photograph outranks a diagram", resolved.source === "contextual_photo", resolved.source);
  check("and it is the relevant one, not the first", resolved.url === "y", resolved.url ?? "");
}
{
  // RUNG 1 OUTRANKS EVERYTHING — but only when approved.
  const approved = resolveVisualSource(problemBeat, { ...base, firstParty: [{ url: "own.jpg", approved: true }] });
  check("an approved customer asset wins the beat", approved.source === "first_party", approved.source);
  const unapproved = resolveVisualSource(problemBeat, { ...base, firstParty: [{ url: "own.jpg", approved: false }] });
  check("an unapproved upload does not", unapproved.source !== "first_party", unapproved.source);
}
{
  // AUTHENTICITY IS NOT WEAKENED. A category that cannot photograph honestly
  // still cannot, even with a perfectly relevant candidate — it goes to a
  // drawing, which asserts nothing about the business.
  const resolved = resolveVisualSource(problemBeat, {
    category: "coaching",
    photos: [{ url: "z", alt: "Work routes back through the owner in a growing business" }],
  });
  check("a strict category still gets no photograph", resolved.source !== "contextual_photo", resolved.source);
}
{
  // PROOF IS NEVER DRAWN. A diagram of evidence is a fabricated claim.
  const proofBeat = { ...problemBeat, visualJob: "establish_proof" as const, concept: "customers rate the service highly" };
  const resolved = resolveVisualSource(proofBeat, base);
  check("proof is never satisfied by a constructed visual", resolved.source !== "constructed", resolved.source);
}
{
  // AND TEXT-LED STILL EXISTS, as the last rung rather than the reflex.
  const unrenderable = { ...problemBeat, visualJob: "direct_to_action" as const, concept: "book the call today" };
  const resolved = resolveVisualSource(unrenderable, base);
  check("a concept no medium can carry ends text-led", resolved.source === "text_led", resolved.source);
}

// ── 3. A visual must add something the page does not already say ────────────
console.log("\n══ a drawing that redraws the page is declined ══");
{
  // THE FAILURE THE FIRST RENDER SHOWED. A drawn 1-2-3 sequence shipped
  // immediately above a process section that said the same thing with real
  // step labels. The concept was sound; the visual was redundant.
  // A mechanism concept that genuinely asserts ordered stages. Northstar's own
  // ("a delivery-path map that finds where the work stalls") describes an
  // artifact rather than a relationship and is correctly left undrawn, so the
  // redundancy rules below are exercised with a concept that does assert one.
  const mech = {
    ...beats.find((b) => b.visualJob === "explain_mechanism")!,
    concept: "we walk the delivery path in stages, one stage at a time, until the work stalls",
  };
  const alone = resolveVisualSource(mech, base);
  check("a mechanism beat can be drawn when nothing else says it", alone.source === "constructed", alone.source);

  const beside = resolveVisualSource(mech, { ...base, nearbyDevices: ["sequence"] });
  check("but not beside a process section that already renders one", beside.source !== "constructed", `${beside.source} — ${beside.reason}`);

  const said = resolveVisualSource(mech, { ...base, nearbyContent: mech.concept });
  check("and not where the copy already communicates it", said.source !== "constructed", `${said.source} — ${said.reason}`);
}
{
  // THE SHAPE FOLLOWS THE RELATIONSHIP, NOT THE JOB.
  const bottleneck = { ...problemBeat, visualJob: "explain_mechanism" as const, concept: "every decision routes back through the owner" };
  check("a mechanism about a bottleneck is not drawn as a sequence", resolveVisualSource(bottleneck, base).shape === "hub_bottleneck", resolveVisualSource(bottleneck, base).shape ?? "");
  const spread = { ...problemBeat, visualJob: "explain_mechanism" as const, concept: "responsibility is distributed across the team" };
  check("one about distributed ownership is drawn as a network", resolveVisualSource(spread, base).shape === "distributed_network");
  const steps = { ...problemBeat, visualJob: "make_future_tangible" as const, concept: "we walk your delivery path end to end, stage by stage" };
  check("and one that really is ordered steps is drawn as a sequence", resolveVisualSource(steps, base).shape === "sequence");
}
{
  // PHOTOGRAPHY ANSWERS THE SAME QUESTION AS THE DRAWING.
  const generic = "Businessman on a video call with a laptop in a modern office";
  check(
    "a generic business photo is not about the bottleneck concept",
    !photoWouldQualify(problemBeat.concept, generic),
  );
  const resolved = resolveVisualSource(problemBeat, { ...base, photos: [{ url: "g", alt: generic }] });
  check("so it does not take the beat", resolved.source !== "contextual_photo", resolved.source);
}

// ── 4. A visual must have somewhere to PARTICIPATE ──────────────────────────
console.log("\n══ composition is part of the decision ══");
{
  // The failure the second render showed: a drawing appended in a band under
  // its own section, reading as a footnote rather than as half a beat. A beat
  // whose host cannot compose is now text-led, on structural grounds.
  const homeless = resolveVisualSource(problemBeat, { ...base, hostComposition: null });
  check("a beat with no composition is text-led, not appended", homeless.source === "text_led", `${homeless.source} — ${homeless.reason}`);
  check("... and says so as a composition decision", homeless.reason.includes("composes without"), homeless.reason);

  const placed = resolveVisualSource(problemBeat, base);
  check("a beat that can participate carries its composition", placed.composition === "split", placed.composition ?? "none");

  // A DIAGRAM IS READ; THE FOLD IS RECOGNISED.
  const fold = resolveVisualSource(problemBeat, { ...base, hostComposition: "fold_media" });
  check("no constructed visual takes the fold", fold.source !== "constructed", `${fold.source} — ${fold.reason}`);
  const foldPhoto = resolveVisualSource(
    { ...problemBeat, concept: "residential roof inspection documenting storm damage" },
    { category: "local_service_trade", hostComposition: "fold_media", serviceDomain: "residential roof inspection",
      photos: [{ url: "y", alt: "Roof inspection of a residential roof showing damaged shingles" }] },
  );
  check("but a real photograph still can", foldPhoto.source === "contextual_photo", foldPhoto.source);
  check("... composed as the split fold", foldPhoto.composition === "fold_media", foldPhoto.composition ?? "none");

  // Placement never overrides an explicit choice: rung 1 still wins the beat.
  const owned = resolveVisualSource(problemBeat, { ...base, firstParty: [{ url: "own.jpg", approved: true }] });
  check("an approved asset is placed in the host's composition", owned.source === "first_party" && owned.composition === "split");
}

// ── 4b. A benefits grid may host one, conditionally ─────────────────────────
console.log("\n══ a benefits grid earns a visual, never inherits one ══");
{
  const grid = (n: number, variant?: string) =>
    ({ id: "g", type: "benefits_grid", config: { items: Array.from({ length: n }, () => ({ title: "x" })), ...(variant ? { variant } : {}) } }) as unknown as FunnelSection;

  check("a short checklist can give up half its width", compositionForSection(grid(3)) === "split", String(compositionForSection(grid(3))));
  check("a long one takes a visual that LEADS it instead", compositionForSection(grid(5)) === "anchor", String(compositionForSection(grid(5))));
  check("an empty grid hosts nothing", compositionForSection(grid(0)) === null);
  // The other variants ARE already a composed visual device.
  for (const v of ["process_flow", "document_showcase", "alternating_image"]) {
    check(`a ${v} grid composes without one`, compositionForSection(grid(3, v)) === null, String(compositionForSection(grid(3, v))));
  }

  // THE CARDS ALREADY ENUMERATE. A sequence beside a list is the list again.
  check("no sequence beside a checklist", !compositionAcceptsShape("benefits_grid", "split", "sequence"));
  check("but a relationship the cards cannot express is welcome", compositionAcceptsShape("benefits_grid", "split", "hub_bottleneck"));
  // THE ANCHOR IS EARNED BY DEPICTING A CHANGE.
  check("only a transition may lead a section", compositionAcceptsShape("benefits_grid", "anchor", "state_contrast"));
  check("a static relationship may not", !compositionAcceptsShape("benefits_grid", "anchor", "distributed_network"));
  check("and no photograph may", !compositionAcceptsPhoto("anchor"));
  check("... though one may sit beside a short list", compositionAcceptsPhoto("split"));

  // END TO END: the promise beat on a real-shaped grid.
  const promise = { ...promiseBeat, concept: "responsibility is distributed across the team instead of routing through one person" };
  const short = resolveVisualSource(promise, { ...base, hostComposition: "split", hostType: "benefits_grid" });
  check("a short grid draws the relationship", short.source === "constructed" && short.shape === "distributed_network", `${short.source} — ${short.reason}`);
  const long = resolveVisualSource(promise, { ...base, hostComposition: "anchor", hostType: "benefits_grid" });
  check("a long grid declines a static relationship rather than forcing it", long.source === "text_led", `${long.source} — ${long.reason}`);
}

// ── 5. Shape progression ────────────────────────────────────────────────────
console.log("\n══ the page does not draw the same shape twice ══");
{
  const bottleneck = { ...problemBeat, concept: "every decision routes back through the owner" };
  const first = resolveVisualSource(bottleneck, base);
  check("the first hub is drawn", first.source === "constructed" && first.shape === "hub_bottleneck");

  // A DIFFERENT CONCEPT IS NOT ENOUGH. The reader does not see two
  // propositions, they see the same picture again.
  const second = { ...problemBeat, concept: "every approval routes back through one person before anything ships" };
  const repeat = resolveVisualSource(second, { ...base, shapesUsedOnPage: ["hub_bottleneck"] });
  check("a second, genuinely different concept is NOT drawn as the same shape", repeat.source !== "constructed", `${repeat.source} — ${repeat.reason}`);
  check("... and the reason names the repetition", repeat.reason.includes("already draws"), repeat.reason);

  // AND IT IS NOT SOLVED BY PICKING ANOTHER SHAPE. A substituted shape would
  // communicate the concept less accurately, so the visual is declined instead.
  check("no substitute shape is reached for", repeat.shape === undefined, repeat.shape ?? "none");

  // A genuinely different RELATIONSHIP still gets drawn.
  const spread = { ...problemBeat, visualJob: "make_future_tangible" as const, concept: "responsibility is distributed across the team" };
  const forward = resolveVisualSource(spread, { ...base, shapesUsedOnPage: ["hub_bottleneck"] });
  check("a different relationship is still drawn", forward.source === "constructed" && forward.shape === "distributed_network", forward.shape ?? "");
}
{
  // Resolved as a STORY, the invariant holds without the caller remembering.
  const many = [
    { ...problemBeat, sectionId: "a", concept: "every decision routes back through the owner" },
    { ...problemBeat, sectionId: "b", concept: "the whole pipeline waits on one approver, so nothing moves until they look at it" },
  ];
  const resolvedStory = resolveVisualStory(many, () => base);
  const drawn = resolvedStory.filter((r) => r.source === "constructed");
  check("resolving the story enforces progression by construction", drawn.length === 1, `${drawn.length} drawn`);
  check("no two resolved visuals share a shape", new Set(drawn.map((r) => r.shape)).size === drawn.length);
}

// ── 5b. No shape is ever issued by the job alone ────────────────────────────
console.log("\n══ a drawing asserts a relationship the page actually stated ══");
{
  // Real concepts, verbatim, from pages a model wrote. Every one of these was
  // drawn by the old per-job default, and not one of them asserts the
  // relationship it was given. They are the regression this locks.
  const bogus: [VisualJobLike, string][] = [
    ["make_future_tangible", "At $29, this is accessible enough to try without buyer's remorse."],
    ["make_future_tangible", "Lifetime access means I can stay sharp and adapt as my style evolves."],
    ["answer_objection", "An application call (not an impulse signup) ensures you're a fit and this works for your situation."],
    ["show_cost_of_current_state", "A one-time gift doesn't match the magnitude of the task, so donors feel like their impact is small."],
  ];
  for (const [job, concept] of bogus) {
    const r = resolveVisualSource({ ...problemBeat, visualJob: job as never, concept }, base);
    check(`not drawn: "${concept.slice(0, 52)}…"`, r.source !== "constructed", `${r.source}/${r.shape ?? ""}`);
  }
  // And a concept that DOES assert fragmentation is drawn as fragmentation,
  // not as the hub the old default handed every cost-of-current-state beat.
  const frag = {
    ...problemBeat,
    concept: "Your client work is scattered across spreadsheets and sticky notes instead of in one place",
  };
  const r = resolveVisualSource(frag, base);
  check("a fragmentation argument is drawn as fragmentation", r.shape === "fragmented_to_connected", r.shape ?? "none");
}

// ── 5c. Context-establishing photography, narrowly ──────────────────────────
console.log("\n══ a photograph may ground an abstract argument ══");
{
  // THE SUMMIT CASE. The belief shift is a conflict of interest: true, central,
  // and impossible to photograph. Judged against it, honest roof photographs
  // score one term and are refused, so the page composed with no image at all.
  // Genuinely unphotographable: it shares no subject term with any honest
  // photograph of the work, which is exactly the condition 2b exists for.
  const abstract = {
    ...problemBeat,
    concept: "When the person assessing is also the person selling, you can never tell whose interest the recommendation actually serves",
  };
  const roofPhotos = [{ url: "r", alt: "Roof inspection of a residential roof showing damaged shingles" }];
  const trade: SourceInventory = { category: "local_service_trade", hostComposition: "split", hostType: "problem_solution", photos: roofPhotos, serviceDomain: "residential roof inspection" };

  const withoutContext = resolveVisualSource(abstract, trade);
  check("the concept alone cannot take the photograph", withoutContext.source !== "contextual_photo", withoutContext.source);

  const withContext = resolveVisualSource(abstract, { ...trade, contextSubject: "residential roof inspection in Houston" });
  check("the verified business subject can ground it", withContext.source === "contextual_photo", `${withContext.source} — ${withContext.reason}`);
  check("... and says so as a grounding decision", withContext.reason.includes("abstract"), withContext.reason);

  // ARGUMENT-DEPICTING STILL WINS WHEN IT CAN. A concept a photograph really
  // does depict never falls through to grounding.
  const depictable = { ...problemBeat, concept: "residential roof inspection documenting storm damage to shingles" };
  const direct = resolveVisualSource(depictable, { ...trade, contextSubject: "residential roof inspection in Houston" });
  check("a depicting photograph is preferred", direct.reason.includes("depicts this beat"), direct.reason);

  // ONE PER PAGE.
  const second = resolveVisualSource(abstract, { ...trade, contextSubject: "residential roof inspection in Houston", contextPhotoUsedOnPage: true });
  check("a second context photograph is refused", second.source !== "contextual_photo", `${second.source} — ${second.reason}`);
}
{
  // GENERIC STOCK IS STILL REFUSED, and this is the whole risk of the branch:
  // a category that permits photography is not permission for ANY photograph.
  const abstract = { ...problemBeat, concept: "Every decision still routes back through the owner, so headcount multiplies an unclear process" };
  const generic = [
    { url: "a", alt: "Businessman on a video call with a laptop in a modern office" },
    { url: "b", alt: "Two business professionals shaking hands in a conference room" },
    { url: "c", alt: "Smiling team collaborating around a desk with sticky notes on a whiteboard" },
  ];
  const consultancy: SourceInventory = {
    category: "b2b_services", hostComposition: "split", hostType: "problem_solution",
    photos: generic, contextSubject: "operations strategy review for services businesses",
    serviceDomain: "operations strategy consulting",
  };
  const r = resolveVisualSource(abstract, consultancy);
  check("generic business stock cannot ground anything", r.source !== "contextual_photo", `${r.source} — ${r.reason}`);
  check("... so Northstar stays text-led or drawn", r.source === "constructed" || r.source === "text_led", r.source);

  // A category that cannot photograph honestly is unaffected by the new branch.
  const strict = resolveVisualSource(abstract, {
    category: "info_product", hostComposition: "split", hostType: "problem_solution",
    photos: [{ url: "z", alt: "A paediatric sleep consultant guide for the first 30 nights" }],
    contextSubject: "a 24-page sleep guide", serviceDomain: "paediatric sleep coaching",
  });
  check("a strict category still gets no photograph", strict.source !== "contextual_photo", strict.source);
}

// ── 5d. Persuasion copy cannot establish the photographic domain ────────────
console.log("\n══ marketing language never decides what gets photographed ══");
{
  // THE COFFEE-CUP FAILURE. An operations page headlined "Find Out Where
  // Delivery Breaks Before You Double Volume" searched on its own HEADLINE and
  // took a photograph of takeaway cups captioned "perfect for takeout or
  // delivery". The photograph really is about delivery — the other sense of it.
  //
  // This is NOT tested with a blacklist of ambiguous words. Every word below is
  // polysemous and the list has no end (pipeline, traffic, conversion,
  // engagement, lead, close, application...). What is proved instead is
  // STRUCTURAL: a field written to persuade cannot reach the photo brief at
  // all, so whichever domain its words happen to belong to is irrelevant.
  const persuasionOnly = [
    ["operations delivery", "Find Out Where Delivery Breaks Before You Double Volume"],
    ["application", "Apply for a Review, by Application Only"],
    ["pipeline", "Your Pipeline Is Leaking Before Anyone Talks Price"],
    ["traffic", "Your Traffic Converts Worse Than It Should"],
    ["conversion", "The Conversion Problem Nobody Named For You"],
    ["engagement", "Engagement Drops Right Where It Matters Most"],
    ["lead", "Every Lead You Paid For Is Going Cold"],
    ["closing", "Stop Losing Deals At Closing"],
  ] as const;
  for (const [label, headline] of persuasionOnly) {
    // The ONLY thing available is persuasion copy — no media_subject, no
    // description of the work, no industry.
    const brief = photoBriefForVisualJob("explain_mechanism", {
      authenticityCategory: "b2b_services",
      businessName: "Northstar",
      // `offer`/`mechanism` are no longer part of the context type at all, so a
      // headline literally cannot be handed to the brief. This asserts the
      // outcome that follows: nothing describes the work, so nothing is
      // photographed.
    } as never);
    check(`${label}: persuasion copy alone yields no photo brief`, brief === null, `${headline.slice(0, 34)}…`);
  }

  // ... and the SAME businesses, once they describe their actual work, are
  // photographed normally. Declining is about absent description, not about
  // these being forbidden industries.
  const described = photoBriefForVisualJob("explain_mechanism", {
    authenticityCategory: "b2b_services",
    explicitSubject: "warehouse conveyor and scanner systems being commissioned",
  } as never);
  check("a described business still gets a brief", described !== null, described?.subject ?? "none");
  check("... built from the description, not the headline", (described?.subject ?? "").includes("warehouse"), described?.subject ?? "");
}

// ── 6. Photography enters through the same pipeline ─────────────────────────
console.log("\n══ one authority for every medium ══");
{
  // The retired pass wrote a business-level brief and searched once. The brief
  // is now derived from the BEAT, and still never from the argument's prose —
  // the query steers the provider; the concept decides placement.
  const ctx = { authenticityCategory: "b2b_services" as const, explicitSubject: "warehouse operations review" };
  const mech = photoBriefForVisualJob("explain_mechanism", ctx);
  check("a mechanism beat asks for the work being performed", !!mech && mech.purpose === "show_the_work", mech?.subject ?? "none");
  const hook = photoBriefForVisualJob("recognise_problem", ctx);
  check("a recognition beat asks plainly for the context", !!hook && hook.purpose === "establish_context", hook?.subject ?? "none");
  // PROOF IS NEVER A STOCK PHOTOGRAPH. A photograph of evidence is invented
  // evidence, exactly as a drawing of it would be.
  check("proof asks for no photograph at all", photoBriefForVisualJob("establish_proof", ctx) === null);
  check("nor does a call to action", photoBriefForVisualJob("direct_to_action", ctx) === null);
  // A category that cannot photograph honestly gets no brief, so no search is
  // ever spent on it.
  check(
    "a strict category produces no brief",
    photoBriefForVisualJob("explain_mechanism", { authenticityCategory: "info_product", explicitSubject: "a 24-page guide" }) === null,
  );
}

console.log(failures === 0 ? "\nVISUAL STORY: ALL CHECKS PASSED\n" : `\nVISUAL STORY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
