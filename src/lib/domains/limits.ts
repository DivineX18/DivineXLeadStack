/**
 * Per-sub-account cap on registered custom domains. Mirrors
 * `lib/website/limits.ts::effectiveWebsiteCap()` exactly — same override
 * mechanic, new field (`SubAccountDoc.maxCustomDomains`). Enforced
 * server-side in the add-domain route and mirrored in the Domains tab UI.
 */
export const MAX_CUSTOM_DOMAINS_PER_SUBACCOUNT = 3;

/** Sentinel stored in `maxCustomDomains` meaning "no cap for this sub-account". */
export const UNLIMITED_CUSTOM_DOMAINS = -1;

export function effectiveCustomDomainsCap(
  data: { maxCustomDomains?: number | null } | null | undefined,
): number {
  const override = data?.maxCustomDomains;
  if (typeof override === "number" && Number.isFinite(override)) {
    if (override === UNLIMITED_CUSTOM_DOMAINS) return Infinity;
    if (override > 0) return Math.floor(override);
  }
  return MAX_CUSTOM_DOMAINS_PER_SUBACCOUNT;
}
