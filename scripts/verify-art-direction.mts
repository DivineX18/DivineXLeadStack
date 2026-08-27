// Regression coverage for the Campaign Art Direction layer (Increment 1 of
// docs/plans/flow-art-direction-upgrade.md) — the deterministic mapper that
// turns a buyer's emotional transformation into per-section layout variants +
// canvases, so structurally different campaigns come out of one section
// library. Pure, no LLM, no Firestore.
//
// The two locked benchmarks from the plan are asserted here in mapper form:
// Summit AC (panic_to_relief) and Lakeside dental (fear_to_safety) MUST
// diverge structurally — different variants, different canvases — and the
// baseline (no transformation) MUST be a perfect identity so existing funnels
// are untouched.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-art-direction.mts

import type { FunnelSection } from "../src/types/funnels";
import {
  EMOTIONAL_TRANSFORMATIONS,
  applyArtDirection,
  deriveArtDirection,
  isBaselineProfile,
} from "../src/lib/funnels/art-direction";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** A representative composed page: hero → problem/solution → benefits →
 *  offer → faq → mid CTA banner → closing CTA banner. */
function sampleSections(): FunnelSection[] {
  return [
    { id: "s1", type: "hero", config: { headline: "H", mediaType: "none" } },
    { id: "s2", type: "problem_solution", config: { problemHeadline: "P", problemText: "pt", solutionHeadline: "S", solutionText: "st" } },
    { id: "s3", type: "benefits_grid", config: { headline: "B", items: [{ title: "one", description: "d1" }, { title: "two", description: "d2" }] } },
    { id: "s4", type: "cta_banner", config: { headline: "Mid", ctaLabel: "Go", ctaHref: "" } },
    { id: "s5", type: "offer", config: { headline: "O", bullets: [], ctaLabel: "Get", formId: null } },
    { id: "s6", type: "faq", config: { items: [] } },
    { id: "s7", type: "cta_banner", config: { headline: "Close", ctaLabel: "Go", ctaHref: "" } },
  ] as unknown as FunnelSection[];
}

const cfg = (s: FunnelSection) => s.config as Record<string, unknown>;

// --- 1. Profile derivation ---
{
  const hvac = deriveArtDirection({ transformation: "panic_to_relief" });
  check("1a. panic_to_relief -> urgent / rich / people_led", hvac.energy === "urgent" && hvac.density === "rich" && hvac.humanity === "people_led");

  const dental = deriveArtDirection({ transformation: "fear_to_safety" });
  check("1b. fear_to_safety -> calm / medium / people_led", dental.energy === "calm" && dental.humanity === "people_led");

  const none = deriveArtDirection({});
  check("1c. no transformation -> baseline profile", isBaselineProfile(none));

  const overridden = deriveArtDirection({ transformation: "panic_to_relief", energy: "calm" });
  check("1d. explicit override beats the transformation default", overridden.energy === "calm");

  check("1e. every declared transformation has defaults (derive never throws)", EMOTIONAL_TRANSFORMATIONS.every((t) => !!deriveArtDirection({ transformation: t })));
}

// --- 2. Baseline = identity (zero regression for unclassified funnels) ---
{
  const sections = sampleSections();
  const out = applyArtDirection(sections, deriveArtDirection({}));
  check("2a. baseline profile returns sections unchanged (same reference)", out === sections);
  check("2b. no canvas/variant appears anywhere", out.every((s) => !s.canvas && !cfg(s).variant));
}

// --- 3. The HVAC benchmark (panic_to_relief): urgent composition ---
const hvacOut = applyArtDirection(sampleSections(), deriveArtDirection({ transformation: "panic_to_relief" }));
{
  const ps = hvacOut.find((s) => s.type === "problem_solution")!;
  const benefits = hvacOut.find((s) => s.type === "benefits_grid")!;
  const banners = hvacOut.filter((s) => s.type === "cta_banner");
  check("3a. HVAC: problem/solution becomes the visualized before_after transformation", cfg(ps).variant === "before_after");
  check("3b. HVAC: benefits sit on the dark immersive urgency band", benefits.canvas === "dark_immersive");
  check("3c. HVAC: the CLOSING banner is the full-bleed close", cfg(banners[banners.length - 1]).variant === "full_bleed_close");
  check("3d. HVAC: the MID banner is not (brand tint instead)", cfg(banners[0]).variant !== "full_bleed_close" && banners[0].canvas === "brand_tint");
  check("3e. HVAC: offer gets the brand-tint canvas", hvacOut.find((s) => s.type === "offer")!.canvas === "brand_tint");
  check("3f. HVAC: hero canvas untouched", !hvacOut.find((s) => s.type === "hero")!.canvas);

  const heroWithPlaceholder = [
    { id: "h1", type: "hero", config: { headline: "H", mediaType: "video", mediaPlaceholderLabel: "Add a video" } },
  ] as unknown as FunnelSection[];
  const strippedHero = applyArtDirection(heroWithPlaceholder, deriveArtDirection({ transformation: "panic_to_relief" }))[0]!;
  check("3g. HVAC: urgent hero DROPS placeholder-only media (asset-fallback rule)", (cfg(strippedHero).mediaType as string) === "none");
  const heroWithRealMedia = [
    { id: "h2", type: "hero", config: { headline: "H", mediaType: "video", mediaUrl: "https://example.com/v" } },
  ] as unknown as FunnelSection[];
  const keptHero = applyArtDirection(heroWithRealMedia, deriveArtDirection({ transformation: "panic_to_relief" }))[0]!;
  check("3h. HVAC: urgent hero KEEPS real media (video stays the centered VSL)", (cfg(keptHero).mediaType as string) === "video" && cfg(keptHero).layout !== "background_image");

  const heroWithRealPhoto = [
    { id: "h3", type: "hero", config: { headline: "H", mediaType: "image", mediaUrl: "https://images.example/roof.jpg" } },
  ] as unknown as FunnelSection[];
  const immersiveHero = applyArtDirection(heroWithRealPhoto, deriveArtDirection({ transformation: "panic_to_relief" }))[0]!;
  check("3i. HVAC: urgent hero with a real PHOTO upgrades to the immersive full-bleed layout", cfg(immersiveHero).layout === "background_image" && (cfg(immersiveHero).mediaType as string) === "image");
}

