import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THE AGENCY'S OWN WORKSPACE.
 *
 * Onboarding creates a CRM contact before the client has a workspace of their
 * own, so it needs somewhere to put that contact: the agency's own operating
 * workspace, not the client's future one.
 *
 * DERIVED, NOT CONFIGURED. `appConfig/main` records `firstAgencyId` but never
 * recorded which sub-account the bootstrap created, so there is no stored
 * pointer to read. The rule that does hold is the account NUMBER: it is issued
 * by a monotonic counter at creation, so the agency's lowest-numbered
 * sub-account is the one the bootstrap made for itself, before any client
 * existed.
 *
 * Name is deliberately not used. This agency has two workspaces both called
 * "DivineX" (#1000 and #1001), so matching on a name would be a coin flip.
 * The number is unambiguous.
 *
 * `createdAt` breaks a tie only if two rows somehow share a number, which the
 * counter should prevent; it is there so this can never return undefined for
 * an arbitrary ordering reason.
 */
export async function resolveAgencyHomeWorkspaceId(
  agencyId: string,
): Promise<string | null> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("agencyId", "==", agencyId)
    .get();
  if (snap.empty) return null;

  const rows = snap.docs
    .map((d) => ({
      id: d.id,
      accountNumber: Number((d.data() as { accountNumber?: number }).accountNumber ?? Number.MAX_SAFE_INTEGER),
      createdAtMs:
        (d.data() as { createdAt?: { toMillis?: () => number } }).createdAt?.toMillis?.() ?? 0,
    }))
    .sort((a, b) => a.accountNumber - b.accountNumber || a.createdAtMs - b.createdAtMs);

  return rows[0]?.id ?? null;
}

/**
 * The workspace a new onboarding's CRM contact belongs in.
 *
 * The override exists for testing and for the future case where an agency
 * runs onboarding out of a workspace that is not its first. It is an explicit
 * argument, never an env var, so a mis-set environment cannot quietly send
 * every new client contact into the wrong workspace.
 */
export async function resolveCrmWorkspaceId(opts: {
  agencyId: string;
  override?: string | null;
}): Promise<string | null> {
  if (opts.override?.trim()) return opts.override.trim();
  return resolveAgencyHomeWorkspaceId(opts.agencyId);
}
