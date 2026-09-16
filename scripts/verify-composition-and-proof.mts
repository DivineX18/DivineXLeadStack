/**
 * THREE BOUNDED POST-V1 RULES, EACH PROVEN WHERE IT IS DECIDED.
 *
 * A. The archetype is a property of the business. Measured across 109 generated
 *    funnels the engine produced 80 direct_response / 28 professional_enterprise
 *    / 1 nonprofit_mission and 106 of 109 centered heroes, because an allowlist
 *    forced everything else to direct_response and the hero fell to that
 *    archetype's first recommendation.
 *
 * B. The primary button does what the page is for. A $39 kit, a $27 challenge
 *    and a $9,000 program all ended in a lead popup.
 *
 * C. A star rating is a fact about the outside world, so it comes from a
 *    structured field an admin filled in, never from the model.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-composition-and-proof.mts
 */
import { readFileSync } from "node:fs";
import {
  archetypeForContext,
  eligibleArchetypes,
  heroLayoutForContext,
  resolveDesignStrategy,
  VISUAL_ARCHETYPES,
  type VisualArchetype,
} from "../src/lib/funnels/design-strategy.ts";
import { resolveConversionAction } from "../src/lib/funnels/conversion-action.ts";
import { parseReviewProofInput, ratingStripConfig, reviewProofFromStore } from "../src/lib/funnels/review-proof.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── A1. The archetype follows the business ─────────────────────────────────
console.log("\n══ the archetype is derived from the business category ══");
const CATEGORY_EXPECTATIONS: [string, VisualArchetype][] = [
  ["local_service_health", "wellness"],
  ["local_service_trade", "local_service"],
  ["b2b_services", "professional_enterprise"],
  ["enterprise_software", "saas_technology"],
  ["physical_product", "direct_response"],
  ["info_product", "direct_response"],
  ["coaching", "coach_consultant"],
  ["nonprofit", "nonprofit_mission"],
];
for (const [category, expected] of CATEGORY_EXPECTATIONS) {
  check(`${category} -> ${expected}`, archetypeForContext({ authenticityCategory: category }) === expected, archetypeForContext({ authenticityCategory: category }));
}
{
  const distinct = new Set(CATEGORY_EXPECTATIONS.map(([c]) => archetypeForContext({ authenticityCategory: c })));
  check("the eight categories reach at least six archetypes", distinct.size >= 6, `${distinct.size}: ${[...distinct].join(", ")}`);
  check("a dentist and a roofer no longer share one", archetypeForContext({ authenticityCategory: "local_service_health" }) !== archetypeForContext({ authenticityCategory: "local_service_trade" }));
}
{
  // THE MODEL MAY CHOOSE, WITHIN THE CATEGORY.
  check(
    "an eligible model choice is honored",
    archetypeForContext({ authenticityCategory: "local_service_health", modelChoice: "local_service" }) === "local_service",
  );
  check(
    "an out-of-category choice is ignored, not obeyed",
    archetypeForContext({ authenticityCategory: "nonprofit", modelChoice: "saas_technology" }) === "nonprofit_mission",
  );
  check(
    "... and a trade business does not become a platform",
    archetypeForContext({ authenticityCategory: "local_service_trade", modelChoice: "saas_technology" }) === "local_service",
  );
  // THE ONE CARVE-OUT, KEPT FROM THE POLICY IT REPLACES: luxury and nonprofit
  // are premium/mission by nature and are actively harmed by a bold sales look,
  // and both are categories the inference ladder reads weakly (a private wealth
  // advisory reads as a local service). A deliberate choice of either stands.
  check(
    "a deliberate luxury choice stands wherever the category landed",
    archetypeForContext({ authenticityCategory: "local_service_trade", modelChoice: "luxury_premium" }) === "luxury_premium",
  );
  check(
    "a deliberate nonprofit choice stands too",
    archetypeForContext({ authenticityCategory: "b2b_services", modelChoice: "nonprofit_mission" }) === "nonprofit_mission",
  );
  check(
    "nonsense is ignored",
    archetypeForContext({ authenticityCategory: "coaching", modelChoice: "not_an_archetype" }) === "coach_consultant",
  );
  check("an unknown category still resolves", !!archetypeForContext({ authenticityCategory: "something_new" }));
  for (const [category] of CATEGORY_EXPECTATIONS) {
    check(
      `every ${category} option is a real archetype`,
      eligibleArchetypes(category).every((a) => !!VISUAL_ARCHETYPES[a]),
    );
  }
}

