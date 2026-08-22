// Regression coverage for the DivineX Conversion Framework Library +
// Campaign Strategy Object (Conversion Engine, P1 keystone — Milestone 1).
//
// Pure + deterministic: no Firestore, no env, no LLM. Validates the library's
// structural integrity, cross-reference soundness, the selection helper, the
// knowledge-card rendering bridge, and — critically — that the no-fabrication
// guardrail is actually ENCODED in the offer/proof/urgency/risk frameworks
// (so a future edit can't silently strip it).
//
// Run: npx tsx scripts/verify-conversion-frameworks.mts

const { CONVERSION_FRAMEWORKS, getFramework, allFrameworkIds, frameworksByFamily, frameworksForStrategy, renderFrameworksAsCards } =
  await import("../src/lib/conversion/framework-library");
import type { FrameworkFamily } from "../src/types/conversion";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const FAMILIES: FrameworkFamily[] = ["copywriting", "buyer_psychology", "offer", "landing_page", "email"];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// --- 1. Every framework is structurally complete ---
{
  let allComplete = true;
  const problems: string[] = [];
  for (const f of CONVERSION_FRAMEWORKS) {
    const stringOk = [f.id, f.name, f.version, f.purpose, f.source].every((s) => typeof s === "string" && s.trim().length > 0);
    const familyOk = FAMILIES.includes(f.family);
    const arraysOk = (["useCases", "whenNotToUse", "requiredInputs", "decisionRules", "psychologicalPrinciples", "structure", "evaluationCriteria", "failureModes", "tags"] as const).every(
      (k) => Array.isArray(f[k]) && (f[k] as unknown[]).length > 0,
    );
    if (!stringOk || !familyOk || !arraysOk) { allComplete = false; problems.push(f.id || "(no id)"); }
  }
  check("1. Every framework has all required fields non-empty", allComplete, problems.join(", "));
}

// --- 2. Ids are unique + kebab-case ---
{
  const ids = allFrameworkIds();
  check("2a. Framework ids are unique", new Set(ids).size === ids.length);
  const bad = ids.filter((id) => !KEBAB.test(id));
  check("2b. Framework ids are kebab-case", bad.length === 0, bad.join(", "));
}

// --- 3. compatibleFrameworks reference real ids, never self ---
{
  const ids = new Set(allFrameworkIds());
  const dangling: string[] = [];
  const selfRefs: string[] = [];
  for (const f of CONVERSION_FRAMEWORKS) {
    for (const ref of f.compatibleFrameworks) {
      if (!ids.has(ref)) dangling.push(`${f.id}→${ref}`);
      if (ref === f.id) selfRefs.push(f.id);
    }
  }
  check("3a. No dangling compatibleFrameworks references", dangling.length === 0, dangling.join(", "));
  check("3b. No framework lists itself as compatible", selfRefs.length === 0, selfRefs.join(", "));
}

// --- 4. Every family is represented ---
{
  for (const fam of FAMILIES) {
    check(`4. Family '${fam}' has at least one framework`, frameworksByFamily(fam).length > 0);
  }
}

// --- 5. Lookup helpers behave ---
{
  check("5a. getFramework resolves a known id", getFramework("headline-outcome-mechanism")?.family === "copywriting");
  check("5b. getFramework returns undefined for an unknown id", getFramework("does-not-exist") === undefined);
  check("5c. frameworksByFamily filters correctly", frameworksByFamily("email").every((f) => f.family === "email"));
}

// --- 6. Strategy selection returns a real, non-empty stack of valid ids ---
{
  const ids = new Set(allFrameworkIds());
  const scenarios = [
    { objective: "purchase" as const, awareness: "problem_aware" as const, temperature: "cold" as const, priced: true },
    { objective: "lead_generation" as const, awareness: "solution_aware" as const, temperature: "warm" as const, priced: false },
    { objective: "appointment" as const, awareness: null, temperature: null, priced: false },
  ];
  for (const s of scenarios) {
    const stack = frameworksForStrategy(s);
    const valid = stack.length > 0 && stack.every((id) => ids.has(id)) && new Set(stack).size === stack.length;
    check(`6. frameworksForStrategy(${s.objective}/${s.priced ? "priced" : "free"}) returns a valid, deduped stack`, valid, stack.join(","));
  }
  // A priced/cold campaign must pull in the offer + objection machinery.
  const priced = frameworksForStrategy({ objective: "purchase", awareness: "problem_aware", temperature: "cold", priced: true });
  check("6b. Priced campaigns include the offer value-stack + risk reversal", priced.includes("offer-value-stack") && priced.includes("honest-risk-reversal"));
  // Every stack always includes the email design frameworks (there's always follow-up).
  const free = frameworksForStrategy({ objective: "lead_generation", awareness: null, temperature: "warm", priced: false });
  check("6c. Every stack includes the post-conversion sequence framework", free.includes("post-conversion-sequence-design"));
}

// --- 7. Knowledge-card rendering bridge produces valid cards ---
{
  const cards = renderFrameworksAsCards(CONVERSION_FRAMEWORKS);
  check("7a. One card per represented family", cards.length === FAMILIES.length);
  const wellFormed = cards.every(
    (c) => typeof c.id === "string" && c.id.length > 0 && c.title.length > 0 && c.body.length > 0 && c.levels.includes("sub-account"),
  );
  check("7b. Every card is well-formed (id/title/body/levels)", wellFormed);
  check("7c. Empty input renders no cards", renderFrameworksAsCards([]).length === 0);
}

// --- 8. The no-fabrication guardrail is actually encoded (integrity lock) ---
{
  const GUARDED = ["offer-value-stack", "honest-risk-reversal", "honest-urgency", "proof-specificity"];
  const missing: string[] = [];
  for (const id of GUARDED) {
    const f = getFramework(id)!;
    const text = [...f.decisionRules, ...f.failureModes, ...f.whenNotToUse].join(" ").toLowerCase();
    const encodesGuardrail = /never invent|fabricat|do not invent|no.?fabrication|never fabricate|not invent/.test(text);
    if (!encodesGuardrail) missing.push(id);
  }
  check("8. Offer/proof/urgency/risk frameworks explicitly encode the no-fabrication rule", missing.length === 0, missing.join(", "));
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} === (${CONVERSION_FRAMEWORKS.length} frameworks)`);
if (failures > 0) process.exit(1);
