import "server-only";

import { getDivinexProfileSnapshot, type DivinexProfileSnapshot } from "@/lib/divinex/contract";
import {
  resolveAuthorizedBusinessProfileId,
  sameProfileId,
  type ProfileDenialReason,
} from "@/lib/divinex/profile-authorization";

/**
 * THE ONE DOOR TO A WORKSPACE'S BUSINESS CONTEXT.
 *
 * Four customer-facing surfaces read `divinexProfiles/{workspaceId}` directly:
 * Zeno's chat context, the Brand & Assets page, the onboarding reveal and the
 * assistance page. Each trusted the stored snapshot simply because it was
 * stored under that workspace's id — and a snapshot arrives from a signed
 * Ascend webhook that picks its own destination, so "it is filed here" and "it
 * belongs here" are different claims.
 *
 * They are currently different for a real workspace. DivineX is canonically
 * mapped to business profile 3 and its stored snapshot is profile 27, which
 * describes a document-legalisation company. Today that means Zeno is told the
 * workspace IS that company: its name, website, audience, brand voice and
 * palette all go into the model's context, and the Brand page renders another
 * firm's logo and colours as "your brand".
 *
 * Patching those four surfaces one at a time would leave four rules where
 * there should be one. This is the single boundary they now share, and it runs
 * BEFORE any content is returned:
 *
 *     stored snapshot.businessProfileId === workspace's canonically mapped id
 *
 * TWO LAYERS, NOT ONE. This is tenant AUTHORIZATION — does this profile belong
 * to this workspace at all. It sits above the media provenance gate shipped
 * earlier, which asks the narrower question of whether an AUTHORIZED profile's
 * imagery is verified first-party. An unauthorized profile contributes nothing
 * whatsoever: no description, no audience, no offers, no voice, no palette, no
 * logo, no assets, and no profile identity for intelligence lookups. An
 * authorized profile with unverified media still contributes its context and
 * simply withholds photography. Conflating the two would either leak a
 * stranger's business or needlessly strip a customer's own.
 */

export type AuthorizedProfileResult =
  | { ok: true; snapshot: DivinexProfileSnapshot; businessProfileId: number }
  | { ok: false; reason: ProfileDenialReason | "no_snapshot" | "snapshot_profile_mismatch"; message: string };

/**
 * The workspace's snapshot, returned ONLY when the workspace is canonically
 * entitled to the profile it contains. Every failure mode is "unavailable",
 * never a substituted profile: a surface showing nothing is recoverable, and a
 * surface confidently showing the wrong company is not.
 */
export async function getAuthorizedProfileSnapshot(workspaceId: string): Promise<AuthorizedProfileResult> {
  const auth = await resolveAuthorizedBusinessProfileId(workspaceId);
  if (!auth.authorized) return { ok: false, reason: auth.reason, message: auth.message };

  const snapshot = await getDivinexProfileSnapshot(workspaceId);
  if (!snapshot) {
    return { ok: false, reason: "no_snapshot", message: "This workspace has no business profile snapshot yet." };
  }

  if (!sameProfileId(snapshot.businessProfileId, auth.businessProfileId)) {
    // Deliberately says WHICH two ids disagree, and nothing about the foreign
    // business — an operator needs to be able to act on this without the
    // message itself leaking the other tenant's identity.
    console.warn(
      `[authorized-profile] workspace=${workspaceId} is mapped to profile ${auth.businessProfileId} ` +
        `but the stored snapshot carries profile ${snapshot.businessProfileId}; withholding all context.`,
    );
    return {
      ok: false,
      reason: "snapshot_profile_mismatch",
      message: "This workspace's stored business profile does not match the one it is linked to.",
    };
  }

  return { ok: true, snapshot, businessProfileId: auth.businessProfileId };
}

/** Convenience for the many callers that only want the snapshot or nothing. */
export async function getAuthorizedProfileSnapshotOrNull(
  workspaceId: string,
): Promise<DivinexProfileSnapshot | null> {
  const r = await getAuthorizedProfileSnapshot(workspaceId);
  return r.ok ? r.snapshot : null;
}
