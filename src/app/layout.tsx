import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import { RefTracker } from "@/components/affiliate/ref-tracker";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { SwRegister } from "@/components/pwa/sw-register";
import { PwaLinks } from "@/components/pwa/pwa-links";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";
import { resolveProductSurface } from "@/lib/landing/resolve-product-surface";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// Metadata follows the same variant the landing page renders. The custom
// variant derives title + description from CUSTOM_BRAND so the buyer edits
// one config file to brand both the page chrome and the rendered landing.
//
// metadataBase + openGraph/twitter: without these, sharing any link (Slack,
// LinkedIn, iMessage) shows a blank/generic preview — no title, no image.
// Uses the same /api/pwa/icon/512 route the manifest already relies on, so
// the share-preview image tracks whatever icon the agency owner has
// uploaded (Agency → Settings → Mobile app icon) rather than a hardcoded
// asset. Static metadataBase can't read the live Firestore-resolved
// primaryDomain (this whole export is a static object, not
// generateMetadata()) — falls back to CUSTOM_BRAND.primaryDomain, same
// static-source-of-truth tradeoff the title/description above already make.
const siteUrl = `https://${CUSTOM_BRAND.primaryDomain}`;

/**
 * HOST-AWARE PUBLIC IDENTITY.
 *
 * This was a static `metadata` export, which cannot see the request, so both
 * hostnames emitted the same brand: app.divinex.io answered every public page
 * with "Flow — The Growth Operating System for Purpose-Driven Businesses",
 * including its own login and its own root. An Ascend customer's first
 * impression, and every link they shared, was the other product's name and a
 * positioning line Ascend no longer uses.
 *
 * generateMetadata() runs on the server per request, so the correct identity
 * is in the HTML that ships. Nothing is detected client-side and nothing
 * repaints: there is no Flow flash to remove because Flow is never rendered
 * here in the first place.
 *
 * PRESENTATION ONLY. resolveProductSurface reads the hostname and decides what
 * this surface is CALLED. It grants nothing: access is still decided by
 * entitlements and the session, and decide-shell-mode.ts still requires a real
 * full_ascend workspace tier before any Ascend product surface opens.
 */
export async function generateMetadata(): Promise<Metadata> {
  const product = await resolveProductSurface();
  const isAscend = product === "unified";

  // Ascend leads with the diagnosis, which is the whole positioning: it starts
  // before execution. Flow keeps its own line untouched — it is a standalone
  // product and this pass is not about restating it.
  const ascendTitle = "Ascend — Find what's costing you leads. Then fix it.";
  const ascendDescription =
    "Ascend analyzes your website and marketing to identify the biggest constraint holding back conversions, shows you what to fix first, and helps you put the fix into action.";

  const base: Metadata = {
  metadataBase: new URL(siteUrl),
  ...(LANDING_VARIANT === "custom"
    ? {
        title: `${CUSTOM_BRAND.name} — ${CUSTOM_BRAND.tagline}`,
        description: CUSTOM_BRAND.shortDescription,
        openGraph: {
          title: CUSTOM_BRAND.name,
          description: CUSTOM_BRAND.shortDescription,
          siteName: CUSTOM_BRAND.name,
          url: siteUrl,
          type: "website" as const,
          images: ["/api/pwa/icon/512"],
        },
        twitter: {
          card: "summary" as const,
          title: CUSTOM_BRAND.name,
          description: CUSTOM_BRAND.shortDescription,
          images: ["/api/pwa/icon/512"],
        },
      }
    : {
        title: "LeadStack — The all-in-one CRM for teams that actually close",
        description:
          "Capture leads, run pipelines, and book meetings from one simple workspace. Built for small teams that want to replace five tools with one.",
        openGraph: {
          title: "LeadStack",
          description:
            "Capture leads, run pipelines, and book meetings from one simple workspace.",
          siteName: "LeadStack",
          type: "website" as const,
          images: ["/leadstack-icon-512.png"],
        },
        twitter: {
          card: "summary" as const,
          title: "LeadStack",
          description:
            "Capture leads, run pipelines, and book meetings from one simple workspace.",
          images: ["/leadstack-icon-512.png"],
        },
      }),
  // Favicon per deployment mode (the former src/app/icon.svg file
  // convention would override this metadata, so both marks live in
  // /public instead): buyers default to the green "my CRM" badge,
  // the LeadStack demo keeps the chevron.
  //
  // PWA — only on custom-branded deployments. In "leadstack" template/demo
  // mode the app isn't the buyer's brand yet, so we don't advertise
  // installability at all (no manifest link = no browser install prompt).
  // The manifest route resolves live agency branding server-side; the
  // apple icon serves via the route so an owner upload applies (302s to
  // the static PNG until then).
  ...(LANDING_VARIANT === "custom"
    ? {
        manifest: "/manifest.webmanifest",
        icons: {
          icon: "/mycrm-mark.svg",
          apple: "/api/pwa/icon/apple",
        },
        appleWebApp: {
          capable: true,
          title: CUSTOM_BRAND.name,
          statusBarStyle: "default" as const,
        },
      }
    : {
        icons: { icon: "/leadstack-mark.svg" },
      }),
  };

  if (!isAscend) return base;
  return {
    ...base,
    title: ascendTitle,
    description: ascendDescription,
    openGraph: {
      ...(base.openGraph ?? {}),
      title: "Ascend",
      description: ascendDescription,
      siteName: "Ascend",
    },
    twitter: { ...(base.twitter ?? {}), title: "Ascend", description: ascendDescription },
    appleWebApp:
      typeof base.appleWebApp === "object" && base.appleWebApp
        ? { ...base.appleWebApp, title: "Ascend" }
        : base.appleWebApp,
  };
};

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <Providers>{children}</Providers>
        <SwRegister />
        <PwaLinks />
        <RefTracker />
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <noscript>
            {/* Meta Pixel no-JS fallback — must be a bare <img> tag.
                next/image requires client JS and can't run inside <noscript>,
                which is the entire reason this fallback exists. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        )}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
