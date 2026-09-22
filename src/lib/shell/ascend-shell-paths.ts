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
/** Bare-path-only maps: the section index exists under /app, but deeper
 *  sub-paths (e.g. a detail page) do NOT — so only the exact bare path is
 *  rewritten; anything deeper falls through to the legacy /sa route.
 *
 *  EVERY ENTRY HERE WAS VERIFIED AGAINST THE ROUTE TREE. Most of these sat
 *  in PREFIX_MAP while having no detail route under /app, which is how a VA
 *  clicking Edit on a form reached "Page not found": /forms/{id} was
 *  rewritten to /app/create/forms/{id}, and only /app/create/forms/page.tsx
 *  exists. The file's own contract — "a link can never 404" — depends on an
 *  entry living here rather than in the prefix table when the subtree has no
 *  /app routes. */
const EXACT_MAP: Record<string, string> = {
  "/dashboard": "/",
  "/ai-suite": "/scale",
  "/website": "/create",
  // Index exists under /app; no detail route, so deep links fall through.
  "/forms": "/create/forms",
  "/booking": "/create/booking",
  "/products": "/create/products",
  "/quotes": "/create/quotes",
  "/templates": "/create/templates",
  "/funnels/orders": "/create/orders",
  "/pipeline": "/grow/pipeline",
  "/conversations": "/grow/conversations",
  "/tasks": "/grow/tasks",
  "/calendar": "/grow/calendar",
  "/ai-agents": "/agents",
  "/reports": "/performance",
  "/dashboard/settings": "/settings",
};

/** Prefix maps: both the index AND its sub-paths have real /app routes, so
 *  the whole subtree is rewritten. `to` replaces `from`.
 *
 *  Only four subtrees qualify, each confirmed to carry a detail segment.
 *  Several former entries pointed at directories that do not exist at all
 *  (/leads/contacts, /leads/pipeline, /create/broadcasts, /create/workflows)
 *  — those sections live under /grow and /launch — so the rewrite produced a
 *  404 for the INDEX as well as for detail pages. */
const PREFIX_MAP: Array<{ from: string; to: string }> = [
  { from: "/contacts", to: "/grow/contacts" },      // [id]
  { from: "/funnels", to: "/create/funnels" },      // [funnelId]
  { from: "/broadcasts", to: "/launch/broadcasts" },// [broadcastId]
  { from: "/workflows", to: "/launch/workflows" },  // [workflowId]
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
