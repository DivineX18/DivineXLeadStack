// Regression coverage for the Campaign Strategy Builder (Conversion Engine,
// P1 keystone — Milestone 2). Pure + deterministic: no Firestore, no env, no
// LLM. Verifies deterministic derivation, objective→genre mapping, framework-
// stack validity, provenance, and — critically — that missing proof/guarantee/
// urgency are surfaced in `unknowns` with explicit "do not fabricate" wording.
//
// Run: npx tsx scripts/verify-conversion-strategy.mts

const { buildCampaignStrategy, funnelGenreForObjective, isPricedOffer, computeUnknowns } =
  await import("../src/lib/conversion/strategy-builder");
const { allFrameworkIds } = await import("../src/lib/conversion/framework-library");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Empty input still produces a valid, honest strategy ---
{
  const s = buildCampaignStrategy({});
  check("1a. version is stamped", s.version === "1.0.0", s.version);
  check("1b. framework stack is non-empty even with no inputs (foundational frameworks always apply)", s.derived.frameworkStack.length > 0);
  check("1c. narrative fields left null (not invented)", s.derived.centralPromise === null && s.derived.coreBeliefRequired === null);
  check("1d. empty blocks are marked 'unknown' in provenance", s.sources.business === "unknown" && s.sources.offer === "unknown");
  check("1e. unknowns names the real gaps", s.unknowns.includes("campaign objective") && s.unknowns.includes("what the offer actually is"));
}

// --- 2. Objective → funnel genre mapping ---
{
  check("2a. purchase(priced) → tripwire", funnelGenreForObjective("purchase", true) === "tripwire");
  check("2b. application → application", funnelGenreForObjective("application", false) === "application");
  check("2c. webinar_registration → webinar", funnelGenreForObjective("webinar_registration", false) === "webinar");
  check("2d. lead_generation → lead_gen", funnelGenreForObjective("lead_generation", false) === "lead_gen");
  check("2e. appointment → lead_gen", funnelGenreForObjective("appointment", false) === "lead_gen");
  check("2f. free_trial → lead_gen", funnelGenreForObjective("free_trial", false) === "lead_gen");
  check("2g. null objective + priced → tripwire", funnelGenreForObjective(null, true) === "tripwire");
  check("2h. null objective + free → lead_gen", funnelGenreForObjective(null, false) === "lead_gen");
}

// --- 3. Priced offer pulls the offer machinery + value-stack structure ---
{
  const s = buildCampaignStrategy({ offer: { productOrService: "Coaching program", priceCents: 49700 }, context: { objective: "purchase" } });
  check("3a. isPricedOffer true for a positive price", isPricedOffer(s.offer));
  check("3b. offerStructure describes a value stack + guarantee", /value stack/i.test(s.derived.offerStructure ?? ""));
  check("3c. framework stack includes offer-value-stack + honest-risk-reversal", s.derived.frameworkStack.includes("offer-value-stack") && s.derived.frameworkStack.includes("honest-risk-reversal"));
  check("3d. pageType maps to tripwire for a priced purchase", s.derived.pageType === "tripwire");
}
{
  check("3e. isPricedOffer false for price 0 / null", !isPricedOffer({ productOrService: null, priceCents: 0, transformation: null, mechanism: null, guarantee: null, proof: [], urgency: null, cta: null, conversionEvent: null }));
}

// --- 4. Provided facts pass through to the derived strategy ---
{
  const s = buildCampaignStrategy({
    audience: { icp: "Busy homeowners", primaryPain: "AC breaks in summer", desiredOutcome: "Same-day repair", awareness: "problem_aware", objections: ["Too expensive"] },
    offer: { mechanism: "Certified same-day dispatch" },
  });
  check("4a. audience pain/outcome pass through", s.derived.primaryPain === "AC breaks in summer" && s.derived.primaryDesiredOutcome === "Same-day repair");
  check("4b. awareness passes through", s.derived.awareness === "problem_aware");
  check("4c. mechanism passes through", s.derived.uniqueMechanism === "Certified same-day dispatch");
  check("4d. objections pass through", s.derived.majorObjections.includes("Too expensive"));
  check("4e. provided blocks marked user_input", s.sources.audience === "user_input" && s.sources.offer === "user_input");
}

