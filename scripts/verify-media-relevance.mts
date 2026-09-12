/**
 * MEDIA RELEVANCE + SALES-ARGUMENT SALVAGE — deterministic regression.
 *
 * Two defects that both shipped to a rendered page and neither of which any
 * existing check could see.
 *
 * The roof-inspection hero rendered a photograph of two people in hard hats
 * standing indoors beside a window. Nothing was broken: the provider matched
 * "construction", the resolver took the first result, and every check passed
 * because the image loaded, had alt text, and was not used twice. Relevance was
 * simply nobody's job.
 *
 * The sales argument was discarded in full whenever `belief_chain` arrived as a
 * string rather than an array, taking prospect, mechanism, promise and close
 * reason down with it, which is what left every page closing on "Ready?" with a
 * "Get started" button.
 *
 *   npx tsx scripts/verify-media-relevance.mts
 */
import { countMediaMatches, mediaIsRelevant, scoreActionFit, selectRelevantMedia } from "../src/lib/funnels/media-intent.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── The photograph that actually shipped ────────────────────────────────────
console.log("\n══ the wrong photograph is rejected ══");
const roofHero = { subject: "professional residential roof inspection Houston work in progress" };
{
  // Pexels' own description of the image that shipped on the Summit hero.
  const wrong = "Man and woman wearing white hard hats standing indoors near a window";
  check("the indoor hard-hat photo is rejected", !mediaIsRelevant(roofHero, wrong), `${countMediaMatches(roofHero, wrong)} matches`);
}
{
  const right = "Roofer inspecting damaged shingles on a residential roof";
  check("a photograph of the actual subject is accepted", mediaIsRelevant(roofHero, right), `${countMediaMatches(roofHero, right)} matches`);
}
{
  // An unlabelled photograph is not evidence that it shows the right thing.
  check("a candidate with no description is rejected", !mediaIsRelevant(roofHero, ""));
}
{
  // Industry adjacency alone must not be enough — this is the whole failure.
  const adjacent = "Construction site with scaffolding and workers";
  check("industry adjacency alone does not qualify", !mediaIsRelevant(roofHero, adjacent), `${countMediaMatches(roofHero, adjacent)} matches`);
}

console.log("\n══ selection prefers the best, or nothing ══");
{
  const picked = selectRelevantMedia(roofHero, [
    { alt: "Man and woman wearing white hard hats standing indoors", url: "a" },
    { alt: "Roof inspection of a residential home showing damaged shingles", url: "b" },
    { alt: "Office desk with laptop", url: "c" },
  ]);
  check("the relevant candidate is chosen over the first result", picked?.pick.url === "b", picked?.pick.url ?? "none");
}
{
  const none = selectRelevantMedia(roofHero, [
    { alt: "Office desk with laptop", url: "a" },
    { alt: "Woman smiling at camera", url: "b" },
  ]);
  check("when nothing is relevant, nothing is placed", none === null);
}
{
  check("an empty candidate list yields nothing", selectRelevantMedia(roofHero, []) === null);
}

// ── Not industry-specific ───────────────────────────────────────────────────
console.log("\n══ the rule is not about any one industry ══");
{
  const dental = { subject: "dentist reassuring an anxious patient in a calm treatment room" };
  check("a matching dental photo qualifies", mediaIsRelevant(dental, "Dentist talking with a patient in a treatment room"));
  check("a mismatched dental photo does not", !mediaIsRelevant(dental, "Man repairing a car engine"));
  const bakery = { subject: "baker shaping sourdough loaves in a bakery kitchen" };
  check("a matching bakery photo qualifies", mediaIsRelevant(bakery, "Baker kneading sourdough in a kitchen"));
}
{
  // Stemming without a stemmer: the query says "roof", the photo says "roofing".
  check("a word stem still matches", mediaIsRelevant({ subject: "roof repair" }, "Roofing repairs on a house"));
}
{
  // Filler words in the brief must not be able to earn a match on their own.
  const n = countMediaMatches({ subject: "professional work in progress" }, "A professional at work");
  check("scaffolding words alone cannot qualify a photo", n === 0, `${n} matches`);
}

