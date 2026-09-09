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
export function brandForProduct<T extends { name: string }>(brand: T, product: PlanProduct): T {
  return product === "unified" ? { ...brand, name: "Ascend" } : brand;
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
