"use client";

/**
 * WHEN ZENO CHANGES WHAT YOU HAVE OPEN.
 *
 * Almost every screen in this app already reflects a change the moment it
 * lands: they subscribe to Firestore through lib/firestore/*, so a write by
 * Zeno arrives the same way a write by a teammate does. Those screens need
 * nothing from this file, and adding a refetch to them would only make the
 * same change arrive twice.
 *
 * This exists for the screens that hold a local copy and save it back
 * wholesale. There, a change Zeno makes is not merely invisible: the next
 * Save sends the stale copy and silently undoes it. That is the real
 * hazard, and it is the reverse of losing the customer's unsaved work,
 * which must not happen either.
 *
 * So the signal here says only "this resource changed", and the screen
 * decides. It never carries a replacement object: the model does not get to
 * hand a screen its new state, and a screen that reloads does so from
 * storage, which is the only thing that knows what is actually there.
 *
 * ONLY A COMMITTED RECEIPT. The publisher is the confirm response, after
 * the server minted one, which happens only once execution returned. Model
 * prose, a proposal, a refusal, a cancellation and a failure all produce no
 * receipt and therefore nothing here.
 */

export interface ResourceChange {
  resourceType: string;
  resourceId: string;
  operation: string;
  changedFields?: string[];
}

type Listener = (change: ResourceChange) => void;

const listeners = new Set<Listener>();

/**
 * Announce a committed change. Takes the receipt rather than a hand-made
 * object so a caller cannot announce something the server did not confirm:
 * a value without `status: "committed"` is ignored.
 */
export function publishCommittedChange(receipt: unknown): void {
  if (!receipt || typeof receipt !== "object") return;
  const r = receipt as Record<string, unknown>;
  // The server stamps this, and only after execute() returned. Anything
  // else, including a well-formed descriptor the model produced, is not a
  // statement that something happened.
  if (r.status !== "committed") return;
  if (typeof r.resourceType !== "string" || typeof r.resourceId !== "string") return;
  const change: ResourceChange = {
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    operation: typeof r.operation === "string" ? r.operation : "updated",
    ...(Array.isArray(r.changedFields)
      ? { changedFields: r.changedFields.filter((f): f is string => typeof f === "string") }
      : {}),
  };
  for (const l of [...listeners]) {
    try {
      l(change);
    } catch {
      // One screen's handler must not stop another's.
    }
  }
}

/**
 * Listen for changes to ONE resource. Matching is on the structured id the
 * receipt carries, never on a parsed href: an href is for a human to click.
 */
export function onResourceChange(
  match: { resourceType: string; resourceId: string },
  handler: (change: ResourceChange) => void,
): () => void {
  const listener: Listener = (change) => {
    if (change.resourceType !== match.resourceType) return;
    if (change.resourceId !== match.resourceId) return;
    handler(change);
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: the listener set is module-level, so tests can assert it empties. */
export function activeListenerCount(): number {
  return listeners.size;
}
