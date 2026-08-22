// Regression coverage for Campaign Strategy Enrichment (Conversion Engine,
// P1 — Milestone 7). Pure + deterministic: tests the prompt builder, the
// response parser, and the applier — no model call. The LLM wrapper
// (enrichCampaignStrategy) is a thin best-effort layer over these.
//
// Run: npx tsx scripts/verify-conversion-enrichment.mts

const { buildStrategyEnrichmentPrompt, parseEnrichmentResponse, applyStrategyEnrichment } =
  await import("../src/lib/conversion/strategy-enrichment-core");
const { buildCampaignStrategy } = await import("../src/lib/conversion/strategy-builder");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Prompt builder feeds only real facts + the no-fabrication guardrail ---
{
  const s = buildCampaignStrategy({ business: { businessType: "HVAC" }, offer: { productOrService: "Same-day AC repair" }, context: { objective: "lead_generation" } });
  const { system, user } = buildStrategyEnrichmentPrompt(s);
  check("1a. system forbids inventing facts", /never invent/i.test(system));
  check("1b. system specifies the exact JSON keys", system.includes('"centralPromise"') && system.includes('"awareness"'));
  check("1c. user carries the real facts", user.includes("HVAC") && user.includes("Same-day AC repair"));
  check("1d. user lists the unknowns with a do-not-invent warning", /NOT KNOWN.*never invent/is.test(user));
  check("1e. a null fact is NOT emitted as a fact line", !user.includes("Brand voice:"));
}

// --- 2. Response parser is strict + tolerant ---
{
  const ok = parseEnrichmentResponse('```json\n{"centralPromise":"Same-day, guaranteed","uniqueMechanism":null,"coreBeliefRequired":"It can happen today","awareness":"problem_aware","sophistication":3}\n```');
  check("2a. parses fenced JSON", ok?.centralPromise === "Same-day, guaranteed" && ok?.awareness === "problem_aware" && ok?.sophistication === 3);
  check("2b. null mechanism preserved as null", ok?.uniqueMechanism === null);
  check("2c. non-JSON returns null", parseEnrichmentResponse("sorry, here's my answer...") === null);
  const bad = parseEnrichmentResponse('{"awareness":"foo","sophistication":9,"centralPromise":"   ","coreBeliefRequired":"real"}');
  check("2d. invalid awareness/sophistication coerced to null", bad?.awareness === null && bad?.sophistication === null);
  check("2e. blank string coerced to null", bad?.centralPromise === null && bad?.coreBeliefRequired === "real");
}

// --- 3. Applier fills only nulls, grounds the mechanism, shrinks unknowns ---
{
  const base = buildCampaignStrategy({ business: { businessType: "HVAC" }, offer: { productOrService: "Same-day AC repair" }, context: { objective: "lead_generation" } });
  const enriched = applyStrategyEnrichment(base, {
    centralPromise: "Same-day AC repair, or we waive the call-out fee",
    uniqueMechanism: "Certified same-day dispatch network",
    coreBeliefRequired: "A real repair can happen today",
    awareness: "problem_aware",
    sophistication: 3,
  });
  check("3a. central promise filled", enriched.derived.centralPromise === "Same-day AC repair, or we waive the call-out fee");
  check("3b. mechanism grounded onto offer + derived", enriched.offer.mechanism === "Certified same-day dispatch network" && enriched.derived.uniqueMechanism === enriched.offer.mechanism);
  check("3c. awareness + sophistication inferred", enriched.derived.awareness === "problem_aware" && enriched.derived.sophistication === 3);
  check("3d. unknowns shrank (mechanism + awareness + sophistication resolved)", !enriched.unknowns.includes("unique mechanism (why this works)") && !enriched.unknowns.some((u) => u.startsWith("audience awareness")) && !enriched.unknowns.includes("market sophistication stage"));
  check("3e. applier is non-mutating (original untouched)", base.derived.centralPromise === null && base.offer.mechanism === null);
}

// --- 4. Applier never overrides user-provided values ---
{
  const base = buildCampaignStrategy({ audience: { awareness: "most_aware" }, offer: { mechanism: "Our real proprietary process", productOrService: "X" } });
  const enriched = applyStrategyEnrichment(base, { awareness: "unaware", uniqueMechanism: "Something else", centralPromise: "A promise" });
  check("4a. user-provided awareness is not overridden", enriched.derived.awareness === "most_aware" && enriched.audience.awareness === "most_aware");
  check("4b. user-provided mechanism is not overridden", enriched.offer.mechanism === "Our real proprietary process");
  check("4c. a genuinely-null narrative field still fills", enriched.derived.centralPromise === "A promise");
}

// --- 5. Empty enrichment is a safe no-op ---
{
  const base = buildCampaignStrategy({ context: { objective: "lead_generation" } });
  const enriched = applyStrategyEnrichment(base, {});
  check("5. empty enrichment leaves the strategy valid + unchanged in substance", enriched.derived.centralPromise === null && enriched.unknowns.length === base.unknowns.length);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
