/**
 * IMAGE DIRECTOR — ADVERSARIAL CERTIFICATION (P0.5).
 *
 * The library is deliberately hostile, modelled on the real Apostille failure:
 * legitimate photography, generic first-party stock-style photography,
 * logos/seals, transparent marks, duplicates, and an attractive-but-irrelevant
 * image.
 *
 * PASSING MEANS RESTRAINT. The Director is NOT rewarded for consuming
 * available assets. Choosing fewer images — or none — is a correct outcome.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-image-director.mts
 */
import { planPageVisuals, gradeAsset, outstandingPhotoRequests, type CandidateAsset } from "../src/lib/funnels/image-director.ts";

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const A = (o: Partial<CandidateAsset> & { url: string }): CandidateAsset => ({
  classification: "photo", width: 1200, height: 800, isPhotograph: true, approved: true, alt: null, ...o,
});

// ── The adversarial library ──────────────────────────────────────────────
const LIBRARY: CandidateAsset[] = [
  // Legitimate, strong, landscape photography.
  A({ url: "u/team-at-work.jpg", width: 3070, height: 2048, alt: "Our team notarising documents on site" }),
  // Generic first-party stock-style photography — theirs, but unremarkable.
  A({ url: "u/handshake.jpg", width: 900, height: 600, alt: null }),
  A({ url: "u/desk-generic.jpg", width: 860, height: 570, alt: null }),
  // A portrait — right for a story slot, wrong for a hero.
  A({ url: "u/founder.jpg", width: 1588, height: 2048, alt: "Jeremy Gant, founder" }),
  // Third-party seals and marks. NEVER photography.
  A({ url: "themes/x/hisd-seal.png", classification: "partner", isPhotograph: false, width: 2000, height: 2000 }),
  A({ url: "themes/x/ncaa.png", classification: "partner", isPhotograph: false, width: 1200, height: 1200 }),
  A({ url: "u/wordmark.png", classification: "graphic", isPhotograph: false, width: 2326, height: 395 }),
  // Duplicate of a real photo under a second URL-ish entry.
  A({ url: "u/team-at-work.jpg", width: 3070, height: 2048, alt: "Our team notarising documents on site" }),
  // Attractive but irrelevant, and unapproved — must never be placed.
  A({ url: "u/sunset-stock.jpg", width: 2400, height: 1600, approved: false, alt: "Beautiful sunset" }),
  // Too small to use.
  A({ url: "u/thumb.jpg", width: 147, height: 147, alt: "tiny" }),
];

// ── Grading is honest about generic first-party material ────────────────
check("1. Strong described photography grades high",
  gradeAsset(LIBRARY[0]) === "first_party_high");
check("2. Generic first-party photography is NOT flattered to 'high'",
  gradeAsset(LIBRARY[1]) === "first_party_generic", gradeAsset(LIBRARY[1]));
check("3. A seal is unusable AS PHOTOGRAPHY", gradeAsset(LIBRARY[4]) === "unusable");
check("4. A wordmark is unusable as photography", gradeAsset(LIBRARY[6]) === "unusable");
check("5. Unapproved asset is unusable however attractive", gradeAsset(LIBRARY[8]) === "unusable");
check("6. Undersized asset is not promoted", gradeAsset(LIBRARY[9]) === "first_party_poor");

// ── The plan, on a full page ─────────────────────────────────────────────
const plan = planPageVisuals({
  sectionTypes: ["hero", "photo_gallery", "proof_strip", "story", "benefits_grid", "faq", "cta_banner"],
  assets: LIBRARY,
  heroBrief: "Mobile notary meeting a client at a kitchen table or desk",
});
const placedUrls = [
  ...(plan.hero.kind === "asset" ? [plan.hero.url] : []),
  ...plan.slots.flatMap((s) => (s.resolution.kind === "asset" ? [s.resolution.url] : [])),
];

check("7. Hero uses the strong LANDSCAPE photo, not the portrait",
  plan.hero.kind === "asset" && plan.hero.url === "u/team-at-work.jpg", JSON.stringify(plan.hero).slice(0, 70));
check("8. NO seal or mark is placed as photography",
  !placedUrls.some((u) => u.includes("seal") || u.includes("ncaa") || u.includes("wordmark")));
check("9. The unapproved image is never placed", !placedUrls.includes("u/sunset-stock.jpg"));
check("10. No duplicate placement", new Set(placedUrls).size === placedUrls.length, placedUrls.join(", "));
check("11. Page-level budget respected (<=6)", placedUrls.length <= 6, `${placedUrls.length} placed`);
// Caught by reading check 10's output rather than by an assertion: a
// 147x147 thumbnail was being placed in the gallery. A weak image is worse
// than a deliberate gap — it degrades the composition while looking handled.
check("11b. QUALITY FLOOR: no poor-grade asset is placed anywhere",
  !placedUrls.includes("u/thumb.jpg"), placedUrls.join(", "));
check("12. The portrait went to the STORY slot, not the hero",
  plan.slots.some((s) => s.sectionType === "story" && s.resolution.kind === "asset" && s.resolution.url === "u/founder.jpg"));

// ── RESTRAINT: a thin gallery is omitted, not padded ─────────────────────
const thin = planPageVisuals({
  sectionTypes: ["hero", "photo_gallery"],
  assets: [LIBRARY[0], LIBRARY[1]],
  heroBrief: "x",
});
const galleryThin = thin.slots.find((s) => s.sectionType === "photo_gallery");
check("13. RESTRAINT: gallery omitted rather than shown with too few photos",
  galleryThin?.resolution.kind === "intentionally_none", JSON.stringify(galleryThin?.resolution).slice(0, 60));

// ── No unresolved state masquerades as a completed visual ───────────────
const noPhotos = planPageVisuals({
  sectionTypes: ["hero", "story"],
  assets: [LIBRARY[4], LIBRARY[6]], // only seals and marks
  heroBrief: "Mobile notary meeting a client at a kitchen table or desk",
});
check("14. With no usable photography, hero becomes an explicit REQUEST",
  noPhotos.hero.kind === "authentic_photo_required");
check("15. The request carries the specific brief, not 'add an image'",
  noPhotos.hero.kind === "authentic_photo_required" && noPhotos.hero.brief.includes("kitchen table"),
  noPhotos.hero.kind === "authentic_photo_required" ? noPhotos.hero.brief : "");
check("16. Outstanding requests are enumerable for the UI to action",
  outstandingPhotoRequests(noPhotos).length >= 1);

// ── A text-led page is a valid outcome, not a failure ───────────────────
const textLed = planPageVisuals({ sectionTypes: ["hero", "benefits_grid"], assets: [], heroPrefersText: true });
check("17. Intentional text-only hero is a first-class outcome",
  textLed.hero.kind === "intentionally_none");
check("18. And it explains itself rather than looking broken",
  textLed.hero.kind === "intentionally_none" && textLed.hero.reason.length > 20);
check("19. Benefits stay text-only when nothing is strong enough",
  !textLed.slots.some((s) => s.sectionType === "benefits_grid" && s.resolution.kind === "asset"));
check("20. The plan explains its own decisions", textLed.notes.length > 0, textLed.notes.join(" | ").slice(0, 80));

console.log(`\n${bad === 0 ? "IMAGE DIRECTOR CERTIFIED (adversarial)" : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
