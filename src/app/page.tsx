import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANDING_VARIANT } from "@/config/landing";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { resolveHeroVariant } from "@/lib/hero-variant-server";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";

import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { Navbar as LeadStackNavbar } from "@/components/landing/navbar";
import { Hero as LeadStackHero } from "@/components/landing/hero";
import { IntegrationsCarousel } from "@/components/landing/integrations-carousel";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WorkspaceTour } from "@/components/landing/workspace-tour";
import { Features as LeadStackFeatures } from "@/components/landing/features";
import { MidPageCta } from "@/components/landing/mid-page-cta";
import { Comparison } from "@/components/landing/comparison";
// import { Support } from "@/components/landing/support"; // hidden for now
import { MakeItYours } from "@/components/landing/make-it-yours";
import { TestimonialsCarousel } from "@/components/landing/testimonials-carousel";
import { Pricing as LeadStackPricing } from "@/components/landing/pricing";
import { FAQ as LeadStackFAQ } from "@/components/landing/faq";
import { CTA as LeadStackCTA } from "@/components/landing/cta";
import { Footer as LeadStackFooter } from "@/components/landing/footer";
import { ExitIntentModal } from "@/components/landing/exit-intent-modal";
import { UpdatesModal } from "@/components/landing/updates-modal";
import { SalesPopup } from "@/components/landing/sales-popup";
import { LiveVisitorBeacon } from "@/components/landing/live-visitor-beacon";

import { OrganizationSchema, ProductSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Hero as CustomHero } from "@/components/landing-custom/hero";
import { BeforeAfterFlow } from "@/components/landing-custom/before-after-flow";
import { BusinessOperatingSystem } from "@/components/landing-custom/business-operating-system";
import { Pricing as CustomPricing } from "@/components/landing-custom/pricing";
import { FAQ as CustomFAQ } from "@/components/landing-custom/faq";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

/**
 * Renders one of two landing pages based on src/config/landing.ts.
 *
 * - "custom" — a generic agency-CRM landing the buyer brands as their own.
 *   Brand fields are resolved server-side from the agency doc (Agency →
 *   Settings → Branding), falling back to CUSTOM_BRAND for anything the
 *   owner hasn't set yet. THIS IS THE DEFAULT.
 * - "leadstack" — the LeadStack-branded marketing landing used on the
 *   leadstack.dev demo site. Flip back to this only for the public demo.
 *
 * Flip LANDING_VARIANT to swap. Code-level defaults for the custom
 * variant live in src/config/landing.ts (CUSTOM_BRAND).
 */
/** Mirrors resolve-shell-context.ts's server-side hostname normalization
 *  (that file's helpers aren't exported — this is a small, self-contained
 *  copy, same pattern legacy-redirect.tsx already uses client-side). */
function normalizeHostname(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.split(":")[0].toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function safeAscendHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_ASCEND_APP_URL;
  if (!url) return null;
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  // Ascend OS — an already-authenticated caller hitting the bare
  // app.divinex.io root previously always saw the public Flow marketing
  // pitch (this page has no auth awareness at all) instead of landing in
  // their own product. Route them straight through the same /dashboard ->
  // LegacyRedirect chain every other legacy entry point uses (which
  // already knows how to pick a workspace and, on the Ascend hostname,
  // land on /app/home) rather than re-deriving workspace selection here.
  // Unauthenticated visitors and everyone on any other hostname
  // (including crm.divinex.io) see the unchanged marketing page below.
  const hdrs = await headers();
  const uid = hdrs.get("x-user-uid");
  const hostname = normalizeHostname(hdrs.get("host"));
  const ascendHostname = safeAscendHostname();
  if (uid && hostname && ascendHostname && hostname === ascendHostname) {
    redirect("/dashboard");
  }

  if (LANDING_VARIANT === "custom") {
    const [brand, { plans }] = await Promise.all([
      resolveCustomBrand(),
      getPublicPlans(),
    ]);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
    return (
      <div className="marketing-accent flex min-h-screen flex-col">
        <OrganizationSchema brand={brand} baseUrl={baseUrl} />
        <ProductSchema brand={brand} baseUrl={baseUrl} plans={plans} />
        <CustomNavbar brand={brand} />
        <main className="flex-1">
          <CustomHero brand={brand} />
          <BeforeAfterFlow brand={brand} />
          <BusinessOperatingSystem />
          <CustomPricing plans={plans} configured={billingStripeIsConfigured()} />
          <CustomFAQ brand={brand} />
          <CustomCTA brand={brand} pricingHref="#pricing" />
        </main>
        <CustomFooter brand={brand} />
      </div>
    );
  }

  const heroVariant = await resolveHeroVariant();

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <AnnouncementBar />
      <LeadStackNavbar />
      <main className="flex-1">
        <LeadStackHero variant={heroVariant} />
        <HowItWorks />
        <WorkspaceTour />
        <LeadStackFeatures />
        <MidPageCta />
        <Comparison />
        {/* <Support /> — hidden for now; uncomment to restore */}
        <MakeItYours />
        <TestimonialsCarousel />
        <LeadStackPricing />
        <IntegrationsCarousel />
        <LeadStackFAQ />
        <LeadStackCTA />
      </main>
      <LeadStackFooter variant={heroVariant} />
      <ExitIntentModal />
      <UpdatesModal />
      <SalesPopup />
      <LiveVisitorBeacon />
    </div>
  );
}
