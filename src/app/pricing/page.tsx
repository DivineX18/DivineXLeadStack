import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";
import { OrganizationSchema, ProductSchema } from "@/components/landing-custom/site-schema";

import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Pricing as CustomPricing } from "@/components/landing-custom/pricing";
import { FAQ as CustomFAQ } from "@/components/landing-custom/faq";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Pricing — ${brand.name}`,
    description: `Simple, transparent pricing for ${brand.name}. ${brand.shortDescription}`,
    openGraph: { title: `Pricing — ${brand.name}`, description: brand.shortDescription, type: "website" as const },
  };
}

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <ProductSchema brand={brand} baseUrl={baseUrl} plans={plans} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <CustomPricing plans={plans} configured={billingStripeIsConfigured()} />
        <CustomFAQ brand={brand} />
        <CustomCTA brand={brand} pricingHref="#pricing" />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
