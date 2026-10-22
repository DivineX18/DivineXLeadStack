import "server-only";

import { ascend, ascendConfigured } from "@/lib/divinex/ascend-client";
import { getMappingBySubAccountId, updateMappingStatus } from "@/lib/workspace/workspace-mappings-service";
import { linkAscendBusinessProfile } from "@/lib/workspace/link-ascend-business-profile";

/**
 * Give a brand-new Flow workspace its Ascend identity.
 *
 * WHY THIS EXISTS. A workspace created through the agency route got no Ascend
 * mapping and therefore no business profile, so every Ascend surface had
 * nothing to resolve and errored. The Flow side looked fully provisioned,
 * down to a "Full Ascend" badge, while the Ascend side had never been
 * created. A real customer hit exactly that and spent hours concluding the
 * product was broken.
 *
 * Only the agency-created path was missing it. The Ascend-purchase path
 * already mints the mapping on its own side, because Ascend orchestrates that
 * one and knows the purchase happened.
 *
 * BEST EFFORT, ALWAYS. A workspace create must never fail because Ascend is
 * unreachable, mid-deploy, or not configured on this deployment. The workspace
 * is the thing the operator asked for and it is already written by the time
 * this runs; a missing link is recoverable later by the same call, while a
 * failed create is a worse outcome than an unlinked workspace. So this returns
 * a reason instead of throwing, and the caller logs it.
 *
 * IDEMPOTENT. Safe to call again on a workspace that already has a mapping:
 * it returns the existing profile rather than minting a second one. That
 * matters because a second profile for one workspace is the
 * many-profiles-to-one-workspace state the linkage rules forbid, and it is
 * not cheaply reversible.
 *
 * ACTIVATES, NOT JUST LINKS. `createMappingIdempotent` opens every mapping at
 * `pending_provision`, and `resolveAuthorizedBusinessProfileId` denies
 * anything that isn't `active` (lib/divinex/profile-authorization.ts) — the
 * same "a mapping nobody activates authorizes nothing" lesson already learned
 * once for the onboarding path (see link-ascend-business-profile.ts's own
 * header comment) and once for Ascend-purchase provisioning
 * (provision-ascend-operations.ts). This function used to write the mapping
 * directly via createMappingIdempotent/attachPrimaryBusinessProfile and never
 * activate it — a workspace created this way came out permanently
 * mapped-but-inactive, which is indistinguishable from unmapped to every
 * caller of resolveAuthorizedBusinessProfileId: linked on Flow's side,
 * authorized nowhere. Delegating the actual create/attach/activate to
 * linkAscendBusinessProfile (reused, not duplicated) closes that — it's the
 * SAME function the onboarding path uses to finish this exact job, and it
 * already owns "only pending_provision advances, suspended/archived are never
 * quietly undone."
 */
export type EnsureAscendLinkResult =
  | { linked: true; businessProfileId: string; created: boolean; alreadyLinked: boolean }
  | { linked: false; reason: string };

export async function ensureAscendWorkspaceLink(params: {
  subAccountId: string;
  agencyId: string;
  /** The workspace owner, who the mapping is recorded against. */
  ownerFirebaseUid: string;
  /** Who is performing this, for the mapping's audit trail. */
  actingAsUid: string;
  businessName: string;
  email?: string | null;
}): Promise<EnsureAscendLinkResult> {
  if (!ascendConfigured()) {
    // Not an error. A Flow-only deployment has no Ascend to link to, and
    // saying so plainly beats logging a failure every time a workspace is
    // created.
    return { linked: false, reason: "ascend_not_configured" };
  }

  // Already linked to a real profile? Then there's no need to call Ascend
  // again (asking ascend.resolve() again would risk a second profile for the
  // same workspace) — but a mapping created by an EARLIER, pre-activation
  // version of this function (or any other path) may still be sitting at
  // pending_provision, which authorizes nothing. Finish that job inline,
  // without a network round trip to Ascend, before returning.
  const existing = await getMappingBySubAccountId(params.subAccountId).catch(() => null);
  if (existing?.primaryAscendBusinessProfileId) {
    if (existing.status === "pending_provision") {
      await updateMappingStatus(existing.workspaceId, "active", params.actingAsUid).catch(() => {});
    }
    return {
      linked: true,
      businessProfileId: existing.primaryAscendBusinessProfileId,
      created: false,
      alreadyLinked: true,
    };
  }

  // Ascend owns profile identity, so it decides whether this is a new profile
  // or an existing one being adopted. Flow does not guess.
  const resolved = await ascend.resolve({
    flowSubAccountId: params.subAccountId,
    businessName: params.businessName,
    ...(params.email ? { email: params.email } : {}),
  });
  if (!resolved.ok || !resolved.data?.ok || !resolved.data.businessProfileId) {
    const reason =
      (!resolved.ok ? resolved.error : resolved.data?.error) ?? "ascend_resolve_failed";
    return { linked: false, reason };
  }
  const businessProfileId = String(resolved.data.businessProfileId);

  const outcome = await linkAscendBusinessProfile({
    subAccountId: params.subAccountId,
    businessProfileId,
    actingAsUid: params.actingAsUid,
    agencyId: params.agencyId,
  });

  if (outcome === "failed") return { linked: false, reason: "link_failed" };

  if (outcome === "left_alone_different_profile") {
    // Race: something else linked a different profile between our read above
    // and now (e.g. onboarding ran concurrently). Report what's actually
    // there rather than claiming failure -- the workspace IS linked, just not
    // to the id we just resolved.
    const nowExisting = await getMappingBySubAccountId(params.subAccountId).catch(() => null);
    return nowExisting?.primaryAscendBusinessProfileId
      ? { linked: true, businessProfileId: nowExisting.primaryAscendBusinessProfileId, created: false, alreadyLinked: true }
      : { linked: false, reason: "left_alone_different_profile" };
  }

  return {
    linked: true,
    businessProfileId,
    created: !!resolved.data.created,
    alreadyLinked: outcome === "already_linked",
  };
}