// ── The action, not the category ────────────────────────────────────────────
console.log("\n══ the photograph should show the job being done ══");
{
  // The Summit hero shipped a technically relevant roofline for a page whose
  // whole offer is an INSPECTION. Relevant is not the same as persuasive.
  const scenery = "A residential roof against a cloudy sky";
  const working = "Roof inspector examining shingles on a residential roof";
  check("scenery scores no action fit", scoreActionFit(scenery) === 0, `${scoreActionFit(scenery)}`);
  check(
    "the work being performed outscores the scenery",
    scoreActionFit(working) > scoreActionFit(scenery),
    `${scoreActionFit(working)} vs ${scoreActionFit(scenery)}`,
  );
}
{
  const intent = { subject: "residential roof inspection Houston", purpose: "show_the_work" as const };
  const picked = selectRelevantMedia(intent, [
    { alt: "A residential roof against a cloudy sky", url: "scenery" },
    { alt: "Inspector examining a residential roof", url: "working" },
  ]);
  check("the working photograph is preferred over equally relevant scenery", picked?.pick.url === "working", picked?.pick.url ?? "none");
}
{
  // Subject match still dominates: a vivid photo of the wrong thing loses.
  const intent = { subject: "residential roof inspection Houston", purpose: "show_the_work" as const };
  const picked = selectRelevantMedia(intent, [
    { alt: "Roof inspection of a residential property", url: "right" },
    { alt: "Dentist examining a patient in a clinic", url: "wrong-but-active" },
  ]);
  check("action fit never outranks being about the subject", picked?.pick.url === "right", picked?.pick.url ?? "none");
}
{
  // Generic across industries, not a roofing rule.
  check(
    "a bakery at work outscores an empty one",
    scoreActionFit("Baker kneading dough in a kitchen") > scoreActionFit("An empty bakery counter at dawn"),
    `${scoreActionFit("Baker kneading dough in a kitchen")} vs ${scoreActionFit("An empty bakery counter at dawn")}`,
  );
  check("an empty room scores nothing", scoreActionFit("An empty bakery counter at dawn") === 0);
}

// ── A SCHEMA TOKEN IS NOT A SUBJECT ─────────────────────────────────────────
console.log("\n══ the brief describes the work, not the strategy ══");
{
  // WHAT ACTUALLY SHIPPED ON THE CONSULTANT PAGE. `objective` is a strategy
  // enum, and it was read as "what the business does", so the brief became
  // "application close up detail". Everything downstream then worked exactly as
  // designed: the relevance test matched "application" to a caption reading
  // "a person applying green face paint" on the four-letter stem, and a
  // face-painting close-up shipped beside "Past the founder-led stage".
  //
  // The rule is upstream — only a description of the work may become a brief —
  // so this asserts the two halves that matter: the enum never reaches the
  // planner, and the real words still do.
  const objectiveAsBrief = { subject: "application close up detail" };
  const facePaint = "Detailed shot of a person applying green face paint meticulously with a brush.";
  check(
    "the caption that matched the enum really does match it (the defect was upstream)",
    mediaIsRelevant(objectiveAsBrief, facePaint),
    `${countMediaMatches(objectiveAsBrief, facePaint)} matches`,
  );

  const { planMediaIntents } = await import("../src/lib/funnels/media-intent.ts");
  // The exact context the consultant generation produced: no media_subject, no
  // hero brief, and the objective enum no longer offered as a description.
  const intents = planMediaIntents(
    {
      businessName: "Operations Strategy Review",
      whatTheyDo: null,
      offer: "Find Out Where Delivery Breaks Before You Double the Volume",
      explicitSubject: null,
      mechanism: "A structured review that stress-tests the current delivery model against doubled volume",
      authenticityCategory: "b2b_services",
    },
    { hero: true, benefitCount: 4 },
  );
  check(
    "no slot asks for a photograph of a conversion objective",
    !intents.some((i) => /\b(application|lead_generation|purchase|consultation|donation|free_trial|appointment)\b/i.test(i.subject)),
    intents.map((i) => i.subject).join(" / "),
  );
  // Judged the way the resolver judges: on the business's own subject, never on
  // the angle the planner appended.
  const rel = (i: { subjectCore: string }, alt: string) => mediaIsRelevant({ subject: i.subjectCore }, alt);
  check(
    "the face-paint photograph no longer qualifies for any slot",
    !intents.some((i) => rel(i, facePaint)),
    intents.filter((i) => rel(i, facePaint)).map((i) => i.subject).join(" / "),
  );
  const realEstate =
    "Real estate agent greeting a client at the entrance of a new home, symbolizing a welcoming embrace for potential buyers.";
  check("the real-estate photograph no longer qualifies for any slot", !intents.some((i) => rel(i, realEstate)));
  // THE ANGLE'S OWN WORDS ARE NOT EVIDENCE. Judged against the full brief this
  // same photograph scored two matches, on "client" and "home" — both supplied
  // by the planner, neither about the business.
  const angled = intents.find((i) => /homeowner or client/.test(i.subject));
  check(
    "the angle's vocabulary cannot qualify a photograph on its own",
    !!angled && mediaIsRelevant({ subject: angled.subject }, realEstate) && !rel(angled, realEstate),
    angled?.subject ?? "no angled slot",
  );
  // ... and a business that DOES describe its work still gets briefs.
  const real = planMediaIntents(
    {
      businessName: "Summit Roofing",
      whatTheyDo: "residential roof inspection in Houston",
      offer: "Find out what condition your roof is actually in",
      explicitSubject: "residential roof inspection in Houston",
      mechanism: "A 25-point inspection that documents the actual condition with photos",
      authenticityCategory: "local_service_trade",
    },
    { hero: true, benefitCount: 3 },
  );
  check("a described business still gets its photo briefs", real.length === 4, `${real.length} intents`);
  check(
    "and they are about the work",
    real.every((i) => /roof/i.test(i.subject)),
    real.map((i) => i.subject).join(" / "),
  );
}

console.log(failures === 0 ? "\nMEDIA RELEVANCE: ALL CHECKS PASSED\n" : `\nMEDIA RELEVANCE: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
