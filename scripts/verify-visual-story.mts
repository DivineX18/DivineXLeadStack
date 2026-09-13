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
import { resolveVisualSource, photoWouldQualify, type SourceInventory } from "../src/lib/funnels/visual-source.ts";
import type { FunnelSection } from "../src/types/funnels";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

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
const base: SourceInventory = { category: "b2b_services", photos: [] };

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
  // ... and the NEXT beat moves the story on rather than redrawing it.
  const forward = resolveVisualSource(promiseBeat, base);
  check("the future-state beat draws a different shape", forward.shape === "distributed_network", forward.shape ?? "");
  check("which is not the shape of the problem", forward.shape !== "hub_bottleneck");
}
{
  // SUMMIT. Where a photograph genuinely is about the concept, rung 2 wins and
  // rung 3 is never reached — constructed visuals must not displace real ones.
  const roofBeat = { ...problemBeat, concept: "residential roof inspection documenting storm damage" };
  const resolved = resolveVisualSource(roofBeat, {
    category: "local_service_trade",
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
  const mech = beats.find((b) => b.visualJob === "explain_mechanism")!;
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

console.log(failures === 0 ? "\nVISUAL STORY: ALL CHECKS PASSED\n" : `\nVISUAL STORY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
