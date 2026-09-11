import "server-only";

import {
  attachPrimaryBusinessProfile,
  createMappingIdempotent,
  getMappingBySubAccountId,
} from "@/lib/workspace/workspace-mappings-service";

/**
 * PERSIST THE LINK ONBOARDING ALREADY RESOLVES.
 *
 * The Ascend intelligence layer reads exactly one thing to decide whether a
 * workspace has a business profile: `workspaceMappings.primaryAscendBusinessProfileId`
 * (resolve-intelligence-snapshot.ts). Onboarding already asks Ascend to
 * find-or-create that profile — `ascend.resolve()` returns its id, and Ascend's
 * own side records it — but the Flow side never wrote it down, so the id was
 * resolved and then dropped on the floor. The consequence was not cosmetic: with
 * the mapping absent, every intelligence resource resolves to
 * "no_linked_business_profile", Home's Growth Score and Recommended Next Step
 * render empty, and `/api/sub-accounts/[id]/growth-scan/run` 409s — a paying
 * Ascend customer could not run the one thing the product is sold on.
 *
 * `attachPrimaryBusinessProfile` was built for precisely this and had no caller.
 * This connects the two; it introduces no new store, no new shape, and no new
 * source of truth. Ascend remains canonical — this is the local index into it.
 *
 * DELIBERATELY NON-FATAL. Onboarding's job is to collect the customer's answers,
 * and a bookkeeping write must never be the reason that fails. Every path
 * returns a result instead of throwing, and the caller ignores it.
 *
 * NEVER RE-POINTS AN EXISTING LINK. If the workspace is already mapped to a
 * DIFFERENT profile, that is left exactly as it is: silently moving a workspace's
 * primary profile would repoint its whole intelligence history at another
 * business, and a stale link is a far smaller problem than a wrong one. Only the
 * genuinely-unlinked case is filled in. (`computeAttachPrimary` itself would
 * happily overwrite, which is why the guard lives here rather than there.)
 */
export type LinkProfileOutcome =
  | "already_linked"
  | "attached"
  | "mapping_created"
  | "left_alone_different_profile"
  | "failed";

export async function linkAscendBusinessProfile(params: {
  subAccountId: string;
  businessProfileId: string | number;
  actingAsUid: string;
  agencyId: string | null;
}): Promise<LinkProfileOutcome> {
  // The mapping stores profile ids as strings; Ascend's Postgres id is a serial
  // integer. Normalising here keeps every comparison below like-for-like.
  const profileId = String(params.businessProfileId).trim();
  if (!profileId) return "failed";

  try {
    const existing = await getMappingBySubAccountId(params.subAccountId);

    if (!existing) {
      const created = await createMappingIdempotent({
        flowSubAccountId: params.subAccountId,
        agencyId: params.agencyId,
        ownerFirebaseUid: params.actingAsUid,
        primaryAscendBusinessProfileId: profileId,
        actingAsUid: params.actingAsUid,
      });
      return created.ok ? "mapping_created" : "failed";
    }

    if (existing.primaryAscendBusinessProfileId === profileId) return "already_linked";
    if (existing.primaryAscendBusinessProfileId) return "left_alone_different_profile";

    const attached = await attachPrimaryBusinessProfile(existing.workspaceId, profileId, params.actingAsUid);
    return attached.ok ? "attached" : "failed";
  } catch {
    return "failed";
  }
}
