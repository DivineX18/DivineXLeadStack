import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";

import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Pricing as CustomPricing } from "@/components/landing-custom/pricing";
import { FAQ as CustomFAQ } from "@/components/landing-custom/faq";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing",
};

/**
 * Dedicated marketing pricing page — same live, Stripe-backed plan data
 * (and the same <Pricing/> component) as the homepage teaser section, so
 * the numbers can never drift between the two places.
 */
export default async function PricingPage() {
  const [brand, { plans }] = await Promise.all([
    resolveCustomBrand(),
    getPublicPlans(),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <CustomPricing plans={plans} configured={billingStripeIsConfigured()} />
        <CustomFAQ brand={brand} />
        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
