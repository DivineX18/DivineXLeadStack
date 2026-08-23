/**
 * Visual Review — PURE core (types, flags, the vision prompt, and the parser).
 * No server-only, no fetch, no Firestore — so the parser is tested directly.
 * The server-only wrapper (visual-review.ts) composes these with the real
 * OpenRouter vision call + persistence.
 */

/** The closed set of machine-readable visual flags the pre-publish gate reasons
 *  with. Keeping it closed means the gate logic can rely on exact values. */
export const VISUAL_FLAGS = [
  "bland_generic",
  "looks_templated",
  "weak_contrast",
  "cta_not_prominent",
  "poor_hierarchy",
  "unprofessional",
  "too_sparse",
  "strong",
] as const;
export type VisualFlag = (typeof VISUAL_FLAGS)[number];

export interface VisualReview {
  /** 0-100 — how much the page LOOKS like it converts (bold direct-response),
   *  NOT how tasteful/minimal it is. */
  visualScore: number;
  /** One-sentence overall verdict. */
  verdict: string;
  strengths: string[];
  issues: string[];
  flags: VisualFlag[];
}

export const VISUAL_REVIEW_SYSTEM =
  "You are a senior DIRECT-RESPONSE landing-page designer reviewing a screenshot of a funnel page BEFORE it is published. " +
  "Judge how it LOOKS — bold, high-contrast, clear hierarchy, a prominent high-visibility CTA, professional, like a top ClickFunnels / Russell Brunson / Alex Hormozi sales page that converts. " +
  "A flat, plain, low-contrast, sparse, or 'default template' look is a FAILURE, no matter how tasteful it seems — tasteful-but-bland does NOT convert. " +
  "Score visualScore 0-100 (0 = bland/broken/unfinished, 100 = obviously high-converting). Be critical; a first draft rarely earns 85+. " +
  'Return ONLY a JSON object, no markdown: {"visualScore": <0-100>, "verdict": "<one sentence>", "strengths": ["..."], "issues": ["..."], "flags": ["..."]}. ' +
  "Use flags ONLY from this exact set (include every one that applies; use 'strong' when the page genuinely looks high-converting): " +
  VISUAL_FLAGS.join(", ") +
  ".";

/** Parse a vision model's reply into a VisualReview. Tolerant of surrounding
 *  prose/fences; returns null on anything unparseable. */
export function parseVisualReview(text: string): VisualReview | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawScore = Number((p.visualScore ?? p.visual_score) as number);
  const visualScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const strList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 200)).slice(0, 6)
      : [];
  const flags = strList(p.flags)
    .map((f) => f.toLowerCase().replace(/\s+/g, "_"))
    .filter((f): f is VisualFlag => (VISUAL_FLAGS as readonly string[]).includes(f));
  return {
    visualScore,
    verdict: typeof p.verdict === "string" ? p.verdict.trim().slice(0, 300) : "",
    strengths: strList(p.strengths),
    issues: strList(p.issues),
    flags: [...new Set(flags)],
  };
}

/** True when the review's flags or score say a human should look before publish. */
export function visualReviewNeedsAttention(r: VisualReview): boolean {
  const bad = r.flags.some((f) => f !== "strong");
  return bad || r.visualScore < 70;
}