// ── A2. The fold is composed for what is on it ─────────────────────────────
console.log("\n══ the hero layout follows the fold's contents ══");
{
  const trade = heroLayoutForContext({ archetype: "local_service", hasPhotography: true, commitment: "low" });
  check("a trade page with a photograph is not centered", trade !== "centered", trade);

  const magnet = heroLayoutForContext({ archetype: "direct_response", hasDeliverablePreview: true });
  check("a lead magnet pairs the deliverable with the ask", magnet === "split", magnet);

  const saas = heroLayoutForContext({ archetype: "saas_technology" });
  check("a platform composes a device frame", saas === "browser_mockup", saas);

  const coach = heroLayoutForContext({ archetype: "coach_consultant", isPersonLed: true });
  check("a person-led offer composes a portrait", coach === "founder_image", coach);

  const vsl = heroLayoutForContext({ archetype: "professional_enterprise", isVideoLed: true });
  check("a video page does not fight its own video", vsl === "centered", vsl);

  const bare = heroLayoutForContext({ archetype: "professional_enterprise", commitment: "high" });
  check("nothing to show stays centered, honestly", bare === "centered", bare);

  // NEVER OUTSIDE THE ARCHETYPE'S OWN LIST — the boundary resolveDesignStrategy
  // already enforces for every other override.
  for (const archetype of Object.keys(VISUAL_ARCHETYPES) as VisualArchetype[]) {
    const approved = VISUAL_ARCHETYPES[archetype].recommendedHeroLayouts;
    const combos = [
      heroLayoutForContext({ archetype }),
      heroLayoutForContext({ archetype, hasPhotography: true }),
      heroLayoutForContext({ archetype, hasDeliverablePreview: true }),
      heroLayoutForContext({ archetype, isPersonLed: true }),
      heroLayoutForContext({ archetype, isVideoLed: true, commitment: "high" }),
    ];
    check(`${archetype} only ever composes an approved layout`, combos.every((l) => approved.includes(l)), combos.join(","));
  }
}
{
  // THE MEASURED DEFECT, AS A PROPERTY: the eight diagnostic scenarios must no
  // longer collapse onto one fold.
  const scenarios: { category: string; opts: Parameters<typeof heroLayoutForContext>[0] extends never ? never : Omit<Parameters<typeof heroLayoutForContext>[0], "archetype"> }[] = [
    { category: "local_service_trade", opts: { hasPhotography: true, commitment: "low" } },
    { category: "info_product", opts: { hasDeliverablePreview: true } },
    { category: "local_service_health", opts: { hasPhotography: true, commitment: "low" } },
    { category: "physical_product", opts: { commitment: "medium" } },
    { category: "b2b_services", opts: { commitment: "high" } },
    { category: "info_product", opts: { hasDeliverablePreview: true } },
    { category: "b2b_services", opts: { isVideoLed: true, commitment: "high" } },
    { category: "coaching", opts: { isPersonLed: true, commitment: "medium" } },
  ];
  const layouts = scenarios.map((s) => {
    const archetype = archetypeForContext({ authenticityCategory: s.category });
    return heroLayoutForContext({ archetype, ...s.opts });
  });
  const centered = layouts.filter((l) => l === "centered").length;
  check("the eight scenarios no longer collapse to centered", centered <= 4, `${centered}/8 centered: ${layouts.join(", ")}`);
  check("... and reach at least three hero families", new Set(layouts).size >= 3, [...new Set(layouts)].join(", "));
}
{
  // The strategy resolver still governs: a context layout is only ever offered
  // as a fallback, and an explicit valid override still wins.
  const s = resolveDesignStrategy("wellness", { heroLayout: "founder_image" });
  check("an explicit valid hero override still wins", s.heroLayout === "founder_image", s.heroLayout);
  const s2 = resolveDesignStrategy("wellness", { heroLayout: "browser_mockup" });
  check("an invalid override is still ignored", s2.heroLayout !== "browser_mockup", s2.heroLayout);
}

