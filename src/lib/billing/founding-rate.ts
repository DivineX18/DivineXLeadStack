/**
 * FOUNDING RATES — one place that decides whether a discount may be shown.
 *
 * A founding price is a claim: "this is cheaper than it will be." Making
 * that claim in the card component means every surface that shows a price
 * has to re-derive it, and the first one that gets it slightly wrong is
 * advertising a saving that is not real. So the decision lives here, is
 * pure, and returns null whenever the claim cannot be substantiated.
 *
 * Deliberately conservative. A standard rate that is missing, not a finite
 * number, or not STRICTLY above what we actually charge yields no discount
 * at all rather than a zero-saving strikethrough — an inflated or equal
 * "was" price is the exact pattern consumer-protection rules exist for.
 */

export interface FoundingRate {
  /** What the customer is charged, in cents. */
  priceMonthlyCents: number;
  /** The standard rate it is discounted from, in cents. */
  standardPriceMonthlyCents: number;
  /** Whole-dollar saving per month, for copy like "save $70/mo". */
  savingMonthlyCents: number;
  /** Rounded percentage off, 1–99. */
  percentOff: number;
}

export function describeFoundingRate(input: {
  priceMonthlyCents: number;
  standardPriceMonthlyCents?: number | null;
}): FoundingRate | null {
  const price = input.priceMonthlyCents;
  const standard = input.standardPriceMonthlyCents;

  if (typeof standard !== "number" || !Number.isFinite(standard)) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  // Not a discount. Includes the equal case on purpose.
  if (standard <= price) return null;

  const savingMonthlyCents = standard - price;
  const percentOff = Math.round((savingMonthlyCents / standard) * 100);
  // A rounding artefact at either end would read as "0% off" or "100% off".
  if (percentOff < 1 || percentOff > 99) return null;

  return {
    priceMonthlyCents: price,
    standardPriceMonthlyCents: standard,
    savingMonthlyCents,
    percentOff,
  };
}

/**
 * Validate an operator-entered standard rate before it is stored. Returns
 * the value to persist, or throws with the sentence the operator reads.
 *
 * Separate from {@link describeFoundingRate} because the two answer different
 * questions: this one refuses bad input at the boundary, that one refuses to
 * render an unsupported claim. A value that slipped past an older version of
 * this check still cannot produce a false strikethrough.
 */
export function parseStandardPriceInput(
  raw: unknown,
  priceMonthlyCents: number,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("The standard rate must be a whole number of cents above zero.");
  }
  if (n <= priceMonthlyCents) {
    throw new Error(
      "The standard rate has to be higher than the price you charge — otherwise it isn't a discount.",
    );
  }
  return n;
}
