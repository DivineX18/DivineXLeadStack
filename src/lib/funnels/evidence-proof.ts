/**
 * A CLASSIFICATION IS NOT A PROVENANCE.
 *
 * A generated page rendered "AS SEEN IN" above seven images scraped from the
 * customer's own website. Nobody invented those images and nobody lied about
 * the URLs — every one was a real, approved, first-party file. The lie was the
 * heading, and the route to it was a chain of individually-reasonable steps:
 *
 *     website image -> automatic classification -> operator approves the asset
 *       -> classified "partner"/"certification" -> suppliedEvidenceLogos
 *       -> proof strip -> default heading "As seen in"
 *
 * Every hop is defensible and the destination is a fabricated endorsement. The
 * error is the same one the tenant boundary made: an ATTRIBUTE was read as an
 * AUTHORIZATION. Discovery's classifier guesses what a picture looks like.
 * Approval means "this asset may be used on my pages". Neither is the
 * customer asserting that a third party endorsed them, and no amount of
 * combining them adds up to that assertion.
 *
 * So third-party proof now works the way a star rating already does (see
 * review-proof.ts, which this deliberately mirrors): it is read from a
 * structured field the operator filled in themselves, validated on the way in
 * AND re-validated on the way out, with the model nowhere in the path. Absent
 * that, a page renders no strip at all — which is the honest outcome, and a
 * recoverable one.
 *
 * WHAT MAY NEVER ESTABLISH PROVENANCE, because each was considered and each is
 * a guess about a picture rather than a statement by the business: filename,
 * alt text, OCR, image classification, where it sat on the website, approval
 * status, domain, resemblance to a logo, or model confidence.
 *
 * CATEGORY IS PART OF THE CLAIM, not decoration on it. "Partners" and "As
 * featured in" are different assertions about the world, and the second is
 * stronger. A heading is therefore derived from the stored category and can
 * never be supplied alongside it, because the whole failure was a generic
 * default silently upgrading weaker evidence into a press claim.
 *
 * Pure and dependency-free so the write path and generation share one
 * definition of what counts as verified.
 */

/** What kind of claim a mark makes. Each needs its own provenance. */
export type EvidenceCategory = "partner" | "press" | "certification" | "award";

const CATEGORIES = new Set<EvidenceCategory>(["partner", "press", "certification", "award"]);

/**
 * The heading for each category, fixed here and nowhere else.
 *
 * The renderer has no default: the failure was a component falling back to "As
 * seen in" for logos that were never press. A category with no heading in this
 * map cannot render.
 */
const HEADING: Record<EvidenceCategory, string> = {
  partner: "Partners",
  press: "As featured in",
  certification: "Certifications",
  award: "Awards",
};

/** One verified mark. `category` is required — an uncategorised mark makes an
 *  unknown claim, and an unknown claim is not publishable. */
export interface VerifiedEvidenceItem {
  url: string;
  label: string;
  category: EvidenceCategory;
}

const MAX_ITEMS = 10;
const MAX_LABEL = 60;

/**
 * Validate operator-entered evidence. Returns what may be stored, or why it
 * cannot be. Refuses partial entries outright rather than storing a mark with
 * no category, because that is precisely the shape a fabricated claim takes.
 */
export function parseEvidenceProofInput(
  input: unknown,
): { ok: true; value: VerifiedEvidenceItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "evidence must be a list of marks" };
  if (input.length === 0) return { ok: false, error: "evidence cannot be empty — omit it instead" };
  if (input.length > MAX_ITEMS) return { ok: false, error: `at most ${MAX_ITEMS} marks` };

  const out: VerifiedEvidenceItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "each mark must be an object" };
    const r = raw as Record<string, unknown>;

    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!/^https:\/\/[^\s]+$/i.test(url)) return { ok: false, error: "each mark needs an https image URL" };

    const label = typeof r.label === "string" ? r.label.trim() : "";
    // The label names WHO — "Stripe", "BBC", "ISO 9001". A mark nobody can
    // name is not evidence of anything.
    if (!label) return { ok: false, error: "each mark must name who it is ('Stripe', 'BBC', 'ISO 9001')" };
    if (label.length > MAX_LABEL) return { ok: false, error: `labels must be ${MAX_LABEL} characters or fewer` };

    const category = typeof r.category === "string" ? (r.category.trim().toLowerCase() as EvidenceCategory) : ("" as EvidenceCategory);
    if (!CATEGORIES.has(category)) {
      return { ok: false, error: "each mark needs a category: partner, press, certification or award" };
    }

    out.push({ url, label, category });
  }
  return { ok: true, value: out };
}

