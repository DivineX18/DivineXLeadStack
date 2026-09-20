/**
 * RELEVANCE IS NOT COMPATIBILITY.
 *
 * A generated page placed a wide process diagram — legitimate, first-party,
 * genuinely about the business — into a 4:3 `object-cover` slot, and shipped
 * with words sliced through mid-character at both edges. Nothing was fabricated
 * and nothing was duplicated. Placement had one test, RELEVANCE, and needed a
 * second: does the asset survive the presentation.
 *
 * The calibration that matters, measured on the real library rather than
 * assumed: every discovered asset arrived with NO dimensions, and the offending
 * diagram was classified `hero` by discovery's own classifier. So dimensions
 * are usually missing and classification is sometimes wrong — which is why
 * UNKNOWN is the ordinary case here, and why it must never resolve to "crop it".
 *
 * This suite pins both directions. Photographs must still be able to crop, or
 * the fix is just "delete the feature"; and nothing unproven may ever be cut.
 *
 * Pure: no Firestore, no network, no model. Run:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-crop-suitability.mts
 */
import { readFileSync } from "node:fs";
import {
  cropSuitability,
  allowsDestructiveCrop,
  mediaFitFor,
  resolveMediaFit,
  cropLoss,
} from "../src/lib/funnels/asset-suitability.ts";
import { planPageVisuals, type CandidateAsset } from "../src/lib/funnels/image-director.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const a = (over: Partial<CandidateAsset>): CandidateAsset =>
  ({ url: "https://x.io/a.png", approved: true, isPhotograph: true, classification: "photo", width: 1600, height: 1067, alt: "", ...over }) as CandidateAsset;

// ── 1. A real photograph may still crop ───────────────────────────────────
{
  const photo = a({ classification: "photo", width: 1600, height: 1067 });
  check("1. a normal photograph is CROP_SAFE", cropSuitability(photo) === "crop_safe");
  check("1b. and uses cover", mediaFitFor(photo) === "cover");
  for (const cls of ["founder", "team", "customer", "product", "environment", "event"]) {
    check(`1c. ${cls} photography may crop`, allowsDestructiveCrop(a({ classification: cls })));
  }
}

// ── 2-5. Crop-sensitive classes may never be destructively cropped ────────
{
  const cases: [string, string][] = [
    ["2. text-bearing process graphic", "process"],
    ["2b. diagram", "diagram"],
    ["3. screenshot with UI/text", "screenshot"],
    ["3b. ui capture", "ui"],
    ["4. infographic", "infographic"],
    ["4b. chart", "chart"],
    ["5. logo", "logo"],
    ["5b. badge", "badge"],
    ["5c. certificate", "certificate"],
    ["5d. document", "document"],
    ["5e. comparison graphic", "comparison"],
  ];
  for (const [label, cls] of cases) {
    const asset = a({ classification: cls, width: 1600, height: 900 });
    check(`${label} is CROP_SENSITIVE`, cropSuitability(asset) === "crop_sensitive", cropSuitability(asset));
    check(`${label} does not crop`, !allowsDestructiveCrop(asset) && mediaFitFor(asset) === "intrinsic");
  }
  // The exact defect: a crop-sensitive class the classifier would have let
  // through on dimensions alone, because the dimensions fit the slot fine.
  check(
    "5f. dimensions that fit the slot do NOT make a diagram croppable",
    !allowsDestructiveCrop(a({ classification: "diagram", width: 1200, height: 900 })),
  );
}

// ── 6. UNKNOWN is never silently crop-safe ────────────────────────────────
{
  // The real-world shape: no dimensions at all, and a classification the
  // classifier guessed. This is what the failing asset actually looked like.
  const real = a({ classification: "hero", width: null, height: null });
  check("6. no-dimension asset is UNKNOWN, not crop-safe", cropSuitability(real) === "unknown", cropSuitability(real));
  check("6b. and is presented intrinsically", mediaFitFor(real) === "intrinsic");
  check("6c. an unrecognised class is UNKNOWN", cropSuitability(a({ classification: "brand_discovery" })) === "unknown");
  check(
    "6d. a photographic class WITHOUT dimensions is still UNKNOWN",
    cropSuitability(a({ classification: "photo", width: null, height: null })) === "unknown",
  );
  check(
    "6e. an extreme ratio is crop-sensitive even in a photographic class",
    cropSuitability(a({ classification: "photo", width: 2400, height: 600 })) === "crop_sensitive",
  );
  check("6f. isPhotograph alone cannot earn a crop", !allowsDestructiveCrop(a({ classification: "diagram", isPhotograph: true })));
}

