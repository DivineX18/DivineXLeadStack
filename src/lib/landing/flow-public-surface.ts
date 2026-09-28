import "server-only";
import { permanentRedirect } from "next/navigation";
import { resolveProductSurface } from "./resolve-product-surface";

/**
 * FLOW'S PUBLIC MARKETING SURFACE IS DELIBERATELY SMALL.
 *
 * crm.divinex.io and app.divinex.io are ONE Next app on two hosts, so every
 * marketing route existed twice: identical sitemaps, both indexable, 72-92%
 * identical copy. That is not Flow mirroring Ascend, it is one set of pages
 * published under two brands, and the pages themselves are CRM-intent
 * ("CRM for Marketing & Creative Agencies", "Guides on CRM, Pipeline &
 * Follow-Up") wearing whichever name the host resolved to.
 *
 * Ascend is the flagship and is certified, so consolidation happens on the
 * Flow side: these routes still exist and still serve on the Ascend host,
 * and on the Flow host they permanently redirect to their own equivalent
 * one hop away. Flow keeps the pages a buyer actually needs to understand,
 * buy and operate it, and stops maintaining a second content ecosystem.
 *
 * Adding a route here is not enough on its own. A retired route must also be
 * dropped from `sitemap.ts` and from the Flow link sets in the navbar and
 * footer, or it becomes an orphan that redirects.
 */
export const FLOW_RETIRED_MARKETING_ROUTES = [
  "/about",
  "/faq",
  "/implementation",
  "/platform",
  "/industries",
  "/resources",
] as const;

/** Kept on Flow: the product story, the commercial pages, the operational
 *  and legal pages. Everything a standalone Flow buyer needs. */
export const FLOW_KEPT_MARKETING_ROUTES = [
  "/",
  "/pricing",
  "/features",
  "/contact",
  "/docs/api",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/responsible-ai",
] as const;

export function isRetiredOnFlow(pathname: string): boolean {
  return FLOW_RETIRED_MARKETING_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}

/** The Ascend surface this deployment answers on. Read from the same env
 *  `resolveProductSurface` compares against, so the two cannot disagree. */
export function ascendOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_ASCEND_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Called at the top of a retired marketing page. On the Ascend surface it
 * does nothing and the page renders as it always has.
 *
 * Without a configured Ascend origin there is nowhere to send anyone, so the
 * page keeps rendering rather than redirecting into a broken URL. A
 * single-surface deployment therefore behaves exactly as it did before.
 */
export async function retireFromFlowSurface(pathname: string): Promise<void> {
  if ((await resolveProductSurface()) === "unified") return;
  const origin = ascendOrigin();
  if (!origin) return;
  permanentRedirect(`${origin}${pathname}`);
}
