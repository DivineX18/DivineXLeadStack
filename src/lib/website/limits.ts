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
  /**
   * The plan's ceiling, used only when this workspace carries no explicit
   * override. `null`/omitted keeps the historical default, so callers that
   * don't know about plans (and every plan created before limits existed)
   * behave exactly as before.
   */
  planMaxWebsites?: number | null,
): number {
  const override = data?.websiteMaxSites;
  if (typeof override === "number" && Number.isFinite(override)) {
    if (override === UNLIMITED_WEBSITE_SITES) return Infinity;
    if (override > 0) return Math.floor(override);
  }
  if (typeof planMaxWebsites === "number" && Number.isFinite(planMaxWebsites)) {
    if (planMaxWebsites === UNLIMITED_WEBSITE_SITES) return Infinity;
    if (planMaxWebsites > 0) return Math.floor(planMaxWebsites);
  }
  return MAX_WEBSITES_PER_SUBACCOUNT;
}

/**
 * DOES THIS SITE CONSUME ONE OF THE CUSTOMER'S WEBSITE SLOTS?
 *
 * Only a site that actually published does. The cap exists to meter a
 * delivered product, and counting every DOCUMENT meant an empty draft nobody
 * built, and a build that failed inside the provider's pipeline, each
 * permanently spent a slot the customer never received anything for. A
 * workspace holding one blank "Website 1" and one failed build read as "2 of
 * 5 websites used" while owning zero websites.
 *
 * `liveUrl` is checked alongside the status deliberately: a site that
 * published and later had its status muddled by a re-poll still consumed the
 * resource, and must keep counting. That is also what stops delete-and-retry
 * being a way around the cap — the only way to stop consuming a slot is to
 * remove a site that really exists.
 */
export function consumesWebsiteSlot(
  site: { status?: string | null; liveUrl?: string | null } | null | undefined,
): boolean {
  if (!site) return false;
  return site.status === "ready" || Boolean(site.liveUrl);
}

/** How many of this workspace's sites actually count against the cap. */
export function countConsumedWebsiteSlots(
  sites: ReadonlyArray<{ status?: string | null; liveUrl?: string | null }>,
): number {
  return sites.reduce((n, s) => n + (consumesWebsiteSlot(s) ? 1 : 0), 0);
}

/**
 * Unbuilt drafts are free but not unlimited: without a ceiling, a workspace
 * with zero published sites could create documents forever. Headroom above
 * the real cap leaves room for retries and abandoned attempts without ever
 * touching the billable number, which stays exactly `effectiveWebsiteCap`.
 */
export const DRAFT_HEADROOM = 5;
