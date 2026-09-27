import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * NAMING A PERSON THE WAY A PERSON DOES.
 *
 * "Send Sarah the follow-up" has to find Sarah. The member editor learned
 * this the hard way: it took a uid, and a uid exists only inside a tool
 * result, so a turn later nothing resolved. Getting it wrong here is worse
 * than a role change, because the result is an email to the wrong person
 * and it cannot be recalled.
 *
 * So the same tiered rule, and the same refusal to guess. Exact email,
 * then exact name, then a looser contains, each tier tried on its own so a
 * precise match is never made ambiguous by a loose one. Two matches are
 * never resolved by picking the first: a question costs a moment, the
 * wrong recipient costs trust.
 *
 * TENANCY: only this workspace's contacts are ever read, so a name, email
 * or id belonging to anywhere else matches nothing and is reported exactly
 * as a contact that does not exist.
 */

export interface ContactCandidate {
  contactId: string;
  name: string;
  email: string | null;
}

export type ContactLookup =
  | { found: "one"; contactId: string; name: string; email: string | null }
  | { found: "many"; candidates: ContactCandidate[] }
  | { found: "none" };

/** The matching rule alone, so it can be tested without Firestore. */
export function matchContacts(rows: ContactCandidate[], needle: string): ContactLookup {
  const lower = typeof needle === "string" ? needle.trim().toLowerCase() : "";
  if (!lower) return { found: "none" };
  const one = (m: ContactCandidate[]): ContactLookup | null => {
    if (m.length === 1) return { found: "one", contactId: m[0].contactId, name: m[0].name, email: m[0].email };
    if (m.length > 1) return { found: "many", candidates: m.slice(0, 10) };
    return null;
  };
  return (
    one(rows.filter((r) => (r.email ?? "").toLowerCase() === lower)) ??
    one(rows.filter((r) => r.name.toLowerCase() === lower)) ??
    one(rows.filter((r) => r.name.toLowerCase().includes(lower) || (r.email ?? "").toLowerCase().includes(lower))) ?? {
      found: "none",
    }
  );
}

export async function resolveWorkspaceContact(
  subAccountId: string,
  needle: string,
): Promise<ContactLookup> {
  const wanted = typeof needle === "string" ? needle.trim() : "";
  if (!wanted) return { found: "none" };
  const db = getAdminDb();

  // A real contact id stays the unambiguous fast path, still proven to
  // belong here rather than trusted.
  if (/^[A-Za-z0-9_-]{15,40}$/.test(wanted)) {
    const direct = await db.doc(`contacts/${wanted}`).get().catch(() => null);
    if (direct?.exists && direct.data()!.subAccountId === subAccountId) {
      const d = direct.data()!;
      return { found: "one", contactId: direct.id, name: String(d.name ?? "this contact"), email: (d.email as string) ?? null };
    }
  }

  const snap = await db.collection("contacts").where("subAccountId", "==", subAccountId).limit(2000).get();
  const rows: ContactCandidate[] = snap.docs.map((d) => ({
    contactId: d.id,
    name: String(d.data().name ?? ""),
    email: (d.data().email as string) ?? null,
  }));
  return matchContacts(rows, wanted);
}
