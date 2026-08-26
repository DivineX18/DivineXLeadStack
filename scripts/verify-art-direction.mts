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
    { id: "s3", type: "benefits_grid", config: { headline: "B", items: [{ title: "one" }, { title: "two" }] } },
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
  check("3f. HVAC: hero untouched", !hvacOut.find((s) => s.type === "hero")!.canvas);
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

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
