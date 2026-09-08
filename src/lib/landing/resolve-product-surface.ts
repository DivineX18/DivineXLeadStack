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
