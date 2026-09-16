/**
 * A RATING IS A FACT ABOUT THE OUTSIDE WORLD.
 *
 * Every other claim family on a generated page is grounded in something the
 * operator said (see claim-integrity.ts). A star rating is the most valuable
 * claim a landing page can carry and the easiest to fabricate, so it gets a
 * stricter rule than prose: it is not grounded in what the operator TYPED to
 * an assistant, it is read from a structured field they filled in themselves.
 *
 * The model is not in this path at any point. It cannot write the store, and
 * generation does not read a rating from anything the model produced — a
 * `real_rating` in a tool call is ignored on purpose, because "the user told me
 * their rating in chat" is exactly the kind of relayed claim this is meant to
 * stop. No store entry means no strip: the page renders nothing rather than a
 * placeholder, a rounded-up number, or "5-star rated".
 *
 * Pure and dependency-free so both the write path (the settings route) and the
 * read path (generation) share one definition of what counts as verified.
 */

import type { ReviewProof } from "@/types/tenancy";

/** What a page may state, once the store has been validated. */
export interface VerifiedReviewProof {
  rating: number;
  reviewCount: number;
  reviewSource: string;
  reviewUrl: string | null;
}

/** Sources are rendered verbatim to the visitor, so the field is a short,
 *  plain name — never a sentence, a claim, or a URL wearing a name. */
const MAX_SOURCE_LENGTH = 40;

/**
 * Validate operator input. Returns the value to store, or the reason it is not
 * admissible. Partial or impossible data is refused outright rather than
 * stored half-complete, because a half-complete rating is what a placeholder
 * is made of.
 */
export function parseReviewProofInput(input: unknown): { ok: true; value: VerifiedReviewProof } | { ok: false; error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;

  const rating = typeof raw.rating === "number" ? raw.rating : Number(raw.rating);
  if (!Number.isFinite(rating) || rating <= 0 || rating > 5) {
    return { ok: false, error: "rating must be a number between 0.1 and 5" };
  }
  // One decimal place, and NEVER rounded upward: 4.94 is not 5.
  const storedRating = Math.floor(rating * 10) / 10;

  const reviewCount = typeof raw.reviewCount === "number" ? raw.reviewCount : Number(raw.reviewCount);
  if (!Number.isInteger(reviewCount) || reviewCount < 1) {
    return { ok: false, error: "reviewCount must be a whole number of at least 1" };
  }

  const reviewSource = typeof raw.reviewSource === "string" ? raw.reviewSource.trim() : "";
  if (!reviewSource) return { ok: false, error: "reviewSource is required — a rating has to say whose reviews it is" };
  if (reviewSource.length > MAX_SOURCE_LENGTH) return { ok: false, error: `reviewSource must be ${MAX_SOURCE_LENGTH} characters or fewer` };
  if (/^https?:/i.test(reviewSource)) return { ok: false, error: "reviewSource is a name like \"Google\", not a link" };

  const urlRaw = typeof raw.reviewUrl === "string" ? raw.reviewUrl.trim() : "";
  if (urlRaw && !/^https:\/\/[^\s]+$/i.test(urlRaw)) {
    return { ok: false, error: "reviewUrl must be an https link to the public profile" };
  }

  return {
    ok: true,
    value: { rating: storedRating, reviewCount, reviewSource, reviewUrl: urlRaw || null },
  };
}

/**
 * The verified proof a page may publish, read from the workspace store.
 *
 * Re-validated on the way out, not trusted because it is in the database: a
 * legacy or hand-edited document with a missing source or a zero count renders
 * nothing instead of a broken claim.
 */
export function reviewProofFromStore(stored: ReviewProof | null | undefined): VerifiedReviewProof | null {
  if (!stored) return null;
  const parsed = parseReviewProofInput(stored);
  return parsed.ok ? parsed.value : null;
}

/**
 * The proof-strip config for a verified rating, or null.
 *
 * One place builds this shape, so a page can never carry a rating assembled by
 * hand somewhere else.
 */
export function ratingStripConfig(proof: VerifiedReviewProof | null): {
  variant: "rating";
  rating: { score: number; reviewCount: number; source: string; href?: string };
} | null {
  if (!proof) return null;
  return {
    variant: "rating",
    rating: {
      score: proof.rating,
      reviewCount: proof.reviewCount,
      source: proof.reviewSource,
      ...(proof.reviewUrl ? { href: proof.reviewUrl } : {}),
    },
  };
}
