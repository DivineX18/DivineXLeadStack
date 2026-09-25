import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo/site";

/**
 * robots.txt — Next.js picks this up automatically and serves at /robots.txt.
 *
 * Disallows the authenticated dashboard surfaces (/dashboard, /sa/...,
 * /agency/...) so they never show up in search results even if a logged-
 * in user accidentally shares a URL. Public marketing + docs + booking
 * + form + comparison pages are allowed.
 *
 * HOST-AWARE. This read one environment variable, so the Ascend host served
 * a robots.txt advertising the Flow host's sitemap, sending every crawler
 * that asked Ascend about itself to a list of the other brand's URLs. It now
 * answers for whichever hostname was asked. Also disallows the per-recipient
 * token paths (/q, /u, /e, /pay), which are addressed to one person: they are
 * not secret, but they are not pages anyone should find in a
 * search result either.
 *
 * Deliberately still indexable: /lp (tenant funnels), /c (community pages),
 * /b (booking pages) and /f (hosted forms). Those are customer-facing pages
 * a tenant may well want found, and a platform-wide Disallow would deindex
 * every one of them without the tenant ever being asked.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await siteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/sa/",
          "/agency/",
          "/me/",
          "/affiliate/dashboard",
          "/affiliate/login",
          // Per-recipient token links. Not secret, but a quote or an
          // unsubscribe page is addressed to one person and has no business
          // in a search result.
          "/q/",
          "/u/",
          "/e/",
          "/pay/",
          // Internal render targets, not pages.
          "/preview/",
          "/funnel-preview/",
          "/cdomain/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
