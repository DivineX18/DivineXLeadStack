/**
 * IF A VISITOR CANNOT SEE IT, IT CANNOT CARRY THE ARGUMENT.
 *
 * A persuasion role is a promise that some part of the page does that job for
 * the reader. A section that renders nothing does no job, so a role stamped on
 * one is a claim the published page does not honour.
 *
 * The case this locks: an image-less `photo_gallery` is a legitimate BUILDER
 * artifact (it shows the operator where their real photography belongs) and
 * renders nothing to a visitor by design. It was nevertheless handed the
 * `proof` role on section type alone, so the plan recorded proof as handled
 * while the live page carried no proof beat at all.
 *
 * The invariant generalises past galleries, which is the point: it holds for
 * anything that exists in the generation model and disappears at render time.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-visible-persuasion.mts
 */
import { stampArgumentRoles, sectionHasRenderableContent } from "../src/lib/funnels/art-direction.ts";
import { layoutFamilyOf, describePageRhythm } from "../src/lib/funnels/page-composition.ts";
import { planVisualStory } from "../src/lib/funnels/visual-story.ts";
import { pruneEmptySections } from "../src/lib/funnels/section-completeness.ts";
import type { FunnelSection } from "../src/types/funnels";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const sec = (id: string, type: string, config: Record<string, unknown>): FunnelSection =>
  ({ id, type, config }) as unknown as FunnelSection;

/** A page whose ONLY proof-capable section is an image-less gallery. */
const emptyGallery = sec("g", "photo_gallery", { images: [], placeholderLabel: "Add photos of your work", layout: "grid" });
const fullGallery = sec("g", "photo_gallery", { images: [{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }], layout: "grid" });
const proofStrip = sec("p", "proof_strip", { variant: "rating", rating: { score: 4.9, reviewCount: 120 } });
const page = (gallery: FunnelSection, extra: FunnelSection[] = []) => [
  sec("h", "hero", { headline: "A real headline", mediaType: "none" }),
  gallery,
  ...extra,
  sec("b", "benefits_grid", { items: [{ title: "One" }, { title: "Two" }] }),
  sec("c", "cta_banner", { headline: "Ready?", ctaLabel: "Book" }),
];

// ── 1. The builder keeps its prompt ─────────────────────────────────────────
console.log("\n══ an empty gallery survives as a builder artifact ══");
{
  const pruned = pruneEmptySections(page(emptyGallery));
  check(
    "an image-less gallery with a placeholder is NOT pruned away",
    pruned.sections.some((s) => s.type === "photo_gallery"),
    `${pruned.removed.length} removed`,
  );
  // The whole reason it stays: the operator needs to be told where their real
  // photography goes. Deleting it would remove the only prompt to add media.
  const kept = pruned.sections.find((s) => s.type === "photo_gallery")!;
  check(
    "... and it keeps the operator-facing prompt",
    !!(kept.config as { placeholderLabel?: string }).placeholderLabel,
  );
}

// ── 2. ... and shows a visitor nothing ──────────────────────────────────────
console.log("\n══ and renders nothing publicly ══");
{
  check("an image-less gallery has no renderable content", !sectionHasRenderableContent(emptyGallery));
  check("a populated one does", sectionHasRenderableContent(fullGallery));
}

// ── 3. It cannot satisfy the proof role ─────────────────────────────────────
console.log("\n══ an invisible section cannot own a persuasion role ══");
{
  const stamped = stampArgumentRoles(page(emptyGallery));
  const gallery = stamped.find((s) => s.type === "photo_gallery")!;
  check("the empty gallery is not stamped proof", gallery.argumentRole === undefined, String(gallery.argumentRole));
  check("no section claims proof on this page", !stamped.some((s) => s.argumentRole === "proof"));
  // Visible sections are unaffected.
  check("the hero still carries the hook", stamped.find((s) => s.type === "hero")?.argumentRole === "hook");
  check("the grid still carries the promise", stamped.find((s) => s.type === "benefits_grid")?.argumentRole === "promise");

  // A STALE role is REMOVED, not merely withheld — a role left from an earlier
  // stamp is exactly the false claim this exists to prevent.
  const stale = stampArgumentRoles([{ ...emptyGallery, argumentRole: "proof" } as FunnelSection]);
  check("a stale role on a now-invisible section is stripped", stale[0].argumentRole === undefined, String(stale[0].argumentRole));
}

// ── 4. Proof moves to a truthful visible section ────────────────────────────
console.log("\n══ proof moves to something the visitor can see ══");
{
  const stamped = stampArgumentRoles(page(emptyGallery, [proofStrip]));
  const strip = stamped.find((s) => s.type === "proof_strip")!;
  check("a real proof strip takes the proof role instead", strip.argumentRole === "proof", String(strip.argumentRole));
  check("the invisible gallery still does not", stamped.find((s) => s.type === "photo_gallery")?.argumentRole === undefined);
  check("proof is claimed exactly once", stamped.filter((s) => s.argumentRole === "proof").length === 1);
}

// ── 5. No truthful proof means proof is ABSENT, not pretended ───────────────
console.log("\n══ absent proof is reported as absent ══");
{
  const stamped = stampArgumentRoles(page(emptyGallery));
  check("no proof role exists when nothing can carry it", !stamped.some((s) => s.argumentRole === "proof"));
  // ... and the visual story therefore plans no proof beat, rather than
  // planning one against a section nobody sees.
  const beats = planVisualStory(stamped, { whyOldWayFails: "The old way leaves the work scattered across tools", corePromise: "One place for everything" });
  check("and no visual beat is planned for proof", !beats.some((b) => b.visualJob === "establish_proof"), beats.map((b) => b.visualJob).join(", "));
}

// ── 6. A populated gallery legitimately carries proof ───────────────────────
console.log("\n══ real customer media earns the role back ══");
{
  const stamped = stampArgumentRoles(page(fullGallery));
  const gallery = stamped.find((s) => s.type === "photo_gallery")!;
  check("a gallery with real images IS stamped proof", gallery.argumentRole === "proof", String(gallery.argumentRole));
  // The gate reads live config, so adding media later restores eligibility —
  // it is not a one-time decision baked in at generation.
  const wasEmpty = stampArgumentRoles(page(emptyGallery));
  const nowFilled = stampArgumentRoles(
    wasEmpty.map((s) => (s.type === "photo_gallery" ? fullGallery : s)),
  );
  check("adding media later restores the role", nowFilled.find((s) => s.type === "photo_gallery")?.argumentRole === "proof");
}

// ── 7. Published rhythm does not count it ───────────────────────────────────
console.log("\n══ page rhythm counts only what renders ══");
{
  check("an invisible gallery has no layout family", layoutFamilyOf(emptyGallery) === "none", layoutFamilyOf(emptyGallery));
  check("a populated one does", layoutFamilyOf(fullGallery) !== "none", layoutFamilyOf(fullGallery));
  const withEmpty = describePageRhythm(page(emptyGallery));
  const without = describePageRhythm(page(emptyGallery).filter((s) => s.type !== "photo_gallery"));
  check(
    "rhythm is identical with and without the invisible section",
    withEmpty.families.join(",") === without.families.join(","),
    `${withEmpty.families.join(",")} vs ${without.families.join(",")}`,
  );
  const withReal = describePageRhythm(page(fullGallery));
  check("a real gallery DOES contribute to rhythm", withReal.families.length === withEmpty.families.length + 1);
}

console.log(failures === 0 ? "\nVISIBLE PERSUASION: ALL CHECKS PASSED\n" : `\nVISIBLE PERSUASION: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
