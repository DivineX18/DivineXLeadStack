import "server-only";
import { headers } from "next/headers";
import type { PlanProduct } from "@/types/billing";

/**
 * Which product a public visitor is looking at, decided by hostname.
 *
 * This deployment serves two marketing surfaces from one Next.js app:
 * crm.divinex.io sells Flow, app.divinex.io sells Unified. They share a plan
 * collection, so without this every pricing page would list every plan and a
 * Flow visitor would be offered Unified tiers at a different price.
 *
 * Defaults to "flow" for any unknown host — the conservative direction, since
 * Flow is what this app has always served publicly, and an unrecognised host
 * showing the cheaper established offer is safer than showing the premium one.
 */
/**
 * The brand as it should read on THIS surface.
 *
 * Both products are served by the same app off one agency Branding record, so
 * the Unified site was calling itself "Flow" — the name of only half of what
 * the customer is buying, and not the name on their invoice. Only the NAME is
 * swapped: the logo, colours and every other branding field carry through, so
 * the DivineX mark stays exactly where it is.
 */
export function brandForProduct<T extends { name: string; tagline?: string; shortDescription?: string; productCategory?: string; logoUrl?: string | null; parentCompanyUrl?: string; parentCompanyPhrase?: string }>(
  brand: T,
  product: PlanProduct,
): T {
  if (product !== "unified") return brand;
  // The NAME was swapped here from the start, but the tagline was not, so the
  // Ascend host still signed its footer "The Growth Operating System for
  // Purpose-Driven Businesses" — Flow's line, and an ICP Ascend no longer
  // leads with. Ascend's own positioning goes with its own name.
  return {
    ...brand,
    name: "Ascend",
    // On this host the product IS Ascend, so the line that names the company
    // behind it reads as a signature rather than as a statement about a
    // sibling product nobody on this page has heard of. Points at the Ascend
    // page on the company site for the same reason.
    ...(brand.parentCompanyUrl !== undefined
      ? { parentCompanyUrl: "https://divinex.io/ascend/", parentCompanyPhrase: "Ascend by DivineX" }
      : {}),
    ...(brand.tagline !== undefined ? { tagline: "Find what's costing you leads. Then fix it." } : {}),
    ...(brand.shortDescription !== undefined
      ? {
          shortDescription:
            "Ascend analyzes your website and marketing to identify the biggest constraint holding back conversions, shows you what to fix first, and helps you put the fix into action.",
        }
      : {}),
    // Flow's category is now "CRM & Customer Operations", which is Flow's
    // job and not Ascend's. Ascend keeps the broader category it sells on.
    ...(brand.productCategory !== undefined ? { productCategory: "Growth Operations Platform" } : {}),
    // Ascend's own mark, shipped with the app. The agency record's logoUrl is
    // the Flow/white-label brand and has been 404ing here, which is why the
    // header and footer fell back to the built-in badge. Transparent and
    // mark-only on purpose: the wordmark in the source lockup is white, so it
    // would disappear on this surface's light background, and the name is
    // already rendered beside it as text.
    ...(brand.logoUrl !== undefined ? { logoUrl: "/ascend-mark.png" } : {}),
  };
}

export async function resolveProductSurface(): Promise<PlanProduct> {
  const host = (await headers()).get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "");
  const unified = safeHostname(process.env.NEXT_PUBLIC_ASCEND_APP_URL);
  return unified && hostname === unified ? "unified" : "flow";
}

function safeHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