// --- 4. The dental benchmark (fear_to_safety): calm, human composition ---
const dentalOut = applyArtDirection(sampleSections(), deriveArtDirection({ transformation: "fear_to_safety" }));
{
  const benefits = dentalOut.find((s) => s.type === "benefits_grid")!;
  const ps = dentalOut.find((s) => s.type === "problem_solution")!;
  const banners = dentalOut.filter((s) => s.type === "cta_banner");
  check("4a. dental: benefits become the people-led alternating_image rows", cfg(benefits).variant === "alternating_image");
  check("4b. dental: problem/solution stays the soft stacked narrative", cfg(ps).variant === "stacked" && ps.canvas === "brand_tint");
  check("4c. dental: closing banner stays the contained editorial banner", cfg(banners[banners.length - 1]).variant === "banner");
  const bare = [
    { id: "b1", type: "benefits_grid", config: { items: [{ title: "only-a-title" }] } },
  ] as unknown as FunnelSection[];
  const bareOut = applyArtDirection(bare, deriveArtDirection({ transformation: "fear_to_safety" }))[0]!;
  check("4e. dental: title-only benefits stay a checklist (rows must EARN the zigzag)", cfg(bareOut).variant === "flowing_checklist");
  check("4d. dental: NO dark/high-contrast device anywhere (no urgency for an anxious buyer)", dentalOut.every((s) => s.canvas !== "dark_immersive" && s.canvas !== "high_contrast_cta" && cfg(s).variant !== "full_bleed_close"));
}

// --- 5. The point of it all: the two benchmarks DIVERGE structurally ---
{
  const shape = (list: FunnelSection[]) => list.map((s) => `${s.type}:${cfg(s).variant ?? "-"}:${s.canvas ?? "-"}`).join("|");
  check("5a. HVAC and dental compositions are structurally different", shape(hvacOut) !== shape(dentalOut), `\n  HVAC   ${shape(hvacOut)}\n  dental ${shape(dentalOut)}`);
}

// --- 6. Other profiles behave, input never mutated ---
{
  const original = sampleSections();
  const snapshot = JSON.stringify(original);
  applyArtDirection(original, deriveArtDirection({ transformation: "panic_to_relief" }));
  check("6a. applyArtDirection never mutates its input", JSON.stringify(original) === snapshot);

  const attorney = applyArtDirection(sampleSections(), deriveArtDirection({ transformation: "uncertainty_to_confidence" }));
  check("6b. calm-rational (attorney): before_after transformation, but no dark band", cfg(attorney.find((s) => s.type === "problem_solution")!).variant === "before_after" && attorney.every((s) => s.canvas !== "dark_immersive"));

  const saas = applyArtDirection(sampleSections(), deriveArtDirection({ transformation: "frustration_to_control" }));
  const saasBanners = saas.filter((s) => s.type === "cta_banner");
  check("6c. balanced (SaaS): strong close without the urgent dark band", cfg(saasBanners[saasBanners.length - 1]).variant === "full_bleed_close" && saas.every((s) => s.canvas !== "dark_immersive"));
}

