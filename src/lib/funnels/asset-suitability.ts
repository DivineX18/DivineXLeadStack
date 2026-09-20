/**
 * RELEVANCE IS NOT COMPATIBILITY.
 *
 * A generated page placed a wide process diagram — legitimate, first-party,
 * genuinely about the business — into a 4:3 `object-cover` slot. Crop-to-fill
 * did what crop-to-fill does, and the page shipped with words sliced through
 * mid-character on both edges: `d` / `right` on one side, `O` / `Co` on the
 * other. Nothing was fabricated and nothing was duplicated. The image was
 * simply incompatible with how the slot renders, and no part of the engine had
 * ever been asked that question.
 *
 * Placement had one test — is this asset RELEVANT — and needed two. The second
 * is whether the asset survives the presentation. A photograph loses framing
 * when cropped and is still a photograph; a diagram loses its content.
 *
 * WHAT THE ENGINE ACTUALLY KNOWS, measured rather than assumed: on a real
 * discovered library every asset arrives with NO width or height, and the
 * offending diagram was classified `hero` by discovery's own classifier. So
 * dimensions are usually absent and classification is demonstrably wrong
 * sometimes. That rules out any design that needs either to be reliable, and
 * it is why UNKNOWN is the ordinary case here rather than the edge case.
 *
 * Hence the rule: only evidence can earn a destructive crop. UNKNOWN does not
 * become CROP_SAFE because the dimensions happen to fit, because usually there
 * are no dimensions — and "we could not tell" must never resolve to "slice it".
 * A non-destructive presentation is preferred to a wrong one, and omission is
 * preferred to both.
 *
 * Deliberately cheap: set membership and arithmetic on metadata the pipeline
 * already carries. No fetching, no decoding, no model call, nothing added to
 * the cost of a generation.
 */

import type { CandidateAsset } from "@/lib/funnels/image-director";

export type CropSuitability = "crop_safe" | "crop_sensitive" | "unknown";

/**
 * Classes whose MEANING lives in their pixels edge-to-edge. Cropping one does
 * not reframe it, it deletes part of what it says.
 */
const CROP_SENSITIVE_CLASSES = new Set([
  "logo",
  "wordmark",
  "mark",
  "seal",
  "icon",
  "badge",
  "certificate",
  "certification",
  "partner",
  "award",
  "diagram",
  "process",
  "infographic",
  "chart",
  "graph",
  "screenshot",
  "ui",
  "document",
  "comparison",
  "pricing",
  "table",
  "text",
  "graphic",
  "illustration",
]);

/**
 * Classes that are genuine photography — the only ones a crop reframes rather
 * than mutilates. Kept deliberately narrow.
 */
const PHOTOGRAPHIC_CLASSES = new Set(["photo", "founder", "team", "customer", "product", "environment", "event"]);

/**
 * Ratios outside ordinary photography. A 3:1 image is a banner, a strip or a
 * diagram far more often than it is a photograph, and it is also the shape
 * that loses the most to a 4:3 crop.
 */
const PHOTO_MAX_RATIO = 2.2;
const PHOTO_MIN_RATIO = 0.45;

/**
 * How much of an image a crop-to-fill into `slotRatio` would discard, as a
 * fraction of its area. Used to decide whether a crop is a reframe or a
 * deletion; returns null when the dimensions needed to answer are missing,
 * which on real libraries is most of the time.
 */
export function cropLoss(a: Pick<CandidateAsset, "width" | "height">, slotRatio: number): number | null {
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  if (w <= 0 || h <= 0 || !Number.isFinite(slotRatio) || slotRatio <= 0) return null;
  const r = w / h;
  // object-cover scales to fill, so the excess on the longer axis is cut.
  const visible = r > slotRatio ? slotRatio / r : r / slotRatio;
  return 1 - visible;
}

/**
 * May this asset be cropped to fill?
 *
 * CROP_SENSITIVE and UNKNOWN both mean "do not destructively crop"; they are
 * kept distinct so a caller can tell a known-unsafe asset from an unproven one,
 * and so the reason can be reported to an operator honestly.
 */
export function cropSuitability(a: Pick<CandidateAsset, "classification" | "width" | "height" | "isPhotograph">): CropSuitability {
  const cls = (a.classification ?? "").toLowerCase().trim();

  // A known crop-sensitive class settles it, whatever else is true — including
  // an `isPhotograph` flag, which is itself derived from the same classifier.
  if (CROP_SENSITIVE_CLASSES.has(cls)) return "crop_sensitive";

  // Everything else needs POSITIVE evidence of being a photograph. Both parts
  // are required: a photographic class AND real dimensions in a photographic
  // range. Either alone has been observed to be wrong.
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  if (!PHOTOGRAPHIC_CLASSES.has(cls)) return "unknown";
  if (w <= 0 || h <= 0) return "unknown";
  const r = w / h;
  if (r > PHOTO_MAX_RATIO || r < PHOTO_MIN_RATIO) return "crop_sensitive";
  return "crop_safe";
}

/** True only for an asset proven safe to crop. Never true for UNKNOWN. */
export function allowsDestructiveCrop(
  a: Pick<CandidateAsset, "classification" | "width" | "height" | "isPhotograph">,
): boolean {
  return cropSuitability(a) === "crop_safe";
}

/** How a slot should present an asset it has been given. */
export type MediaFit = "cover" | "intrinsic";

/**
 * The presentation a slot should use.
 *
 * `intrinsic` renders the image at its own aspect ratio — no crop, no
 * letterbox, nothing removed. It is the non-destructive treatment referred to
 * throughout: a diagram beside a paragraph reads perfectly at its natural
 * shape, and is only ever ruined by being forced into someone else's box.
 */
export function mediaFitFor(
  a: Pick<CandidateAsset, "classification" | "width" | "height" | "isPhotograph">,
): MediaFit {
  return allowsDestructiveCrop(a) ? "cover" : "intrinsic";
}

/**
 * DEFENSE IN DEPTH, for the render layer.
 *
 * A section must be able to decide safely from the config it is handed, without
 * trusting that the planner got it right — the fabricated-proof failure was
 * exactly one upstream caller being wrong while everything downstream assumed
 * it was not. An explicit `fit` is honoured; anything unrecognised, missing or
 * malformed resolves to the non-destructive treatment.
 *
 * That default matters more than it looks: every funnel generated before this
 * contract existed carries no `fit` at all, and those pages must stop slicing
 * their images too.
 */
export function resolveMediaFit(fit: unknown): MediaFit {
  return fit === "cover" ? "cover" : "intrinsic";
}