/**
 * The verified evidence a page may publish, read from the workspace store.
 *
 * Re-validated on the way out, not trusted because it is in the database: a
 * legacy or hand-edited document renders nothing rather than a broken claim.
 * Same rule, and same reason, as reviewProofFromStore.
 */
export function verifiedEvidenceFromStore(stored: unknown): VerifiedEvidenceItem[] | null {
  if (!stored) return null;
  const parsed = parseEvidenceProofInput(stored);
  return parsed.ok ? parsed.value : null;
}

/**
 * The proof-strip config for verified evidence, or null.
 *
 * MIXED CATEGORIES DO NOT RENDER. One strip carries one heading, so a strip
 * holding a partner logo beside a press logo would have to describe both as
 * one thing — which is the exact transformation this module exists to stop.
 * Two separate claims need two separate decisions by the operator, not a
 * heading picked by whichever mark happened to be first.
 */
export function evidenceStripConfig(
  items: VerifiedEvidenceItem[] | null,
): { variant: "logos"; heading: string; logos: { url: string; alt: string; category: EvidenceCategory }[] } | null {
  if (!items || items.length === 0) return null;

  const categories = new Set(items.map((i) => i.category));
  if (categories.size !== 1) return null;

  const category = items[0].category;
  const heading = HEADING[category];
  if (!heading) return null;

  return {
    variant: "logos",
    heading,
    logos: items.map((i) => ({ url: i.url, alt: i.label, category: i.category })),
  };
}

/**
 * DEFENSE IN DEPTH — the last gate before a third-party claim reaches a
 * visitor.
 *
 * The backfill that caused the failure was one upstream call site behaving
 * badly, and the renderer trusted it because the config looked well-formed.
 * So the render path now re-asks the same question independently: does every
 * mark carry a category, do they agree, and is the heading the one this
 * category is allowed? Anything else renders nothing.
 *
 * This is deliberately redundant with evidenceStripConfig. A future caller
 * that assembles a strip by hand, or an older funnel document written before
 * this contract existed, cannot publish an endorsement that was never
 * verified — and legacy category-less strips stop rendering, which is the
 * correct outcome for a claim whose basis we cannot establish.
 */
export function renderableEvidenceStrip(config: {
  variant?: string;
  heading?: string;
  logos?: { url?: string; alt?: string; category?: string }[];
} | null | undefined): { heading: string; logos: { url: string; alt: string }[] } | null {
  if (!config || config.variant !== "logos") return null;
  const logos = config.logos;
  if (!Array.isArray(logos) || logos.length === 0) return null;

  const cats = new Set<string>();
  const clean: { url: string; alt: string }[] = [];
  for (const l of logos) {
    if (!l || typeof l.url !== "string" || !/^https:\/\//i.test(l.url)) return null;
    if (typeof l.category !== "string" || !CATEGORIES.has(l.category as EvidenceCategory)) return null;
    cats.add(l.category);
    clean.push({ url: l.url, alt: typeof l.alt === "string" ? l.alt : "" });
  }
  if (cats.size !== 1) return null;

  const expected = HEADING[[...cats][0] as EvidenceCategory];
  // The heading must be the one this category earns. A strip carrying partner
  // marks under a press heading is the original defect, and it does not get a
  // second chance to render just because the marks themselves are now typed.
  if (!expected || (config.heading ?? "") !== expected) return null;

  return { heading: expected, logos: clean };
}
