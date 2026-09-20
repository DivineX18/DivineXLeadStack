import "server-only";

import {
  attachPrimaryBusinessProfile,
  createMappingIdempotent,
  getMappingBySubAccountId,
  updateMappingStatus,
} from "@/lib/workspace/workspace-mappings-service";
import type { WorkspaceMappingStatus } from "@/types/workspace-mappings";

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
      if (!created.ok) return "failed";
      await activateFreshMapping(created.value.mapping.workspaceId, created.value.mapping.status);
      return "mapping_created";
    }

    if (existing.primaryAscendBusinessProfileId === profileId) {
      await activateFreshMapping(existing.workspaceId, existing.status);
      return "already_linked";
    }
    if (existing.primaryAscendBusinessProfileId) return "left_alone_different_profile";

    const attached = await attachPrimaryBusinessProfile(existing.workspaceId, profileId, params.actingAsUid);
    if (!attached.ok) return "failed";
    await activateFreshMapping(existing.workspaceId, existing.status);
    return "attached";
  } catch {
    return "failed";
  }
}

/**
 * A MAPPING NOBODY ACTIVATES AUTHORIZES NOTHING.
 *
 * `createMappingIdempotent` opens every mapping at `pending_provision`, and
 * until now the ONLY code anywhere that moved one to `active` was the SSO
 * callback. A workspace that reached Ascend through onboarding instead of
 * through an SSO handoff therefore ended up permanently mapped-but-inactive —
 * and `resolveAuthorizedBusinessProfileId` denies an inactive mapping, exactly
 * as it should.
 *
 * The consequence was total and silent. Every snapshot Ascend published for
 * that workspace was rejected `workspace_not_mapped:mapping_inactive`, so
 * `divinexProfiles/{workspaceId}` was never written: no brand library, no Zeno
 * business context, no intelligence, and landing-page generation with nothing
 * to ground itself in. Ascend's side looked healthy throughout, because the
 * refusal happens here.
 *
 * This is a regression from the cross-tenant hardening (ee86d96). Before it,
 * `applyProfileSnapshot` accepted any correctly-signed snapshot naming a real
 * sub-account and never consulted a mapping, so the onboarding path worked
 * despite never activating one. Adding the check was right; what was missed is
 * that onboarding had been relying on the absence of it.
 *
 * THE FIX IS IN PROVISIONING, NOT IN AUTHORIZATION. The status rule is correct
 * and is left exactly as it is — an inactive mapping must keep authorizing
 * nothing. What changes is that the path which legitimately creates a mapping
 * now finishes the job.
 *
 * The evidence is the same evidence the SSO bridge activates on: an
 * authenticated member of this workspace asked for it, and the profile id was
 * resolved server-side from the workspace alone (`ascend.resolve` is keyed on
 * flowSubAccountId, and an unmapped workspace gets a NEW profile), so no caller
 * can steer activation at a profile that is not theirs.
 *
 * ONLY `pending_provision` ADVANCES. `suspended` and `archived` are deliberate
 * operator actions, and onboarding must never quietly undo one — the same
 * guard, and the same reasoning, as the SSO callback.
 */
async function activateFreshMapping(workspaceId: string, status: WorkspaceMappingStatus): Promise<void> {
  if (status !== "pending_provision") return;
  try {
    await updateMappingStatus(workspaceId, "active", "system:onboarding");
  } catch {
    // Bookkeeping, like every other write on this path: onboarding's job is to
    // collect the customer's answers, and this must never be why that fails.
  }
}
