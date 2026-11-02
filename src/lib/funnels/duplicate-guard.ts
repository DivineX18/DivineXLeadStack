import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { FunnelDoc } from "@/types/funnels";

/**
 * Did this workspace just make a funnel of this name?
 *
 * WHY. `create_funnel` builds a funnel, its capture form AND its follow-up
 * workflow in one call, and had no idempotency of any kind. When Zeno asks a
 * clarifying question before building and the customer answers, the capability
 * is emitted a second time and a second complete set appears under identical
 * names. QA hit exactly that and could not publish: two identically-named
 * workflows existed, the live one was whichever had been activated, and the
 * other sat hidden behind it. The system prompt deliberately routes a
 * genuinely missing business fact to a clarifying question, so this path is
 * designed for rather than rare.
 *
 * TIME-BOUNDED, NOT ABSOLUTE. Two funnels sharing a name is a legitimate thing
 * to want eventually, and refusing forever would be worse than the bug: an
 * operator who wants a second "Spring Promo" next quarter must not be told it
 * already exists. What is never legitimate is two of them seconds apart out of
 * one conversation.
 *
 * Its own module rather than another export on funnels-service so this ships
 * without entangling a parallel change in that file.
 */
export const DUPLICATE_FUNNEL_WINDOW_MS = 30 * 60 * 1000;

/** Firestore Timestamp | Date | millis | ISO -> millis. Returns 0 when it
 *  cannot tell, so an unreadable createdAt reads as ancient and therefore
 *  NOT a duplicate: a guard that cannot date a funnel must not block one. */
function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; toDate?: () => Date; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t._seconds === "number") return t._seconds * 1000;
  return 0;
}

export async function findRecentFunnelByName(
  subAccountId: string,
  name: string,
  now: number = Date.now(),
): Promise<FunnelDoc | null> {
  const wanted = name.trim().toLowerCase();
  // An empty name must match nothing rather than everything.
  if (!wanted) return null;

  // Equality-only, so no composite index is needed to deploy this. The time
  // filter runs in memory for the same reason.
  const snap = await getAdminDb()
    .collection("funnels")
    .where("subAccountId", "==", subAccountId)
    .get();

  const matches = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelDoc, "id">) }))
    // The model regenerates the name from the same brief, so a re-emission
    // differs by capitalisation or spacing at most.
    .filter((f) => (f.name ?? "").trim().toLowerCase() === wanted)
    .filter((f) => now - toMillis(f.createdAt) < DUPLICATE_FUNNEL_WINDOW_MS);

  if (!matches.length) return null;
  // Newest first, so the message names the one they are most likely looking at.
  return matches.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))[0]!;
}
