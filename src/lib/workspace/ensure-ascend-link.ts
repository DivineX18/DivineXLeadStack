import "server-only";

import { ascend, ascendConfigured } from "@/lib/divinex/ascend-client";
import {
  attachPrimaryBusinessProfile,
  createMappingIdempotent,
  getMappingBySubAccountId,
} from "@/lib/workspace/workspace-mappings-service";

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

  // Already linked? Then there is nothing to do, and asking Ascend again would
  // risk a second profile for the same workspace.
  const existing = await getMappingBySubAccountId(params.subAccountId).catch(() => null);
  if (existing?.primaryAscendBusinessProfileId) {
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

  // Ascend's /divinex/resolve writes its OWN mapping row. Flow keeps its own,
  // which is what every Flow-side read goes through, so both sides have to be
  // told. They are separate records by design: each system owns its own
  // linkage authority rather than reading across the boundary at request time.
  if (existing) {
    const attached = await attachPrimaryBusinessProfile(
      existing.workspaceId,
      businessProfileId,
      params.actingAsUid,
    );
    if (!attached.ok) return { linked: false, reason: attached.reason };
    return { linked: true, businessProfileId, created: !!resolved.data.created, alreadyLinked: false };
  }

  const mapping = await createMappingIdempotent({
    flowSubAccountId: params.subAccountId,
    agencyId: params.agencyId,
    ownerFirebaseUid: params.ownerFirebaseUid,
    primaryAscendBusinessProfileId: businessProfileId,
    actingAsUid: params.actingAsUid,
  });
  if (!mapping.ok) return { linked: false, reason: mapping.reason };

  return { linked: true, businessProfileId, created: !!resolved.data.created, alreadyLinked: false };
}
