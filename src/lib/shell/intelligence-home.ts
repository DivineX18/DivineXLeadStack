/**
 * INTELLIGENCE AND OPERATIONS ARE TWO SIDES OF ONE PRODUCT.
 *
 * An Ascend customer's home is the unified Intelligence experience on
 * `ascend.divinex.io` — Growth Score, Growth Audit, Executive Briefing,
 * recommendations, Assets, Ask Zeno. Operations is the execution workspace
 * they cross into over SSO. The return journey has to land back on
 * Intelligence, or the two halves read as two competing products.
 *
 * DELIBERATELY NOT `NEXT_PUBLIC_ASCEND_APP_URL`. That variable is not a link:
 * middleware and the marketing root use it to DETECT which host is serving
 * the request, which is what decides the shell mode and the clean-root
 * rewrite. Repointing it to move a link would silently change host detection
 * and take the `/app` shell — Command Center, the Intelligence Bridge surface,
 * Asset Studio — off its own entry path. Two different jobs, two different
 * values.
 *
 * Not `server-only`: the sidebar that reads this is a client component.
 */

/** The unified Ascend Intelligence experience. Defaulted in code rather than
 *  assumed present, because a NEXT_PUBLIC_* variable is inlined at build time
 *  and this deployment has repeatedly shipped with one missing or stale. */
export const ASCEND_INTELLIGENCE_HOME =
  process.env.NEXT_PUBLIC_ASCEND_INTELLIGENCE_URL?.trim() || "https://ascend.divinex.io";

/**
 * Where a Flow workspace's return navigation should point, and what to call
 * it.
 *
 * `ascendOperations` is the grant Ascend stamps on a workspace it provisioned
 * or attached to. Only an ACTIVE grant redirects: a revoked one means the
 * customer's Ascend subscription has ended, and sending them to Intelligence
 * they can no longer use would be worse than leaving them where they are.
 * A standalone Flow workspace has no grant at all and is untouched.
 */
export function resolveReturnNavigation(ascendGrantActive: boolean): {
  href: string;
  label: string;
} {
  return ascendGrantActive
    ? { href: ASCEND_INTELLIGENCE_HOME, label: "Intelligence" }
    : {
        href: process.env.NEXT_PUBLIC_ASCEND_APP_URL ?? "https://app.divinex.io",
        label: "DivineX Home",
      };
}
