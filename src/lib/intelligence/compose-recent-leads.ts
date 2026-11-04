import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { Contact } from "@/types/contacts";
import type { WithMeta } from "@/types/intelligence";

/**
 * The newest leads in a workspace, for the Leads section's activity band.
 *
 * WHY THIS IS NEW CODE. /leads described itself as "who to talk to next"
 * and then showed four counters and a navigation grid, so the one question
 * its own heading promised to answer needed a click to reach. The North
 * Star's Priority 2 asks for a recent-activity band on every lifecycle
 * section; on this one, the recent activity IS the leads.
 *
 * The contacts list this mirrors reads client-side through onSnapshot
 * helpers in lib/firestore, which a Server Component cannot reuse, so this
 * reads the same collection by the same field names (types/contacts.ts).
 * It is deliberately a SEPARATE, small composer rather than an extension of
 * composeBusinessHealthSummary: that summary is shared by Home, Leads and
 * Performance, and adding a row payload to it would make two other pages
 * pay for a read they do not render.
 *
 * TWO READ PATHS, and the reason is measured rather than assumed. The
 * natural query -- equality on subAccountId, orderBy createdAt desc,
 * limit 6 -- needs a contacts(subAccountId ASC, createdAt DESC) composite
 * index. I expected the existing ascending index to serve it by reverse
 * scan; against the real project it returns FAILED_PRECONDITION, so the
 * band rendered nothing on every workspace while the sentence above it
 * said "the newest leads are below". The index is now declared, but a
 * freshly pulled deployment has not deployed it yet, and this repo has
 * form here: the booking-availability endpoint shipped the same trap.
 *
 * So the ordered read is tried first (exact and cheap once the index
 * exists) and falls back to the range read composeBusinessHealthSummary
 * already proves works on the ascending index, sorted in memory. The
 * fallback is bounded by a one-year window rather than reading the whole
 * collection. `readPath` records which one ran, so this is inspectable
 * instead of a silent difference in behaviour between deployments.
 */

export interface RecentLead {
  id: string;
  name: string;
  /** The best contact detail we hold. Null when we hold none. */
  detail: string | null;
  source: string | null;
  stage: string | null;
  at: number | null;
  href: string;
}

export interface RecentLeadsSummary {
  recent: RecentLead[];
  /** Which query served this. Diagnostic; never shown to a customer. */
  readPath: "indexed" | "range_scan";
}

function toMillis(value: unknown): number | null {
  const t = value as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

export async function composeRecentLeads(
  workspaceId: string,
  limit = 6,
): Promise<WithMeta<RecentLeadsSummary>> {
  try {
    const col = getAdminDb().collection("contacts").where("subAccountId", "==", workspaceId);

    let docs: { id: string; data: () => unknown }[] = [];
    let readPath: RecentLeadsSummary["readPath"] = "indexed";

    const ordered = await col.orderBy("createdAt", "desc").limit(limit).get().catch(() => null);
    if (ordered) {
      docs = ordered.docs;
    } else {
      readPath = "range_scan";
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const ranged = await col.where("createdAt", ">=", yearAgo).get().catch(() => null);
      if (!ranged) {
        return {
          meta: { status: "unavailable", fetchedAt: null, reasonCode: "firestore_read_failed" },
          data: null,
        };
      }
      docs = [...ranged.docs].sort((a, b) => {
        const am = toMillis((a.data() as { createdAt?: unknown }).createdAt) ?? 0;
        const bm = toMillis((b.data() as { createdAt?: unknown }).createdAt) ?? 0;
        return bm - am;
      });
    }

    const recent: RecentLead[] = docs.slice(0, limit).map((doc) => {
      const c = doc.data() as Partial<Contact>;
      const email = typeof c.email === "string" ? c.email.trim() : "";
      const phone = typeof c.phone === "string" ? c.phone.trim() : "";
      const company = typeof c.company === "string" ? c.company.trim() : "";
      return {
        id: doc.id,
        // A contact with no name is normal: a phone-first SMS or WhatsApp
        // lead arrives as a number. Show what we have rather than inventing
        // a placeholder name.
        name: (typeof c.name === "string" && c.name.trim()) || email || phone || "Unnamed lead",
        detail: company || email || phone || null,
        source: typeof c.source === "string" ? c.source : null,
        stage: typeof c.pipelineStage === "string" ? c.pipelineStage : null,
        at: toMillis(c.createdAt),
        href: `/leads/contacts/${doc.id}`,
      };
    });

    return {
      meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null },
      data: { recent, readPath },
    };
  } catch {
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "firestore_read_failed" }, data: null };
  }
}
