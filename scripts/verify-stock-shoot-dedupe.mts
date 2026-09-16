/**
 * TWO FRAMES OF ONE SCENE ARE ONE PHOTOGRAPH.
 *
 * Certification failure, Booking run 3: Pexels 3884103 in the hero and 3884101
 * in the next section. Same hygienist, same patient, same chair, slightly
 * wider crop. The URLs differed, so the page-level URL check passed.
 *
 * Every candidate below carries the REAL provider metadata for these photos
 * (fetched from the Pexels API during the investigation), so this reproduces
 * the failure rather than a paraphrase of it.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-stock-shoot-dedupe.mts
 */
import {
  resolveVisualSource,
  sharesStockShoot,
  SAME_SHOOT_ID_WINDOW,
  type PhotoCandidate,
  type SourceInventory,
} from "../src/lib/funnels/visual-source.ts";
import type { VisualBeat } from "../src/lib/funnels/visual-story.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const px = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;

// Real Pexels records.
const HERO_3884103: PhotoCandidate = {
  url: px(3884103),
  providerId: 3884103,
  photographerId: 224453, // Andrea Piacquadio
  alt: "Positive young female dentist in latex gloves and uniform talking with young patient while sitting near chair and preparing for treatment in modern dental room in hospital",
};
const SIBLING_3884101: PhotoCandidate = {
  url: px(3884101),
  providerId: 3884101,
  photographerId: 224453,
  alt: "Positive young female dentist in uniform and latex gloves smiling while talking with patient during work in modern dental room in hospital",
};
const OTHER_PHOTOGRAPHER_3845983: PhotoCandidate = {
  url: px(3845983),
  providerId: 3845983,
  photographerId: 1984515, // Anna Shvets
  alt: "Content female dentist in uniform interacting with male patient sitting in shoe covers on dental chair during medical appointment in light doctor office",
};
const SAME_PHOTOGRAPHER_OTHER_SESSION_3946837: PhotoCandidate = {
  url: px(3946837),
  providerId: 3946837,
  photographerId: 224453,
  alt: "Crop anonymous female dentist in blue uniform and latex gloves using drill and mouth mirror while treating teeth of female patient lying in dental chair",
};

// ── 1. The identity rule itself ────────────────────────────────────────────
console.log("\n══ what counts as the same shoot ══");
check("the certified pair is the same shoot", sharesStockShoot(HERO_3884103, SIBLING_3884101));
check("... symmetrically", sharesStockShoot(SIBLING_3884101, HERO_3884103));
check("a different photographer is not", !sharesStockShoot(HERO_3884103, OTHER_PHOTOGRAPHER_3845983));
check(
  "the same photographer's separate session is not",
  !sharesStockShoot(HERO_3884103, SAME_PHOTOGRAPHER_OTHER_SESSION_3946837),
  `${Math.abs(3946837 - 3884103)} ids apart`,
);
check("the identical URL always is", sharesStockShoot(HERO_3884103, { url: HERO_3884103.url, alt: "" }));
check(
  "without provider identity nothing is inferred",
  !sharesStockShoot({ url: "a.jpg", alt: "dentist" }, { url: "b.jpg", alt: "dentist" }),
);
check(
  "a missing photographer id is not treated as a match",
  !sharesStockShoot({ ...SIBLING_3884101, photographerId: undefined }, HERO_3884103),
);
check("the window edge is inclusive", sharesStockShoot(HERO_3884103, { ...SIBLING_3884101, url: "e", providerId: 3884103 + SAME_SHOOT_ID_WINDOW }));
check("... and one past it is not", !sharesStockShoot(HERO_3884103, { ...SIBLING_3884101, url: "f", providerId: 3884103 + SAME_SHOOT_ID_WINDOW + 1 }));

