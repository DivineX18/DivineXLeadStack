/**
 * Landing Page Calibration Engine v1 — types.
 *
 * See docs/architecture/DIVINEX_V1_NORTH_STAR.md "Landing Page Calibration
 * Engine (locked)" for the full spec this implements. Three Firestore
 * collections, all top-level (platform-wide learning, not per-sub-account —
 * a principle learned from one client's funnel should improve every future
 * funnel, matching the doc's "Ascend should become an agency that
 * continuously learns" framing) and all Admin-SDK-only (see firestore.rules
 * — same server-only pattern as `funnelOrders`):
 *
 *   - `designPrinciples/{id}`      — the Knowledge Vault. Reusable text
 *     observations only, NEVER raw HTML/templates/a client's own branding.
 *   - `funnelDesignReviews/{id}`   — one per scored funnel: the 12-criteria
 *     1-10 review from the locked spec.
 *   - `designFeedback/{id}`        — the Calibration Queue: human "what
 *     improved and why" entries, pending extraction into a vault principle.
 */

/** The 12 criteria from the locked North Star spec, scored 1-10 each. */
export type DesignReviewCriterion =
  | "visual_hierarchy"
  | "typography"
  | "spacing"
  | "section_rhythm"
  | "emotional_flow"
  | "cta_placement"
  | "trust_building"
  | "visual_storytelling"
  | "industry_authenticity"
  | "conversion_psychology"
  | "originality"
  | "premium_feel"
  | "overall_cohesion";

export const DESIGN_REVIEW_CRITERIA: DesignReviewCriterion[] = [
  "visual_hierarchy",
  "typography",
  "spacing",
  "section_rhythm",
  "emotional_flow",
  "cta_placement",
  "trust_building",
  "visual_storytelling",
  "industry_authenticity",
  "conversion_psychology",
  "originality",
  "premium_feel",
  "overall_cohesion",
];

export const DESIGN_REVIEW_CRITERION_LABELS: Record<DesignReviewCriterion, string> = {
  visual_hierarchy: "Visual hierarchy",
  typography: "Typography",
  spacing: "Spacing",
  section_rhythm: "Section rhythm",
  emotional_flow: "Emotional flow",
  cta_placement: "CTA placement",
  trust_building: "Trust building",
  visual_storytelling: "Visual storytelling",
  industry_authenticity: "Industry authenticity",
  conversion_psychology: "Conversion psychology",
  originality: "Originality",
  premium_feel: "Premium feel",
  overall_cohesion: "Overall cohesion",
};

/** The "would we proudly showcase this" bar from the locked spec. */
export const DESIGN_REVIEW_PASS_THRESHOLD = 8;

export interface FunnelDesignReview {
  id: string;
  funnelId: string;
  subAccountId: string;
  agencyId: string;
  /** 1-10 per criterion, as scored by the LLM design reviewer. */
  scores: Record<DesignReviewCriterion, number>;
  /** Mean of `scores`, rounded to 1 decimal — a single at-a-glance number. */
  overallScore: number;
  /** Criteria that scored below DESIGN_REVIEW_PASS_THRESHOLD, worst first. */
  belowBar: DesignReviewCriterion[];
  /** One short, concrete note per below-bar criterion — what to fix, not praise. */
  notes: Partial<Record<DesignReviewCriterion, string>>;
  /** The visual_archetype + genre this funnel used, for principle retrieval scoping. */
  archetype: string | null;
  genre: string;
  createdAt: unknown;
}

export type DesignFeedbackStatus = "pending" | "extracted" | "skipped";

export interface DesignFeedback {
  id: string;
  funnelId: string;
  subAccountId: string;
  agencyId: string;
  submittedByUid: string;
  /** Quick sentiment signal — does this page feel right, independent of the free text. */
  rating: "helpful" | "not_helpful";
  /** What the operator changed or noticed, in their own words. */
  whatImproved: string;
  /** Why it's better — the actual reasoning the extraction step generalizes from. */
  why: string;
  status: DesignFeedbackStatus;
  /** Set once extraction runs, whether or not it produced a principle. */
  extractedPrincipleId: string | null;
  archetype: string | null;
  genre: string;
  createdAt: unknown;
}

export type DesignPrincipleCategory =
  | "visual_system"
  | "section_pattern"
  | "typography_system"
  | "cro_principle"
  | "archetype_note";

export type DesignPrincipleSource = "human_feedback" | "seed";

export interface DesignPrinciple {
  id: string;
  /** The reusable observation itself, e.g. "Roofing pages perform better
   *  with a before/after section placed right after the offer." Never a
   *  client name, brand, or literal copy. */
  text: string;
  category: DesignPrincipleCategory;
  /** Optional scope — null means it applies broadly across archetypes. */
  archetype: string | null;
  /** Optional free-text industry tag, e.g. "roofing", "medical practice". */
  industryTag: string | null;
  source: DesignPrincipleSource;
  /** Bumped each time a new feedback/review independently supports this
   *  principle instead of minting a near-duplicate — see extraction.ts. */
  timesReinforced: number;
  active: boolean;
  /** Traceability — the feedback doc this was first extracted from, if any. */
  createdFromFeedbackId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}
