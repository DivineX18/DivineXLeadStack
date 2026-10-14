import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * The subject of the most recent email on a contact's thread.
 *
 * Used to prefill the inbox composer's reply subject. A listener rather than a
 * one-shot read so that a reply arriving while the thread is open updates the
 * prefill — otherwise an operator who leaves a thread open all afternoon
 * replies against a stale subject.
 *
 * Errors resolve to undefined instead of throwing: a missing subject only
 * costs a less specific placeholder, and should never take the thread down.
 */
export function subscribeToLastEmailSubject(
  contactId: string,
  onChange: (subject: string | undefined) => void,
): () => void {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `contacts/${contactId}/emailMessages`),
      orderBy("createdAt", "desc"),
      limit(1),
    ),
    (snap) => {
      const raw = snap.docs[0]?.data()?.subject;
      const subject = typeof raw === "string" ? raw.trim() : "";
      // Strip any existing Re: so replies do not accumulate "Re: Re: Re:".
      onChange(subject ? subject.replace(/^(re:\s*)+/i, "") : undefined);
    },
    () => onChange(undefined),
  );
}
