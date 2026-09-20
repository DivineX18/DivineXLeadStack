/**
 * A POOL SNAPSHOT TAKEN BEFORE THE LOOP CANNOT DEDUPE INSIDE IT.
 *
 * One image took the hero fold, the problem beat and the benefits beat on an
 * eight-section page. The mechanism meant to prevent that was present and
 * looked right: a `placedUrls` set, updated on every placement. The bug was
 * that the candidate pool was filtered against that set ONCE, before the loop,
 * and then handed to every beat unchanged. The set grew; the pool never shrank.
 *
 * Two further holes made it reachable and invisible:
 *   - the planner chose a hero in ignorance of one already set by the model,
 *     so the real hero image stayed in the pool as a candidate; and
 *   - dedupe compared raw URLs, while WordPress serves one upload as several
 *     (`image22.png`, `image22-1024x562.png`, `image2-e1786899892158.png`).
 *
 * Priority this suite defends, in order: trusted+relevant+unique, then
 * deliberate continuity, then NO media, then — never — an accidental repeat.
 * Uniqueness is not bought by dropping imagery: the "falls through to another
 * qualified asset" cases below fail if the engine simply omits instead.
 *
 * Pure: no Firestore, no network, no model. Run:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-media-uniqueness.mts
 */
import { readFileSync } from "node:fs";
import { assetKey, sameAsset } from "../src/lib/funnels/asset-identity.ts";
import { planPageVisuals, type CandidateAsset } from "../src/lib/funnels/image-director.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const asset = (url: string, over: Partial<CandidateAsset> = {}): CandidateAsset =>
  ({
    url,
    approved: true,
    isPhotograph: true,
    classification: "photo",
    width: 1600,
    height: 900,
    alt: "",
    ...over,
  }) as CandidateAsset;

// ── A. Asset identity survives CMS URL variants ───────────────────────────
{
  const base = "https://divinex.io/wp-content/uploads/2026/08/image22.png";
  check("A1. a generated size variant is the same asset", sameAsset(base, "https://divinex.io/wp-content/uploads/2026/08/image22-1024x562.png"));
  check("A2. an edit revision is the same asset", sameAsset("https://x.io/a/image2.png", "https://x.io/a/image2-e1786899892158.png"));
  check("A3. a query string does not create a new asset", sameAsset(base, base + "?ver=3"));
  check("A4. genuinely different uploads stay different", !sameAsset(base, "https://divinex.io/wp-content/uploads/2026/08/image23.png"));
  check("A5. an empty/invalid url never matches anything", !sameAsset("", "") && assetKey(undefined) === "");
  // Conservative on purpose: a number in the NAME is not a size suffix.
  check("A6. a name ending in digits is not mistaken for a variant", !sameAsset("https://x.io/a/4-3.png", "https://x.io/a/4.png"));
}

// ── B. The hero is consumed by downstream selection ───────────────────────
{
  const heroUrl = "https://x.io/a/one.png";
  const plan = planPageVisuals({
    sectionTypes: ["hero", "problem_solution", "benefits_grid"],
    assets: [asset(heroUrl), asset("https://x.io/a/two.png"), asset("https://x.io/a/three.png")],
    heroAlreadyUrl: heroUrl,
  });
  const placed = plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url);
  check("B1. an already-set hero is reported as consumed", plan.hero.kind === "asset" && (plan.hero as { url: string }).url === heroUrl);
  check("B2. the hero asset is EXCLUDED from downstream sections", !placed.some((u) => sameAsset(u, heroUrl)), placed.join(", "));
  check("B3. and downstream still gets imagery (uniqueness is not bought by omission)", placed.length > 0, `${placed.length} placed`);
}

// ── C. A size-variant of the hero cannot sneak back in ────────────────────
{
  const heroUrl = "https://x.io/a/img.png";
  const plan = planPageVisuals({
    sectionTypes: ["hero", "problem_solution"],
    assets: [asset(heroUrl), asset("https://x.io/a/img-1024x562.png"), asset("https://x.io/a/other.png")],
    heroAlreadyUrl: heroUrl,
  });
  const placed = plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url);
  check("C1. the hero's size variant is not re-placed", !placed.some((u) => sameAsset(u, heroUrl)), placed.join(", "));
  check("C2. it falls through to a genuinely different asset", placed.some((u) => sameAsset(u, "https://x.io/a/other.png")), placed.join(", "));
}

// ── D. No two sections share an asset within one plan ─────────────────────
{
  const plan = planPageVisuals({
    sectionTypes: ["hero", "problem_solution", "benefits_grid", "callout"],
    assets: [asset("https://x.io/a/1.png"), asset("https://x.io/a/2.png"), asset("https://x.io/a/3.png"), asset("https://x.io/a/4.png")],
  });
  const all = [
    ...(plan.hero.kind === "asset" ? [(plan.hero as { url: string }).url] : []),
    ...plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url),
  ];
  const keys = all.map(assetKey);
  check("D1. every placement in a plan is a distinct asset", new Set(keys).size === keys.length, all.join(", "));
}

// ── E. Scarcity omits rather than duplicates ──────────────────────────────
{
  const only = "https://x.io/a/solo.png";
  const plan = planPageVisuals({
    sectionTypes: ["hero", "problem_solution", "benefits_grid", "callout"],
    assets: [asset(only)],
    heroAlreadyUrl: only,
  });
  const placed = plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url);
  check("E1. with one asset already in the hero, NOTHING downstream repeats it", placed.length === 0, placed.join(", "));
}

// ── F. The live loop recomputes its pool, and normalizes identity ─────────
{
  const caps = read("src/lib/ai-suite/capabilities.ts");
  check(
    "F1. the beat loop recomputes availability per beat",
    /const availableOwned = \(\) =>/.test(caps) && /firstParty: composition \? availableOwned\(\)/.test(caps),
  );
  check("F2. the stale pre-filtered pool is gone", !/firstParty: composition \? ownedPool\./.test(caps));
  check("F3. placements are recorded under a normalized key", /placedUrls\.add\(assetKey\(resolved\.url\)\)/.test(caps));
  check("F4. and availability is tested with the same key", /!placedUrls\.has\(assetKey\(a\.url\)\)/.test(caps));
  check("F5. the planner is told what the hero already holds", /heroAlreadyUrl:/.test(caps));
  check(
    "F6. a filled hero clears BOTH halves of its placeholder state",
    /mediaPlaceholderLabel: "",\s*\n\s*mediaPlaceholderBrief: "",/.test(caps),
  );
}

// ── G. Gallery behaviour and media-trust protections are untouched ────────
{
  const director = read("src/lib/funnels/image-director.ts");
  check("G1. the gallery still demands CONFIRMED photographs", /photographConfidence\(/.test(director) && /confirmed/.test(director));
  const consume = read("src/lib/divinex/consume-profile.ts");
  check("G2. profile media trust still gates the whole library", /const approved = mediaTrust\.trusted/.test(consume));
  check("G3. and tenant authorization still runs before it", consume.indexOf("getAuthorizedProfileSnapshotOrNull") < consume.indexOf("resolveProfileMediaTrust("));
}

console.log(
  failures === 0 ? `\nverify-media-uniqueness: all checks passed` : `\nverify-media-uniqueness: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