// ── B. The primary button ──────────────────────────────────────────────────
console.log("\n══ a paid page takes payment when payment exists ══");
const decide = (i: Parameters<typeof resolveConversionAction>[0]) => resolveConversionAction(i).action;
{
  // THE THREE MEASURED FAILURES.
  check("$39 tripwire with checkout -> checkout", decide({ genre: "tripwire", objective: "purchase", priceCents: 3900, checkoutConfigured: true }) === "checkout");
  check("$27 challenge with checkout -> checkout", decide({ genre: "challenge", objective: "event_registration", priceCents: 2700, checkoutConfigured: true }) === "checkout");
  check("$9,000 VSL selling directly -> checkout", decide({ genre: "vsl", objective: "purchase", priceCents: 900000, checkoutConfigured: true }) === "checkout");

  // PRICE ALONE DECIDES NOTHING.
  check("$9,000 VSL whose objective is a call -> application", decide({ genre: "vsl", objective: "consultation", priceCents: 900000, checkoutConfigured: true }) === "application");
  check("an application funnel stays an application", decide({ genre: "application", objective: "application", priceCents: 3000000, checkoutConfigured: true }) === "application");
  check("an appointment objective stays a booking", decide({ genre: "lead_gen", objective: "appointment", priceCents: 19900, checkoutConfigured: true }) === "booking");
  check("an unpriced lead magnet still captures", decide({ genre: "lead_magnet", objective: "lead_generation", priceCents: 0, checkoutConfigured: true }) === "capture");
  check("a priced page with a lead objective still captures", decide({ genre: "lead_gen", objective: "lead_generation", priceCents: 4900, checkoutConfigured: true }) === "capture");

  // NO CHECKOUT CONNECTED: never pretend.
  check("$39 tripwire without checkout -> capture, flagged", decide({ genre: "tripwire", objective: "purchase", priceCents: 3900, checkoutConfigured: false }) === "capture_pending_checkout");
  check("$27 challenge without checkout -> capture, flagged", decide({ genre: "challenge", objective: "event_registration", priceCents: 2700, checkoutConfigured: false }) === "capture_pending_checkout");
  check("an application without checkout is unaffected", decide({ genre: "application", objective: "application", priceCents: 500000, checkoutConfigured: false }) === "application");
  check("every decision states its reason", !!resolveConversionAction({ genre: "tripwire", objective: "purchase", priceCents: 3900, checkoutConfigured: false }).reason);
}

