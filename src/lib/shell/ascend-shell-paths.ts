/**
 * Deep-link boundary resolver for the Ascend OS shell.
 *
 * Flow page components build their internal links with
 * useSubAccount().saPath("/contacts") -> "/sa/{id}/contacts". When those
 * same components are mounted inside the Ascend shell (/app/*), a raw
 * /sa/{id}/... link yanks the user out of the Ascend chrome back into the
 * legacy Flow layout — the "feels like two apps" seam the North Star's
 * Priority 2 calls out.
 *
 * This maps a Flow-relative path to its Ascend-shell equivalent, but ONLY
 * for paths that have a real /app route (verified against the route tree).
 * Anything without an /app equivalent falls back to the exact legacy
 * /sa/{id} path — so a link can never 404. As /app detail routes are added
 * later (e.g. a contact detail under /app/grow/contacts/[id]), moving that
 * entry from EXACT_ONLY awareness to a prefix rule is the only change
 * needed.
 */

/** Bare-path-only maps: the section index exists under /app, but deeper
 *  sub-paths (e.g. a detail page) do NOT — so only the exact bare path is
 *  rewritten; anything deeper falls through to the legacy /sa route. */
const EXACT_MAP: Record<string, string> = {
  "/dashboard": "/app/home",
  "/ai-suite": "/app/scale",
  "/website": "/app/create",
  "/funnels": "/app/create",
};

/** Step C — features that now have real /app adapters mounting the SAME Flow
 *  page component (see components/shell/unified-feature.tsx). Registered as
 *  prefixes below so detail routes resolve too where the Flow route tree has
 *  them; the fallback still guarantees no 404. */

/** Prefix maps: both the index AND its sub-paths have real /app routes,
 *  so the whole subtree is rewritten. `to` replaces `from`. */
const PREFIX_MAP: Array<{ from: string; to: string }> = [
  { from: "/dashboard/settings", to: "/app/settings" },
  { from: "/contacts", to: "/app/grow/contacts" },
  { from: "/funnels", to: "/app/create/funnels" },
  { from: "/broadcasts", to: "/app/launch/broadcasts" },
  { from: "/workflows", to: "/app/launch/workflows" },
  // The Create -> Orders escape: this is the entry that fixes it.
  { from: "/funnels/orders", to: "/app/create/orders" },
  { from: "/forms", to: "/app/create/forms" },
  { from: "/booking", to: "/app/create/booking" },
  { from: "/products", to: "/app/create/products" },
  { from: "/quotes", to: "/app/create/quotes" },
  { from: "/templates", to: "/app/create/templates" },
  { from: "/pipeline", to: "/app/grow/pipeline" },
  { from: "/conversations", to: "/app/grow/conversations" },
  { from: "/tasks", to: "/app/grow/tasks" },
  { from: "/calendar", to: "/app/grow/calendar" },
  { from: "/ai-agents", to: "/app/agents" },
  { from: "/reports", to: "/app/performance" },
];

/**
 * Resolve a Flow-relative path to the best in-shell href.
 * @param subAccountId active workspace id (for the legacy fallback)
 * @param path Flow-relative path, always starting with "/" (as saPath requires)
 */
export function resolveAscendShellHref(subAccountId: string, path: string): string {
  // Split off any query/hash so matching is clean; re-append after.
  const qIndex = path.search(/[?#]/);
  const bare = qIndex === -1 ? path : path.slice(0, qIndex);
  const suffix = qIndex === -1 ? "" : path.slice(qIndex);

  // 1. Exact section index (deeper sub-paths intentionally excluded here).
  const exact = EXACT_MAP[bare];
  if (exact) return `${exact}${suffix}`;

  // 2. Prefix subtrees with real /app detail routes. Longest prefix wins so
  //    "/dashboard/settings" beats a hypothetical "/dashboard" prefix rule.
  const prefixMatch = [...PREFIX_MAP]
    .sort((a, b) => b.from.length - a.from.length)
    .find(({ from }) => bare === from || bare.startsWith(`${from}/`));
  if (prefixMatch) {
    return `${prefixMatch.to}${bare.slice(prefixMatch.from.length)}${suffix}`;
  }

  // 3. No /app equivalent — legacy path, guaranteed to resolve.
  return `/sa/${subAccountId}${path}`;
}
