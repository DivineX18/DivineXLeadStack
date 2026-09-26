/**
 * Bounds the public availability query. `from` / `to` came straight from the query
 * string into a Firestore range query, so one anonymous call could read every event a
 * tenant has ever stored. The window is now clamped to a sane span.
 */
export const MAX_AVAILABILITY_WINDOW_DAYS = 62;
const DAY_MS = 24 * 60 * 60_000;

export function clampAvailabilityWindow(input: {
  now: Date;
  from?: Date;
  to?: Date;
  visibleDays: number;
}): { from: Date; to: Date } {
  const earliest = new Date(input.now.getTime() - DAY_MS);
  let from = input.from ?? input.now;
  if (from < earliest) from = earliest;
  const wanted = input.to ?? new Date(input.now.getTime() + input.visibleDays * DAY_MS);
  const latest = new Date(from.getTime() + MAX_AVAILABILITY_WINDOW_DAYS * DAY_MS);
  return { from, to: wanted > latest ? latest : wanted };
}
