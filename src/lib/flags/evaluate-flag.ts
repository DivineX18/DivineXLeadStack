import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { FeatureFlagDoc, FeatureFlagId } from "@/types/feature-flags";

interface FlagEvalContext {
  uid: string;
  workspaceId?: string;
  /** Flow has no separate "platform staff" role today (Phase 1 blueprint,
   *  §2.7 — internal operator consoles were deferred as Ascend-specific).
   *  For this deployment, the agency owner IS the practical top of the
   *  admin hierarchy, so it's reused as the "internal_admin" bar rather
   *  than inventing a new platform-role system as a prerequisite. */
  isAgencyOwner: boolean;
}

const STAGE_RANK: Record<FeatureFlagDoc["rolloutStage"], number> = {
  off: 0,
  internal_admin: 1,
  internal_qa: 2,
  single_workspace: 3,
  beta: 4,
  ga: 5,
};

/**
 * Server-only flag evaluation. Never trust a client-supplied flag state —
 * this always reads Firestore fresh (no long-lived client cache of the
 * allow/deny decision itself, only of the flag doc's raw content upstream
 * if a caller chooses to add that later).
 */
export async function isFeatureFlagEnabled(
  flagId: FeatureFlagId,
  ctx: FlagEvalContext,
): Promise<boolean> {
  const snap = await getAdminDb().doc(`featureFlags/${flagId}`).get();
  if (!snap.exists) return false; // undefined flag = off, fail closed
  const flag = snap.data() as FeatureFlagDoc;

  if (flag.rolloutStage === "off") return false;
  if (flag.rolloutStage === "ga") return true;

  // Agency owner always passes internal_admin and everything above it.
  if (ctx.isAgencyOwner && STAGE_RANK[flag.rolloutStage] >= STAGE_RANK.internal_admin) {
    return true;
  }

  if (flag.rolloutStage === "internal_admin") return false; // owner-only, already checked above

  if (flag.rolloutStage === "internal_qa") {
    return flag.allowedUids.includes(ctx.uid);
  }

  if (flag.rolloutStage === "single_workspace" || flag.rolloutStage === "beta") {
    const workspaceAllowed =
      !!ctx.workspaceId && flag.allowedWorkspaceIds.includes(ctx.workspaceId);
    const uidAllowed = flag.rolloutStage === "beta" && flag.allowedUids.includes(ctx.uid);
    return workspaceAllowed || uidAllowed;
  }

  return false;
}
