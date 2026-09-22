import { NextResponse } from "next/server";
import { startPublicGrowthScan } from "@/lib/intelligence/public-growth-scan";
import { resolveProductSurface } from "@/lib/landing/resolve-product-surface";

export const dynamic = "force-dynamic";

/**
 * Start a public Growth Scan. Unauthenticated by design: this is the cold-
 * traffic front door, and the upstream endpoint it forwards to is already
 * public. See lib/intelligence/public-growth-scan.ts for why it is proxied
 * rather than called from the browser.
 *
 * Requires name, email and businessType — the upstream contract. websiteUrl
 * is optional there, but the scanner UI always sends one, since a scan with
 * no site to read is the degraded case.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const name = str(body?.name).slice(0, 120);
  const email = str(body?.email).slice(0, 200);
  const businessType = str(body?.businessType).slice(0, 60) || "unknown";
  const websiteUrl = str(body?.websiteUrl).slice(0, 500);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address so we can send your results." }, { status: 400 });
  }
  if (!websiteUrl) {
    return NextResponse.json({ error: "Enter your website address so Ascend has something to analyze." }, { status: 400 });
  }

  const normalizedUrl = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  try {
    // Reject anything that isn't a real absolute http(s) URL before spending a
    // scan on it.
    const u = new URL(normalizedUrl);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error("bad url");
  } catch {
    return NextResponse.json({ error: "That doesn't look like a website address. Try something like yourbusiness.com" }, { status: 400 });
  }

  // The host decides the commercial contract, and it is decided HERE, before
  // the scan crosses into the intelligence service — never reconstructed
  // afterwards from APP_URL or from wherever the customer happens to be when
  // they come back. app.divinex.io is the Ascend front door and must sell
  // Ascend; every other host keeps selling Zeno exactly as before.
  //
  // Read from the request's own host, so a client cannot nominate a product.
  const surface = await resolveProductSurface();
  const acquisitionProduct = surface === "unified" ? "growth_system" : "ascend_pro";

  const result = await startPublicGrowthScan({
    name: name || email.split("@")[0],
    email,
    businessType,
    websiteUrl: normalizedUrl,
    acquisitionProduct,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ shareToken: result.shareToken }, { status: 202 });
}
