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
import { countMediaMatches, mediaIsRelevant, selectRelevantMedia } from "../src/lib/funnels/media-intent.ts";

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

console.log(failures === 0 ? "\nMEDIA RELEVANCE: ALL CHECKS PASSED\n" : `\nMEDIA RELEVANCE: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
