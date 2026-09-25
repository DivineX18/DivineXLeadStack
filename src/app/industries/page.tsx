import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { resolveProductSurface, brandForProduct } from "@/lib/landing/resolve-product-surface";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { INDUSTRIES } from "@/data/industries";
import { siteOrigin } from "@/lib/seo/site";
import { FaqSection } from "@/components/seo/faq-section";
import { PRODUCT_FAQS } from "@/data/product-faqs";
import { JsonLd } from "@/components/seo/json-ld";
import { itemListSchema } from "@/lib/seo/schema";

export async function generateMetadata() {
  // Host-aware, exactly as / and /pricing already resolve it. Without
  // this the Ascend host served Flow's name, tagline and closing CTA.
  const brand = brandForProduct(await resolveCustomBrand(), await resolveProductSurface());
  return {
    title: `Industries | ${brand.name} CRM for Coaches, Agencies, Trades & More`,
    description: `${brand.name} adapted to how different industries actually sell: coaches, agencies, home services and trades, real estate, and local service businesses.`,
    openGraph: { title: `Industries | ${brand.name}`, type: "website" as const },
  };
}

export default async function IndustriesPage() {
  // Host-aware, exactly as / and /pricing already resolve it. Without
  // this the Ascend host served Flow's name, tagline and closing CTA.
  const brand = brandForProduct(await resolveCustomBrand(), await resolveProductSurface());
  const baseUrl = await siteOrigin();

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      {/* A hub whose whole job is to list the industry pages. ItemList is
          what tells a crawler that, and it is how the set gets treated as a
          set rather than as one page that happens to have links on it. */}
      <JsonLd
        data={itemListSchema(
          INDUSTRIES.map((i) => ({ name: i.name, url: `${baseUrl}/industries/${i.slug}` })),
        )}
      />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 text-center md:py-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Industries</p>
            <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              Built for how{" "}
              <span className="font-serif font-normal italic">your industry</span> actually sells
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              The same platform, configured around the pipeline, follow-up, and booking patterns
              that fit how you actually work, not a one-size-fits-all sales template.
            </p>
          </div>
        </section>

        <section className="pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
              {INDUSTRIES.map((industry) => (
                <Link
                  key={industry.slug}
                  href={`/industries/${industry.slug}`}
                  className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <h2 className="text-lg font-semibold">{industry.name}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">{industry.heroSubtitle}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    See how it fits <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <CustomCTA brand={brand} product={await resolveProductSurface()} />
        {/* The three-product question is asked before any other, and no
            public page answered it. FaqSection emits its own FAQPage markup
            from the same array it renders, so the copy and the structured
            data cannot drift apart. */}
        <FaqSection items={PRODUCT_FAQS} supportEmail={brand.supportEmail} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
