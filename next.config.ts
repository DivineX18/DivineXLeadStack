import type { NextConfig } from "next";

/** The locked unified IA. Home is deliberately absent — it is the bare root
 *  (see rewrites/redirects below), not a named section. */
const UNIFIED_SECTIONS = [
  "agents",
  "assistance",
  "brand",
  "campaigns",
  "command-center",
  "create",
  "crm",
  "grow",
  "home",
  "identify",
  "intelligence",
  "launch",
  "leads",
  "onboarding",
  "optimize",
  "performance",
  "scale",
  "settings",
  "zeno",
] as const;

/**
 * Friendlier customer URLs for surfaces whose physical route still sits under
 * an older internal grouping. /leads/contacts reads as the product; the
 * implementation is still /app/grow/contacts. Listed explicitly (not derived)
 * so adding one is a deliberate act.
 */
const UNIFIED_ALIASES: { from: string; to: string }[] = [
  { from: "/leads/contacts", to: "/app/grow/contacts" },
  { from: "/leads/pipeline", to: "/app/grow/pipeline" },
  { from: "/leads/conversations", to: "/app/grow/conversations" },
  { from: "/leads/tasks", to: "/app/grow/tasks" },
  { from: "/leads/calendar", to: "/app/grow/calendar" },
  { from: "/create/workflows", to: "/app/launch/workflows" },
  { from: "/create/broadcasts", to: "/app/launch/broadcasts" },
];

const nextConfig: NextConfig = {
  // The AI "where do I get this key" guide route reads these docs from disk at
  // runtime. They aren't imported by code, so trace them into that function's
  // bundle explicitly — otherwise readFileSync 404s on Vercel.
  outputFileTracingIncludes: {
    "/api/agency/setup/guide": ["./CLAUDE.md", "./SETUP.md", "./.env.example"],
  },
  /**
   * CLEAN CUSTOMER-FACING URLS.
   *
   * DivineX Complete lives on its own subdomain, so an /app prefix in the
   * address bar just exposes internal route organisation. These rewrites let
   * the customer navigate /create, /leads, ... while the implementation stays
   * physically at /app/* — no directory migration, no second route tree.
   *
   * Returned as a plain array (afterFiles): the filesystem is checked first,
   * so nothing here can shadow a real route, and redirects() below has already
   * run — which is what keeps the legacy /app/* redirects loop-free. A rewrite
   * DESTINATION is resolved against the filesystem and never re-enters the
   * redirect phase, so /app/create -> /create -> (rewrite) /app/create
   * terminates.
   */
  async rewrites() {
    return [
      // Aliases first: a more specific customer URL must win over the
      // generic /:section passthrough below.
      ...UNIFIED_ALIASES.flatMap((a) => [
        { source: a.from, destination: a.to },
        { source: `${a.from}/:path*`, destination: `${a.to}/:path*` },
      ]),
      ...UNIFIED_SECTIONS.flatMap((s) => [
        { source: `/${s}`, destination: `/app/${s}` },
        { source: `/${s}/:path*`, destination: `/app/${s}/:path*` },
      ]),
    ];
  },

  /**
   * Legacy /app/* URLs (bookmarks, older generated links, saved tests) keep
   * working and land on the clean equivalent. Home is the one asymmetric case:
   * /app/home collapses to the bare root.
   */
  async redirects() {
    return [
      // NOTE: /app/home is deliberately NOT redirected. The authenticated
      // entry chain (root -> /dashboard -> /sa/{id}/switch?next=/app/home)
      // targets it, so redirecting it to "/" would bounce straight back into
      // that chain and loop. The bare root is made to RENDER Home by a
      // middleware rewrite instead, which needs no redirect at all.
      ...UNIFIED_SECTIONS.flatMap((s) => [
        { source: `/app/${s}`, destination: `/${s}`, permanent: false },
        { source: `/app/${s}/:path*`, destination: `/${s}/:path*`, permanent: false },
      ]),
    ];
  },

  async headers() {
    return [
      {
        // The web-chat embed iframe target — must be loadable cross-
        // origin from any buyer's site. CSP frame-ancestors '*' is the
        // explicit way to allow that; without it, some hosts (and the
        // Vercel default in certain configs) inject X-Frame-Options
        // DENY/SAMEORIGIN which would block third-party iframes.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
          // Suppress the legacy header in case anything upstream tries
          // to add it. (Vercel doesn't by default but belt-and-braces.)
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        // Widget loader: long-cache and serve to any origin so the
        // <script> tag works on any buyer's site.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
