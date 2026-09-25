import type { Metadata } from "next";
import { GrowthScanner } from "@/components/growth-scan/growth-scanner";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { brandForProduct, resolveProductSurface } from "@/lib/landing/resolve-product-surface";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export const dynamic = "force-dynamic";

/**
 * The public Ascend Growth Scan — the cold-traffic front door.
 *
 * PUBLIC and unauthenticated on purpose. A visitor who has never heard of us
 * should experience the diagnosis before being asked for anything: no account,
 * no workspace, no card. The trial is a separate, card-required decision that
 * only appears after the scan has actually said something useful.
 *
 * This is an acquisition page, not a dashboard surface. It deliberately sits
 * outside the APP shell, so no sidebar or workspace switcher can reach it.
 *
 * It does NOT sit outside the brand. It used to render bare: no logo, no
 * navigation, a hardcoded near-black palette and a plain white button, on a
 * site whose every other page is light, emerald-accented and carries the
 * mark. A cold visitor arriving from an ad had no way to tell whose page they
 * were on, and a visitor arriving from the site's own nav watched it change
 * identity under them. That is the most expensive place to look untrustworthy,
 * because it is the page asking for an email address.
 *
 * It now uses the same navbar, the same footer and the same design tokens as
 * the rest of the marketing site. The layout of the ask is untouched.
 */
export const metadata: Metadata = {
  title: "Free Growth Scan. Find what's costing you leads | Ascend",
  description:
    "Enter your website and Ascend will analyze your marketing, identify your biggest growth constraint, and show you what to fix first. Free growth assessment, no software setup required.",
  robots: { index: true, follow: true },
  // The root layout stamps Flow's social identity (og:title, og:site_name,
  // apple-mobile-web-app-title) from CUSTOM_BRAND onto every page. On an
  // Ascend acquisition page that is the wrong brand: a shared link previewed
  // as "Flow". Overriding here fixes THIS page; the host-aware fix for every
  // public surface is the separate branding pass.
  openGraph: {
    title: "Free Growth Scan. Find what's costing you leads",
    siteName: "Ascend",
    description:
      "Ascend analyzes your website and marketing, identifies your biggest growth constraint, and shows you what to fix first.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Free Growth Scan | Ascend" },
  appleWebApp: { title: "Ascend" },
};

export default async function GrowthScannerPage() {
  // Host-aware, exactly as / and /pricing resolve it: on app.divinex.io this
  // is Ascend, on crm it is Flow. The mark and the wordmark follow.
  const brand = brandForProduct(await resolveCustomBrand(), await resolveProductSurface());

  return (
    <div className="marketing-accent flex min-h-dvh flex-col">
      <CustomNavbar brand={brand} />
      <GrowthScanner brandName={brand.name} />
      <CustomFooter brand={brand} />
    </div>
  );
}
