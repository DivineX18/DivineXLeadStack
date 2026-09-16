/**
 * A FIXTURE MUST NOT INHERIT ANOTHER BUSINESS'S TRUTH.
 *
 * Certification once ran inside a real probe workspace belonging to an
 * apostille/document-legalisation company. That workspace has eleven APPROVED
 * brand assets, so the Image Director did exactly what it is supposed to do and
 * placed the customer's own photographs — scales of justice, legal documents,
 * someone signing paperwork — onto a DENTAL fixture. The product behaved
 * correctly. The certification was worthless, and worse than worthless: those
 * are good, real, professional photographs, so the page would have LOOKED
 * better and passed a visual review while proving nothing about generation.
 *
 * That is the dangerous shape of this mistake. A contaminated workspace does not
 * fail loudly; it quietly lends a fixture somebody else's photography, branding
 * and proof, and flatters the result. So the check runs BEFORE generation and
 * refuses to proceed, rather than being something a human has to remember.
 *
 * Usage (throws on contamination):
 *   await assertCleanCertificationWorkspace(subAccountId);
 */

export interface WorkspaceContamination {
  source: string;
  detail: string;
}

/**
 * Everything a fixture could inherit that did not come from its own brief.
 *
 * Deliberately broad: approved media is what bit us, but a logo, a brand colour,
 * a saved rating or a previous funnel would each let one fixture borrow another
 * business's credibility.
 */
export async function findWorkspaceContamination(subAccountId: string): Promise<WorkspaceContamination[]> {
  const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
  const db = getAdminDb();
  const found: WorkspaceContamination[] = [];

  const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    found.push({ source: "subAccount", detail: "the workspace does not exist" });
    return found;
  }
  const sa = saSnap.data() as Record<string, unknown>;
  if (typeof sa.logoUrl === "string" && sa.logoUrl.trim()) {
    found.push({ source: "branding", detail: `workspace carries a logo (${sa.logoUrl.slice(0, 60)})` });
  }

  // THE ONE THAT ACTUALLY HAPPENED: approved customer media outranks every
  // other visual source, so a single approved asset silently wins every beat.
  try {
    const { resolveProfileInputs } = await import("../src/lib/divinex/consume-profile.ts");
    const profile = await resolveProfileInputs(subAccountId);
    if (profile) {
      const n = profile.assets.visualCandidates.length;
      if (n > 0) found.push({ source: "businessProfile", detail: `${n} approved visual candidates would outrank generated media` });
      if (profile.identity.businessName) {
        found.push({ source: "businessProfile", detail: `identity resolves to "${profile.identity.businessName}"` });
      }
      if (profile.assets.evidenceLogos.length > 0) {
        found.push({ source: "businessProfile", detail: `${profile.assets.evidenceLogos.length} evidence logos would appear as proof` });
      }
    }
  } catch {
    // No profile resolver available or no snapshot — that is the clean state.
  }

  // Pre-existing funnels are not contamination on their own, but they mean the
  // workspace is in use, and a fixture should never share one with real work.
  const funnels = await db.collection("funnels").where("subAccountId", "==", subAccountId).limit(1).get();
  if (!funnels.empty) {
    found.push({ source: "funnels", detail: "workspace already contains funnels; certification needs a dedicated one" });
  }

  return found;
}

/** Refuse to certify inside a workspace that would lend a fixture anything. */
export async function assertCleanCertificationWorkspace(subAccountId: string): Promise<void> {
  const found = await findWorkspaceContamination(subAccountId);
  if (found.length === 0) return;
  const lines = found.map((f) => `  - [${f.source}] ${f.detail}`).join("\n");
  throw new Error(
    `CERTIFICATION PREFLIGHT FAILED for subAccount "${subAccountId}".\n` +
      `A fixture generated here would inherit another business's assets, and the page would look\n` +
      `better than the generator earned. Use a dedicated, profile-free workspace.\n${lines}`,
  );
}