// --- 5. Honesty guardrail is enforced at the STRATEGY layer ---
{
  const u = computeUnknowns({
    business: { name: null, businessType: "Dental", model: "local service", website: null, location: null, differentiators: [], brandVoice: null, existingAssets: [] },
    audience: { icp: null, primaryPain: "Fear of the dentist", desiredOutcome: "Painless visit", awareness: "problem_aware", sophistication: 2, objections: [], fears: [], motivations: [], buyingCriteria: [] },
    offer: { productOrService: "New-patient exam", priceCents: null, transformation: null, mechanism: "Sedation option", guarantee: null, proof: [], urgency: null, cta: null, conversionEvent: null },
    context: { trafficSource: "google_search", objective: "appointment", temperature: "warm", searchIntent: null, device: null, geo: null },
  });
  const joined = u.join(" | ").toLowerCase();
  check("5a. missing proof is flagged with 'do not fabricate'", /proof.*do not fabricate|do not fabricate.*proof|fabricate/.test(joined) && joined.includes("proof"));
  check("5b. missing guarantee is flagged with 'do not invent'", joined.includes("guarantee") && /do not invent/.test(joined));
  check("5c. missing urgency is flagged as do-not-fabricate", joined.includes("urgency") && /fabricate/.test(joined));
}

// --- 6. The framework stack only contains real framework ids ---
{
  const ids = new Set(allFrameworkIds());
  const s = buildCampaignStrategy({ context: { objective: "purchase" }, offer: { priceCents: 9700 } });
  const allValid = s.derived.frameworkStack.every((id) => ids.has(id));
  check("6. Every id in the derived framework stack exists in the library", allValid, s.derived.frameworkStack.join(","));
}

// --- 7. Intelligence Layer hydration (Ascend → Flow handoff) ---
{
  const intelligence = {
    growthScan: { overallScore: 58, primaryConstraint: "Weak homepage value prop", growthStage: "plateau", topOpportunities: ["Add lead capture"], websiteUrl: "https://acmehvac.com", businessType: "HVAC" },
    brandVoice: { tone: "warm, plain-spoken", descriptors: ["local", "reliable"], avoid: ["revolutionary"], sampleCopy: null },
    businessMemory: { summary: null, differentiators: ["24/7 dispatch"], pastAssets: [], knownAudience: "Homeowners with aging AC units", knownOffer: "Same-day AC repair", },
    cro: { findings: ["No CTA above the fold"], primaryLeak: "no lead capture above the fold" },
    analytics: { topTrafficSource: "google_search", topConvertingPage: null, notableMetrics: [] },
  };
  const s = buildCampaignStrategy({ context: { objective: "lead_generation" }, intelligence });
  check("7a. business type hydrated from growth scan", s.business.businessType === "HVAC");
  check("7b. website hydrated from growth scan", s.business.website === "https://acmehvac.com");
  check("7c. brand voice hydrated", s.business.brandVoice === "warm, plain-spoken");
  check("7d. differentiators hydrated from business memory", s.business.differentiators.includes("24/7 dispatch"));
  check("7e. offer hydrated from known offer", s.offer.productOrService === "Same-day AC repair");
  check("7f. audience icp hydrated from known audience", s.audience.icp === "Homeowners with aging AC units");
  check("7g. traffic source hydrated from analytics", s.context.trafficSource === "google_search");
  check("7h. provenance marks intel-filled blocks 'ascend_profile'", s.sources.business === "ascend_profile" && s.sources.offer === "ascend_profile");
  check("7i. unknowns SHRINK — offer + business type + traffic no longer unknown", !s.unknowns.includes("what the offer actually is") && !s.unknowns.includes("business type / industry") && !s.unknowns.includes("traffic source"));
  check("7j. the intelligence is carried whole on the strategy (diagnosis available downstream)", s.intelligence?.growthScan?.primaryConstraint === "Weak homepage value prop");
}

// --- 8. User input WINS over intelligence (never overridden) ---
{
  const s = buildCampaignStrategy({
    business: { businessType: "Dental" },
    intelligence: { growthScan: { overallScore: null, primaryConstraint: null, growthStage: null, topOpportunities: [], websiteUrl: null, businessType: "HVAC" } },
  });
  check("8a. user-provided business type is not overridden by intel", s.business.businessType === "Dental");
  check("8b. a user-provided block is provenance 'user_input', not ascend_profile", s.sources.business === "user_input");
}

// --- 9. No intelligence → M2 behavior preserved ---
{
  const s = buildCampaignStrategy({ business: { businessType: "Law" } });
  check("9a. no intelligence field carried when none supplied", s.intelligence === undefined);
  check("9b. provenance unchanged (user_input / unknown)", s.sources.business === "user_input" && s.sources.offer === "unknown");
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
