import type { ResolvedBrand } from "@/config/landing";
import type { PublicPlanSummary } from "@/types/billing";

/**
 * Server-rendered JSON-LD for the custom (white-label) landing surface.
 * Before this, zero structured data was reachable anywhere on a
 * LANDING_VARIANT="custom" deployment — the only schema in the codebase
 * (ComparisonSchema) is gated to the "leadstack" variant only. Brand-aware,
 * no fabricated ratings/review counts — only fields resolveCustomBrand()
 * and live Firestore plan data actually provide.
 */
export function OrganizationSchema({ brand, baseUrl }: { brand: ResolvedBrand; baseUrl: string }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: baseUrl,
    ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
    description: brand.shortDescription,
    email: brand.supportEmail,
    ...(brand.parentCompany ? { parentOrganization: { "@type": "Organization", name: brand.parentCompany } } : {}),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

/** Product+Offer schema built from the same live getPublicPlans() data the pricing UI renders — never a second, hardcoded source of truth for price. */
export function ProductSchema({ brand, baseUrl, plans }: { brand: ResolvedBrand; baseUrl: string; plans: PublicPlanSummary[] }) {
  if (plans.length === 0) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: brand.name,
    description: brand.shortDescription,
    brand: { "@type": "Brand", name: brand.name },
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      url: `${baseUrl}/pricing`,
      price: (plan.priceMonthlyCents / 100).toFixed(2),
      priceCurrency: plan.currency.toUpperCase(),
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: (plan.priceMonthlyCents / 100).toFixed(2),
        priceCurrency: plan.currency.toUpperCase(),
        billingDuration: "P1M",
      },
    })),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}
