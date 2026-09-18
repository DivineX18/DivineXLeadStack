import "server-only";

import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";

/**
 * AN ID IS AN IDENTIFIER. IT IS NOT AUTHORIZATION.
 *
 * `/api/app/onboarding` proved a workspace member, then performed getProfile,
 * patchProfile, discover, reviewAssets and publish against whatever
 * `businessProfileId` the CLIENT put in the request body. Membership in your
 * own workspace therefore granted read and write access to any business
 * profile in the platform, and the ids are small sequential integers. Ascend's
 * side authenticates the shared secret and checks nothing about the
 * workspace/profile relationship, so nothing downstream caught it either.
 *
 * This module is the boundary that was missing. It answers exactly one
 * question, from Flow's canonical mapping and nothing else:
 *
 *     does THIS workspace own THIS business profile?
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No business-name comparison, no domain
 * matching, no "a profile this user happens to own", no assuming a lower id is
 * older or safer. We established earlier in this investigation that inference
 * is not ownership: the contaminated profile's name, website and every asset
 * domain agreed with each other perfectly and were all somebody else's. The
 * only thing that can answer an ownership question is a record in which
 * somebody asserted the ownership.
 *
 * FAILS CLOSED. No mapping, an archived mapping, or a mapping with no profile
 * means no profile is authorized — not "allow and hope". A workspace that has
 * genuinely never onboarded has no Ascend profile to reach, which is the
 * correct answer rather than a degraded one.
 *
 * This is Flow's half only. Ascend must enforce the same boundary
 * independently; a compromised or buggy Flow caller is still a way across
 * until it does. See the release notes for what remains open there.
 */

export type ProfileDenialReason =
  | "no_mapping"
  | "mapping_inactive"
  | "mapping_has_no_profile"
  | "profile_not_owned_by_workspace";

export type ProfileAuthorization =
  | { authorized: true; businessProfileId: number }
  | { authorized: false; reason: ProfileDenialReason; message: string };

const DENIAL_MESSAGE: Record<ProfileDenialReason, string> = {
  no_mapping: "This workspace is not linked to a business profile yet.",
  mapping_inactive: "This workspace's business-profile link is not active.",
  mapping_has_no_profile: "This workspace is not linked to a business profile yet.",
  profile_not_owned_by_workspace: "That business profile does not belong to this workspace.",
};

/**
 * The stored mapping holds this field as a NUMBER in production while the type
 * declares `string | null`, so both shapes are live. Comparing them with `===`
 * would silently deny every authorized caller — a fail-closed bug is still a
 * bug. Normalised through Number() rather than by loosening the comparison,
 * so "3" and 3 match and "" / null / "abc" match nothing.
 */
export function normalizeProfileId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/** True only when both sides name the same real profile. */
export function sameProfileId(a: unknown, b: unknown): boolean {
  const x = normalizeProfileId(a);
  const y = normalizeProfileId(b);
  return x !== null && y !== null && x === y;
}

/**
 * WHICH business profile, if any, this workspace is canonically entitled to.
 * The single Flow-side answer; every surface that needs a profile id should
 * come through here rather than deriving one.
 */
export async function resolveAuthorizedBusinessProfileId(
  workspaceId: string,
): Promise<ProfileAuthorization> {
  if (!workspaceId) return deny("no_mapping");
  let mapping: Awaited<ReturnType<typeof getMappingBySubAccountId>>;
  try {
    mapping = await getMappingBySubAccountId(workspaceId);
  } catch {
    // An unreadable mapping is not a permitted one.
    return deny("no_mapping");
  }
  if (!mapping) return deny("no_mapping");
  if (mapping.status !== "active") return deny("mapping_inactive");
  const primary = normalizeProfileId(mapping.primaryAscendBusinessProfileId);
  if (primary === null) return deny("mapping_has_no_profile");
  return { authorized: true, businessProfileId: primary };
}

/**
 * Is `candidateProfileId` one this workspace may act on?
 *
 * Secondary linked profiles count: a workspace legitimately mapped to several
 * profiles owns all of them. Anything else does not, whatever the caller says.
 */
export async function assertAuthorizedBusinessProfile(
  workspaceId: string,
  candidateProfileId: unknown,
): Promise<ProfileAuthorization> {
  const candidate = normalizeProfileId(candidateProfileId);
  if (candidate === null) return deny("profile_not_owned_by_workspace");

  const primary = await resolveAuthorizedBusinessProfileId(workspaceId);
  if (!primary.authorized) return primary;
  if (primary.businessProfileId === candidate) return primary;

  try {
    const mapping = await getMappingBySubAccountId(workspaceId);
    const secondaries = (mapping?.linkedSecondaryAscendBusinessProfileIds ?? []).map(normalizeProfileId);
    if (secondaries.includes(candidate)) return { authorized: true, businessProfileId: candidate };
  } catch {
    // fall through to denial
  }
  return deny("profile_not_owned_by_workspace");
}

function deny(reason: ProfileDenialReason): ProfileAuthorization {
  return { authorized: false, reason, message: DENIAL_MESSAGE[reason] };
}
