import type { Metadata } from "next";
import { GrowthScanner } from "@/components/growth-scan/growth-scanner";

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
 * outside the app shell so no Flow chrome, sidebar or workspace switcher can
 * reach it.
 */
export const metadata: Metadata = {
  title: "Free Growth Scan — find what's costing you leads | Ascend",
  description:
    "Enter your website and Ascend will analyze your marketing, identify your biggest growth constraint, and show you what to fix first. Free growth assessment, no software setup required.",
  robots: { index: true, follow: true },
  // The root layout stamps Flow's social identity (og:title, og:site_name,
  // apple-mobile-web-app-title) from CUSTOM_BRAND onto every page. On an
  // Ascend acquisition page that is the wrong brand: a shared link previewed
  // as "Flow". Overriding here fixes THIS page; the host-aware fix for every
  // public surface is the separate branding pass.
  openGraph: {
    title: "Free Growth Scan — find what's costing you leads",
    siteName: "Ascend",
    description:
      "Ascend analyzes your website and marketing, identifies your biggest growth constraint, and shows you what to fix first.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Free Growth Scan | Ascend" },
  appleWebApp: { title: "Ascend" },
};

export default function GrowthScannerPage() {
  return <GrowthScanner />;
}
