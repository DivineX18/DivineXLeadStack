import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { EmailEventDoc } from "@/types/email-events";

/**
 * Client read for the sent-email log.
 *
 * A direct Firestore listener rather than an API route: `emailEvents` rows are
 * member-readable under the rules, so there is nothing an API layer would add
 * except latency and a second place for the tenancy filter to be written
 * wrongly. Writes stay server-only.
 *
 * Deliberately filters by subAccountId and a sent-after bound only, and does
 * the sender/source narrowing in memory. Every extra `where` needs its own
 * composite index, and an operator flipping filters should not be able to hit
 * a FAILED_PRECONDITION the first time a new combination is tried.
 */
export function subscribeToEmailEvents(
  input: {
    subAccountId: string;
    /** How far back to read. */
    sinceDays: number;
    /** Safety valve: a busy workspace should not stream 50k docs to a table. */
    max?: number;
  },
  onChange: (rows: EmailEventDoc[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const since = new Date();
  since.setDate(since.getDate() - input.sinceDays);

  return onSnapshot(
    query(
      collection(getFirebaseDb(), "emailEvents"),
      where("subAccountId", "==", input.subAccountId),
      where("sentAt", ">=", Timestamp.fromDate(since)),
      orderBy("sentAt", "desc"),
      fsLimit(input.max ?? 1000),
    ),
    (snap) => {
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EmailEventDoc),
      );
    },
    (err) => onError?.(err),
  );
}
