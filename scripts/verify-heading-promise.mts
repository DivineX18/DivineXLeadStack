/**
 * A HEADING MAY NOT PROMISE A KIND OF THING THE PAGE DOES NOT DELIVER.
 *
 * "Everything you'll learn" shipped on THREE consecutive real generated
 * pages during beta acceptance: above a roof inspection's deliverables,
 * above a dog groom's benefits, and above a CFO review's agenda. Nobody
 * learns anything from having their roof photographed. The visitor is told
 * the section is a curriculum and shown a list of what they receive.
 *
 * The Critic detects this and writes an honest replacement, but its
 * auto-apply is deliberately off: it also flags "How it works" over process
 * steps, which is honest. So this is the deterministic subset with no
 * judgment in it, and these checks hold BOTH sides of it: the dishonest
 * promise is replaced, and an honest heading is never touched.
 */
import {
  promisesLearningItCannotDeliver,
  neutralHeadingFor,
  groundSectionHeading,
  agendaHeadingFor,
} from "../src/lib/funnels/claim-integrity";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

console.log("\n1. The observed defect, on the genres it shipped on");
for (const genre of ["booking", "lead_gen", "application", "tripwire"]) {
  const r = groundSectionHeading("Everything you'll learn", genre);
  check(`${genre}: the learning promise is replaced`, r.replaced, r.heading);
  check(`${genre}: the replacement is accurate and plain`,
    /^(What's included|What you get)$/.test(r.heading), r.heading);
}
for (const variant of [
  "Everything you'll learn", "What you'll learn", "What you will learn",
  "You'll discover", "Here's what you'll learn", "The curriculum", "Lessons",
  "Everything You'll Learn",
]) {
  check(`"${variant}" is caught on a booking page`, promisesLearningItCannotDeliver(variant, "booking"));
}

console.log("\n2. Where the promise is TRUE, it is left alone");
for (const genre of ["webinar", "challenge", "lead_magnet", "course", "vsl"]) {
  const r = groundSectionHeading("Everything you'll learn", genre);
  check(`${genre} keeps its curriculum heading`, !r.replaced && r.heading === "Everything you'll learn", r.heading);
}

console.log("\n3. Honest headings are never rewritten");
// These are the Critic's own stated false positives. If this rule touched
// any of them it would be the corruption the auto-apply was switched off to
// avoid, which is the whole reason this subset is deterministic.
for (const honest of [
  "How it works", "What's included", "About", "FAQ", "What you get",
  "Why owners book the van instead", "What the inspection gives you",
  "So we start with facts, not a quote", "Book a time",
  "Your revenue is up. So why is the bank balance tighter than ever?",
  "We learn your business first", "What our clients learn to expect",
]) {
  const r = groundSectionHeading(honest, "booking");
  check(`"${honest.slice(0, 44)}" is untouched`, !r.replaced, r.heading);
}

console.log("\n4. Edges");
check("an empty heading is not 'replaced'", !groundSectionHeading("", "booking").replaced);
check("whitespace is not 'replaced'", !groundSectionHeading("   ", "booking").replaced);
check("booking and lead_gen get the deliverables wording",
  neutralHeadingFor("booking") === "What's included" && neutralHeadingFor("lead_gen") === "What's included");
check("other genres get the plainer wording", neutralHeadingFor("application") === "What you get");

console.log("\n5. The agenda/process section, which was the real source");
// The model never wrote "Everything you'll learn" at all. AgendaSection
// HARDCODED it, and that one component renders both a webinar agenda and an
// application/booking process. Fixing the model-written path alone left the
// heading on every page, which is how the first fix passed its own tests and
// changed nothing on screen.
for (const genre of ["booking", "lead_gen", "application", "tripwire"]) {
  check(`${genre}: the agenda heading does not promise teaching`,
    !/learn/i.test(agendaHeadingFor(genre)), agendaHeadingFor(genre));
  check(`${genre}: and it truthfully describes a step list`,
    agendaHeadingFor(genre) === "What happens, step by step");
}
for (const genre of ["webinar", "challenge", "lead_magnet"]) {
  check(`${genre}: keeps the teaching heading, because it teaches`,
    agendaHeadingFor(genre) === "Everything you'll learn");
}
{
  const { readFileSync: rf } = await import("node:fs");
  const comp = rf("src/components/funnels/sections/agenda-section.tsx", "utf8");
  check("the renderer no longer hardcodes the teaching promise",
    !/Everything you&apos;ll learn\s*\n\s*<\/h2>/.test(comp) && comp.includes("config.heading"));
  check("its fallback is true of any step list",
    comp.includes('"What happens, step by step"'));
  const cap2 = rf("src/lib/ai-suite/capabilities.ts", "utf8");
  check("generation sets the agenda heading from the genre",
    /heading: agendaHeadingFor\(genre\)/.test(cap2));
}

console.log("\n6. It is actually wired into generation");
const { readFileSync } = await import("node:fs");
const cap = readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
check("stage_content headings run through the rule",
  /headline: groundSectionHeading\(s1\(s, "headline", "headline"\)\.slice\(0, 100\), genre\)\.heading/.test(cap));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