// Batches observed in real Pexels search results during the investigation:
// consecutive uploads of one session, all well inside the window.
const OBSERVED_SESSIONS: [string, number, number][] = [
  ["Gustavo Fring, dental session", 5622000, 5622270],
  ["kaboompics, dental session", 6627325, 6627563],
  ["Tima Miroshnichenko, dental session", 5355698, 5355924],
  ["Ryan Stephens, roofing session", 33404080, 33404248],
];
for (const [label, a, b] of OBSERVED_SESSIONS) {
  check(`observed session is recognised: ${label}`, sharesStockShoot({ url: `${a}`, alt: "", providerId: a, photographerId: 1 }, { url: `${b}`, alt: "", providerId: b, photographerId: 1 }));
}

// ── 2. The Booking failure, end to end through the resolver ────────────────
console.log("\n══ the next beat takes another qualified photograph ══");
const beat = (concept: string, id: string): VisualBeat => ({
  sectionId: id,
  argumentRole: "belief_shift",
  visualJob: "show_cost_of_current_state",
  concept,
  continuesFrom: null,
});
const inventory = (placed: PhotoCandidate[], photos: PhotoCandidate[]): SourceInventory => ({
  category: "local_service_health",
  hostComposition: "split",
  serviceDomain: "general dentistry",
  contextSubject: "dentist talking with a patient in a dental chair",
  photos,
  placedStockPhotos: placed,
});
const DENTAL_BEAT = beat("a dentist talking with a patient in the dental chair before any treatment", "ps");

{
  // Control: with nothing placed yet, the sibling is a perfectly good photo.
  const alone = resolveVisualSource(DENTAL_BEAT, inventory([], [SIBLING_3884101, OTHER_PHOTOGRAPHER_3845983]));
  check("the sibling qualifies on its own merits", alone.source === "contextual_photo" && alone.url === SIBLING_3884101.url, `${alone.source} ${alone.url ?? ""}`);

  // THE CERTIFIED FAILURE: the hero already shows 3884103, and the sibling is
  // offered first.
  const after = resolveVisualSource(DENTAL_BEAT, inventory([HERO_3884103], [SIBLING_3884101, OTHER_PHOTOGRAPHER_3845983]));
  check("the second frame of the hero's shoot is not placed", after.url !== SIBLING_3884101.url, after.url ?? after.source);
  check("... and the beat keeps a photograph instead of losing its visual", after.source === "contextual_photo", `${after.source} (${after.reason})`);
  check("... the other qualified candidate", after.url === OTHER_PHOTOGRAPHER_3845983.url, after.url ?? "");
}
{
  // The same photographer, a different session, is a legitimate second image.
  const after = resolveVisualSource(DENTAL_BEAT, inventory([HERO_3884103], [SAME_PHOTOGRAPHER_OTHER_SESSION_3946837]));
  check("another session by the same photographer is still allowed", after.url === SAME_PHOTOGRAPHER_OTHER_SESSION_3946837.url, `${after.source} ${after.url ?? ""}`);
}
{
  // When the ONLY candidates are frames of the placed shoot, the beat does not
  // re-use them. It falls through the hierarchy exactly as a rejected photo
  // always has, never to a repeat.
  const after = resolveVisualSource(DENTAL_BEAT, inventory([HERO_3884103], [SIBLING_3884101]));
  check("with no alternative, the repeat is still refused", after.url !== SIBLING_3884101.url, `${after.source}`);
}
{
  // Existing gates are untouched: an off-domain photograph is still refused
  // even though it shares no shoot with anything.
  const offDomain = resolveVisualSource(
    DENTAL_BEAT,
    inventory([HERO_3884103], [{ url: "g", alt: "Roofer using nail gun for shingle installation on residential roof", providerId: 33404248, photographerId: 2154802717 }]),
  );
  check("service-domain relevance still applies", offDomain.source !== "contextual_photo", offDomain.source);
}

console.log(failures === 0 ? "\nSTOCK SHOOT DEDUPE: ALL CHECKS PASSED\n" : `\nSTOCK SHOOT DEDUPE: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
