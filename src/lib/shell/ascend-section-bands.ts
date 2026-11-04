/**
 * The band vocabulary and ordering rule for an Ascend lifecycle section
 * page. Pure, and in lib/shell beside the other shell decision functions,
 * so it can be unit-tested directly rather than inferred from a rendered
 * page (the same reason decideShellMode and buildShellNavigation live
 * here).
 *
 * The order comes from the North Star's Priority 2 remedy, verbatim:
 * context, insights, recent activity, quick actions, recommendations,
 * progress, "then the execution tools", because "execution should support
 * the experience; it should not become the experience."
 *
 * Nothing enforced that. Home had been composed this way by hand and reads
 * well; every other section improvised, and /agents became fourteen lines
 * wrapping a Flow page that opens straight into a channel grid.
 */

export const ASCEND_BAND_ORDER = [
  /** Where the customer stands, and what this section is for. */
  "context",
  /** The numbers. Scannable, not five cards competing for the lead. */
  "insights",
  /** What has happened here recently. Recent projects, recent drafts. */
  "activity",
  /** The few things someone comes to this section to start. */
  "actions",
  /** What to do next, and what needs attention. */
  "recommendations",
  /** Work already underway, and how far along it is. */
  "progress",
  /** The tools. Last, always, on every section. */
  "execution",
] as const;

export type AscendBandRole = (typeof ASCEND_BAND_ORDER)[number];

/**
 * Canonical order, stable within a role so two bands sharing one role keep
 * the sequence they were declared in.
 *
 * This SORTS rather than validating, deliberately. A page that lists its
 * execution band first still renders it last, which makes the one mistake
 * this module exists to prevent -- reaching for the tool first --
 * unrepresentable instead of merely reviewable. Whether a section declares
 * the right bands at all is a separate question, and the one the
 * accompanying verifier answers.
 */
export function orderAscendBands<T extends { role: AscendBandRole }>(bands: T[]): T[] {
  return bands
    .map((band, index) => ({ band, index }))
    .sort((a, b) => {
      const rank = ASCEND_BAND_ORDER.indexOf(a.band.role) - ASCEND_BAND_ORDER.indexOf(b.band.role);
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map((entry) => entry.band);
}
