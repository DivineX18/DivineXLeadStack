import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BusinessFooterConfig } from "@/types/funnels";

/**
 * Business Reality Engine (slice B) — resolve the workspace's REAL identity
 * for the funnel identity layer. Sources, in priority order, all verified
 * workspace data: the AI-agent profile's businessName, the sub-account's
 * accountContact (email/phone), and the sub-account name as the last-resort
 * business name. Returns only fields that actually exist — the identity
 * layer's honesty contract is "real or absent," never filled.
 */
export async function resolveWorkspaceIdentity(
  subAccountId: string,
): Promise<BusinessFooterConfig> {
  const db = getAdminDb();
  const [subSnap, profileSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.doc(`subAccounts/${subAccountId}/aiAgent/profile`).get(),
  ]);
  const sub = subSnap.exists ? subSnap.data()! : {};
  const profile = profileSnap.exists ? profileSnap.data()! : {};
  const contact = (sub.accountContact ?? {}) as { name?: string | null; email?: string | null; phone?: string | null };

  const out: BusinessFooterConfig = {};
  const businessName =
    (typeof profile.businessName === "string" && profile.businessName.trim()) ||
    (typeof sub.name === "string" && sub.name.trim()) ||
    "";
  if (businessName) out.businessName = businessName;
  if (typeof contact.email === "string" && contact.email) out.email = contact.email;
  if (typeof contact.phone === "string" && contact.phone) out.phone = contact.phone;
  return out;
}