// --- 7. Archetype fallback (safety net when the model omits the transformation) ---
{
  const prof = deriveArtDirection({ archetype: "professional_enterprise" });
  check("7a. professional_enterprise fallback -> calm-rational (not baseline)", prof.energy === "calm" && !isBaselineProfile(prof));

  const lux = deriveArtDirection({ archetype: "luxury_premium" });
  check("7b. luxury_premium fallback -> calm / people_led", lux.energy === "calm" && lux.humanity === "people_led");

  const dr = deriveArtDirection({ archetype: "direct_response" });
  check("7c. direct_response with no transformation stays baseline (bold look unchanged)", isBaselineProfile(dr));

  const profOut = applyArtDirection(sampleSections(), prof);
  check("7d. fallback profile actually composes (professional gets the calm treatment, no dark bands)", profOut.some((s) => s.canvas || cfg(s).variant) && profOut.every((s) => s.canvas !== "dark_immersive"));

  const explicit = deriveArtDirection({ transformation: "panic_to_relief", archetype: "professional_enterprise" });
  check("7e. a real transformation always beats the archetype fallback", explicit.energy === "urgent");
}

// --- 8. Guaranteed inference (art direction can NEVER silently no-op) ---
{
  const { inferEmotionalTransformation } = await import("../src/lib/funnels/art-direction");
  check("8a. emergency-intent DR lead page infers panic_to_relief (phone CTA)", inferEmotionalTransformation({ archetype: "direct_response", ctaStyle: "phone", objective: "lead_generation" }) === "panic_to_relief");
  check("8b. most-aware DR lead page infers panic_to_relief (no phone needed)", inferEmotionalTransformation({ archetype: "direct_response", awareness: "most_aware" }) === "panic_to_relief");
  check("8c. professional archetype infers uncertainty_to_confidence", inferEmotionalTransformation({ archetype: "professional_enterprise", objective: "appointment" }) === "uncertainty_to_confidence");
  check("8d. priced offer infers interest_to_ownership", inferEmotionalTransformation({ archetype: "direct_response", priced: true }) === "interest_to_ownership");
  check("8e. the floor is NEVER baseline — every inference composes", (() => {
    const t = inferEmotionalTransformation({ archetype: "direct_response" });
    const profile = deriveArtDirection({ transformation: t });
    const out = applyArtDirection(sampleSections(), profile);
    return !isBaselineProfile(profile) && out.some((s) => s.canvas || cfg(s).variant);
  })());
}

// --- 9. THE STORY-FOLD LAW: adjacent beats always differentiated ---
{
  const { enforceFoldDifferentiation, sectionHasRenderableContent } = await import("../src/lib/funnels/art-direction");
  const contentful = (): FunnelSection[] => ([
    { id: "f1", type: "hero", config: { headline: "H", mediaType: "none" } },
    { id: "f2", type: "problem_solution", config: { problemText: "p", solutionText: "s" } },
    { id: "f3", type: "benefits_grid", config: { items: [{ title: "a" }] } },
    { id: "f4", type: "offer", config: { headline: "O", bullets: ["x"], ctaLabel: "Go", formId: null } },
    { id: "f5", type: "faq", config: { items: [{ question: "q", answer: "a" }] } },
    { id: "f6", type: "cta_banner", config: { headline: "C", ctaLabel: "Go", ctaHref: "" } },
  ] as unknown as FunnelSection[]);

  // Calm register (dental-like): previously a continuous warm field — now every
  // adjacent pair must differ, with NO dark/high-contrast surfaces introduced.
  const calm = deriveArtDirection({ transformation: "fear_to_safety" });
  const calmOut = enforceFoldDifferentiation(applyArtDirection(contentful(), calm), calm);
  const surfaces = calmOut.filter((x) => sectionHasRenderableContent(x) && x.type !== "hero").map((x) => (x.config as { variant?: string }).variant === "full_bleed_close" ? "accent:self" : x.canvas ?? "UNASSIGNED");
  let adjacentClash = false;
  for (let i = 1; i < surfaces.length; i++) if (surfaces[i] === surfaces[i - 1]) adjacentClash = true;
  check("9a. calm page: NO two adjacent beats share a surface", !adjacentClash, surfaces.join(" | "));
  check("9b. calm page: every rendered beat has an explicit surface", !surfaces.includes("UNASSIGNED"));
  check("9c. calm page: the alternator never introduces dark/high-contrast", calmOut.every((x) => x.canvas !== "dark_immersive" && x.canvas !== "high_contrast_cta"));

  // Urgent register: explicit register decisions (dark band) preserved.
  const urgent = deriveArtDirection({ transformation: "panic_to_relief" });
  const urgentOut = enforceFoldDifferentiation(applyArtDirection(contentful(), urgent), urgent);
  check("9d. urgent page: the dark urgency band survives the alternator", urgentOut.find((x) => x.type === "benefits_grid")?.canvas === "dark_immersive");

  // CTA cadence floor: every multi-section genre carries >= 3 CTA-bearing beats.
  const CTA_BEARING = new Set(["hero", "offer", "ticket_tiers", "cta_banner"]);
  const genres = ["lead_gen", "webinar", "application", "tripwire", "challenge", "vsl"] as const;
  const floorOk = genres.every((g) => buildFrameworkSections(g).filter((x) => CTA_BEARING.has(x.type)).length >= 3);
  check("9e. CTA cadence floor: every multi-section genre has >= 3 action beats", floorOk);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
