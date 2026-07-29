/**
 * Per-sub-account cap on the number of website builds. The website doc lives
 * at `subAccounts/{id}/website/{siteId}` — a sub-account can hold up to this
 * many at once by default. Enforced server-side in the create-site route
 * (`POST /api/sub-accounts/[id]/website`) and mirrored in the UI's "Add
 * website" affordance. Bump this single constant to change the shared
 * default — but prefer {@link effectiveWebsiteCap} for a per-sub-account
 * override via `SubAccountDoc.websiteMaxSites`.
 */
export const MAX_WEBSITES_PER_SUBACCOUNT = 5;

/** Sentinel stored in `websiteMaxSites` meaning "no cap for this sub-account". */
export const UNLIMITED_WEBSITE_SITES = -1;

/**
 * Resolves the effective site cap for a sub-account: its own
 * `websiteMaxSites` override if set (a positive integer, or
 * {@link UNLIMITED_WEBSITE_SITES} for unlimited), otherwise the shared
 * {@link MAX_WEBSITES_PER_SUBACCOUNT} default. No `server-only` guard here
 * (unlike websites-service.ts) so the client "Add website" affordance can
 * compute the same effective cap the server enforces, instead of hardcoding
 * the shared default and drifting once a sub-account has an override.
 */
export function effectiveWebsiteCap(
  data: { websiteMaxSites?: number | null } | null | undefined,
): number {
  const override = data?.websiteMaxSites;
  if (typeof override === "number" && Number.isFinite(override)) {
    if (override === UNLIMITED_WEBSITE_SITES) return Infinity;
    if (override > 0) return Math.floor(override);
  }
  return MAX_WEBSITES_PER_SUBACCOUNT;
}
