import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * The canonical DIVINEX internal workspace.
 *
 * Explicit because derivation, however sound, is a rule that can be
 * invalidated by data: the lowest-numbered sub-account is only the agency's
 * own while nobody ever creates one out of band or migrates an old record.
 * Naming it removes that whole class of surprise for the deployment that
 * matters, and the derivation below stays as the bootstrap path for a fresh
 * agency that has no configured id yet.
 *
 * Account #1000, "DivineX". Corroborated independently by the booking URL the
 * Ascend repo has hardcoded against this same workspace.
 */
const DIVINEX_HOME_WORKSPACE: Record<string, string> = {
  // agencyId -> its own operating workspace
  U5SBAHsB0nZ7ce552H9h: "MEYB8CbWlE5fxAn3TJOp",
};

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
  // The configured id wins, but only if the workspace really exists and
  // really belongs to this agency. A stale constant must fail over to the
  // derivation rather than send every new client contact into a workspace
  // that was deleted or moved.
  const configured = DIVINEX_HOME_WORKSPACE[agencyId];
  if (configured) {
    const snap = await getAdminDb().doc(`subAccounts/${configured}`).get();
    if (snap.exists && (snap.data() as { agencyId?: string }).agencyId === agencyId) {
      return configured;
    }
    console.warn(
      `[onboarding] configured home workspace ${configured} for agency ${agencyId} is ` +
        `missing or belongs elsewhere; falling back to the lowest account number.`,
    );
  }

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