// ── 7. Render-layer default is non-destructive ────────────────────────────
{
  check("7. absent fit resolves to intrinsic", resolveMediaFit(undefined) === "intrinsic");
  check("7b. junk fit resolves to intrinsic", resolveMediaFit("cover-ish") === "intrinsic" && resolveMediaFit(null) === "intrinsic" && resolveMediaFit(1) === "intrinsic");
  check("7c. only an explicit cover crops", resolveMediaFit("cover") === "cover");

  const beat = code("src/components/funnels/sections/concept-visual.tsx");
  check("7d. the beat slot no longer crops unconditionally", !/className="aspect-\[4\/3\] w-full object-cover"/.test(beat));
  check("7e. it asks the contract instead", /resolveMediaFit\(visual\.fit\)/.test(beat));
  const hero = code("src/components/funnels/sections/hero-section.tsx");
  check("7f. the full-bleed hero is gated on proven crop-safety", /resolveMediaFit\(config\.mediaFit\) === "cover"/.test(hero));
}

// ── 8. Loss arithmetic, used to judge reframe vs deletion ─────────────────
{
  check("8. a 3:1 image in a 4:3 slot loses most of its width", (cropLoss({ width: 3000, height: 1000 }, 4 / 3) ?? 0) > 0.5);
  check("8b. a matching ratio loses nothing", Math.abs(cropLoss({ width: 1200, height: 900 }, 4 / 3) ?? 1) < 0.001);
  check("8c. missing dimensions yield null, never a false 'safe'", cropLoss({ width: null, height: null }, 4 / 3) === null);
}

// ── 9. Placement: sensitive asset routed, replaced, or omitted ────────────
{
  // A crop-sensitive asset beside a genuine photograph: the plan must still
  // place imagery, and the page must not lose media to the new rule.
  const plan = planPageVisuals({
    sectionTypes: ["hero", "problem_solution", "benefits_grid"],
    assets: [a({ url: "https://x.io/diagram.png", classification: "diagram" }), a({ url: "https://x.io/photo.jpg", classification: "photo" })],
  });
  const placed = [
    ...(plan.hero.kind === "asset" ? [(plan.hero as { url: string }).url] : []),
    ...plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url),
  ];
  check("9. imagery is still placed (uniqueness/safety is not bought by omission)", placed.length > 0, placed.join(", "));

  // Nothing left but a crop-sensitive asset: it may appear, but only
  // presented safely — never cropped.
  check("9b. a lone crop-sensitive asset is presented intrinsically", mediaFitFor(a({ classification: "diagram" })) === "intrinsic");

  const caps = code("src/lib/ai-suite/capabilities.ts");
  check("9c. the planner stamps a fit on every beat visual", /fit: fitForResolvedUrl\(resolved\.url, photos\)/.test(caps));
  check("9d. and on the hero fold", /mediaFit: fitForResolvedUrl\(resolved\.url, photos\)/.test(caps));
  check("9e. first-party assets are judged by the contract", /mediaFitFor\(owned\)/.test(caps));
}

// ── 10. Previously certified protections still hold ───────────────────────
{
  const caps = code("src/lib/ai-suite/capabilities.ts");
  check("10. media uniqueness: pool still recomputed per beat", /const availableOwned = \(\) =>/.test(caps) && /firstParty: composition \? availableOwned\(\)/.test(caps));
  check("10b. evidence provenance: no backfill returned", !/args\.suppliedEvidenceLogos\s*=/.test(caps));
  check("10c. evidence still read from the verified store", /evidenceStripConfig\(\s*verifiedEvidenceFromStore\(/.test(caps));
  const consume = code("src/lib/divinex/consume-profile.ts");
  check("10d. profile media trust still gates the library", /const approved = mediaTrust\.trusted/.test(consume));
  check("10e. tenant authorization still runs first", consume.indexOf("getAuthorizedProfileSnapshotOrNull") < consume.indexOf("resolveProfileMediaTrust("));
}

console.log(
  failures === 0 ? `\nverify-crop-suitability: all checks passed` : `\nverify-crop-suitability: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
