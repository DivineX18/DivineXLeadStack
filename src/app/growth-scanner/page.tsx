import type { Metadata } from "next";
import { GrowthScanner } from "@/components/growth-scan/growth-scanner";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { brandForProduct, resolveProductSurface } from "@/lib/landing/resolve-product-surface";
import Link from "next/link";
import { BrandLogo } from "@/components/landing-custom/brand-logo";

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
 * It now carries the mark and the same design tokens as the rest of the
 * marketing site, and nothing else. The full navbar and footer were tried
 * first and removed deliberately: a scan page earns its keep by getting one
 * thing done, and a nav with five menus plus a footer with sixteen links is
 * sixteen ways to leave before entering an email address. The logo alone
 * answers "whose page is this", which was the actual problem.
 *
 * The layout of the ask is untouched.
 */
export const metadata: Metadata = {
  title: "Free Growth Scan. Find what's costing you leads | Ascend",
  description:
    "Enter your website and Ascend analyzes your marketing, names your biggest growth constraint, and shows you what to fix first. Free, no software setup.",
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
    <div className="marketing-accent flex min-h-dvh flex-col bg-background text-foreground">
      {/* The mark, and nothing that competes with the form. It links home
          because a logo that does not is a dead end for anyone who wants to
          know who we are before typing their address. */}
      <header className="px-5 py-6 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xl font-bold"
          aria-label={`${brand.name} home`}
        >
          <BrandLogo
            logoUrl={brand.logoUrl}
            name={brand.name}
            size={24}
            idSuffix="-scan"
            imgClassName="h-6 w-auto max-w-[120px] object-contain"
          />
          <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
            {brand.name}
          </span>
        </Link>
      </header>

      <GrowthScanner brandName={brand.name} />
    </div>
  );
}