// ── C. Review proof ────────────────────────────────────────────────────────
console.log("\n══ a rating is verified or it does not exist ══");
{
  const good = parseReviewProofInput({ rating: 4.9, reviewCount: 127, reviewSource: "Google", reviewUrl: "https://g.page/r/abc/review" });
  check("a complete entry is accepted", good.ok && good.value.rating === 4.9 && good.value.reviewCount === 127 && good.value.reviewSource === "Google");
  check("the link is optional", parseReviewProofInput({ rating: 4.6, reviewCount: 12, reviewSource: "Facebook" }).ok);

  // PARTIAL OR IMPOSSIBLE DATA FAILS SAFE.
  for (const [label, input] of [
    ["no rating", { reviewCount: 127, reviewSource: "Google" }],
    ["no count", { rating: 4.9, reviewSource: "Google" }],
    ["no source", { rating: 4.9, reviewCount: 127 }],
    ["empty source", { rating: 4.9, reviewCount: 127, reviewSource: "   " }],
    ["zero count", { rating: 4.9, reviewCount: 0, reviewSource: "Google" }],
    ["fractional count", { rating: 4.9, reviewCount: 12.5, reviewSource: "Google" }],
    ["rating above five", { rating: 5.4, reviewCount: 10, reviewSource: "Google" }],
    ["rating of zero", { rating: 0, reviewCount: 10, reviewSource: "Google" }],
    ["a link as a source", { rating: 4.9, reviewCount: 10, reviewSource: "https://google.com" }],
    ["an http link", { rating: 4.9, reviewCount: 10, reviewSource: "Google", reviewUrl: "http://insecure.example" }],
    ["nothing at all", {}],
  ] as [string, unknown][]) {
    check(`refused: ${label}`, !parseReviewProofInput(input).ok);
  }

  // NEVER ROUNDED UP.
  const nudged = parseReviewProofInput({ rating: 4.98, reviewCount: 30, reviewSource: "Google" });
  check("4.98 is stored as 4.9, never 5.0", nudged.ok && nudged.value.rating === 4.9, nudged.ok ? String(nudged.value.rating) : "refused");

  // NO STORE ENTRY -> NOTHING RENDERS.
  check("no entry renders nothing", ratingStripConfig(reviewProofFromStore(null)) === null);
  check("undefined renders nothing", ratingStripConfig(reviewProofFromStore(undefined)) === null);
  check("a half-written legacy doc renders nothing", ratingStripConfig(reviewProofFromStore({ rating: 4.9 } as never)) === null);
  check("a zero-count doc renders nothing", ratingStripConfig(reviewProofFromStore({ rating: 4.9, reviewCount: 0, reviewSource: "Google" } as never)) === null);

  // WHAT A VERIFIED ENTRY RENDERS.
  const strip = ratingStripConfig(reviewProofFromStore({ rating: 4.9, reviewCount: 127, reviewSource: "Google", reviewUrl: "https://g.page/r/abc/review" }));
  check("a verified entry becomes a rating strip", strip?.variant === "rating");
  check("... carrying the exact numbers entered", strip?.rating.score === 4.9 && strip?.rating.reviewCount === 127);
  check("... naming the source truthfully", strip?.rating.source === "Google");
  check("... linking to the profile when given", strip?.rating.href === "https://g.page/r/abc/review");
  const unlinked = ratingStripConfig(reviewProofFromStore({ rating: 4.2, reviewCount: 9, reviewSource: "Trustpilot" }));
  check("... and carrying no link when none was given", unlinked !== null && !("href" in unlinked.rating));
}
{
  // THE MODEL IS NOT A SOURCE. Generation reads the store and nothing else —
  // proven structurally, because the only path to a strip is this function.
  const fromModel = { rating: 5, reviewCount: 200, reviewSource: "Google" };
  check(
    "a model-shaped payload only counts once an admin stored it",
    ratingStripConfig(reviewProofFromStore(fromModel as never)) !== null &&
      ratingStripConfig(reviewProofFromStore(null)) === null,
  );
  const gen = readFileSyncSafe("src/lib/ai-suite/capabilities.ts");
  check("generation no longer renders the model's real_rating", !/args\.realRating as \{ score/.test(gen), "model rating path still present");
  check("generation reads the verified store", /reviewProofFromStore\(\s*subSnap\.data\(\)\?\.reviewProof/.test(gen));
  const route = readFileSyncSafe("src/app/api/sub-accounts/[id]/review-proof/route.ts");
  check("the write path is admin-only", /requireSubAccountAdmin/.test(route));
  check("the write path validates before storing", /parseReviewProofInput/.test(route));
}

function readFileSyncSafe(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

console.log(failures === 0 ? "\nCOMPOSITION + PROOF: ALL CHECKS PASSED\n" : `\nCOMPOSITION + PROOF: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
