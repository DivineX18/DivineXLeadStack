import "server-only";

/**
 * Ascend OS Phase 2, Slice 9 — configuration + auth-gap gate for the
 * Ascend Intelligence client.
 *
 * `ASCEND_INTELLIGENCE_API_URL` / `ASCEND_INTELLIGENCE_API_SECRET` are NEW
 * env vars introduced by this slice — they do not exist anywhere in this
 * deployment today, deliberately. The real service-to-service contract for
 * Flow calling Ascend's Clerk-gated `/zeno/*` routes on a workspace's
 * behalf is explicitly marked "Not implemented... pending product-owner
 * approval" in `docs/architecture/ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md`
 * Section 6, and no service-account/API-key mechanism exists on Ascend's
 * side today (confirmed by direct source read: Ascend's only non-Clerk
 * auth path is a dev-only bypass header, explicitly disabled in
 * production). Naming these two vars now — following the exact
 * `ASCEND_SSO_EXCHANGE_URL` / `ASCEND_SSO_SHARED_SECRET` shape already
 * proven for the Ascend→Flow SSO direction — gives the eventual contract a
 * concrete home without inventing behavior that doesn't exist: until both
 * are set, `ascendIntelligenceConfigured()` returns false and every client
 * method fails closed to "unavailable", which is the honest, current state
 * of the system, not a placeholder standing in for something real.
 */
export function ascendIntelligenceConfigured(): boolean {
  return !!process.env.ASCEND_INTELLIGENCE_API_URL && !!process.env.ASCEND_INTELLIGENCE_API_SECRET;
}

export function ascendIntelligenceBaseUrl(): string | null {
  const url = process.env.ASCEND_INTELLIGENCE_API_URL;
  return url ? url.replace(/\/$/, "") : null;
}

export function ascendIntelligenceSharedSecret(): string | null {
  return process.env.ASCEND_INTELLIGENCE_API_SECRET ?? null;
}
