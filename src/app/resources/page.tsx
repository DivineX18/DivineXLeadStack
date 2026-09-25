import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { resolveProductSurface, brandForProduct } from "@/lib/landing/resolve-product-surface";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { RESOURCE_POSTS } from "@/data/resources-posts";
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
    title: `Resources | ${brand.name} Guides on CRM, Pipeline & Follow-Up`,
    description: `Practical guides on lead follow-up, pipeline design, AI-assisted response, and appointment scheduling, from the team behind ${brand.name}.`,
    openGraph: { title: `Resources | ${brand.name}`, type: "website" as const },
  };
}

export default async function ResourcesPage() {
  // Host-aware, exactly as / and /pricing already resolve it. Without
  // this the Ascend host served Flow's name, tagline and closing CTA.
  const brand = brandForProduct(await resolveCustomBrand(), await resolveProductSurface());
  const baseUrl = await siteOrigin();
  const sorted = [...RESOURCE_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      {/* Same reason as the industries hub: this is a list of articles, and
          nothing said so. */}
      <JsonLd
        data={itemListSchema(
          sorted.map((post) => ({ name: post.title, url: `${baseUrl}/resources/${post.slug}` })),
        )}
      />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 text-center md:py-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Resources</p>
            <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              Practical guides,{" "}
              <span className="font-serif font-normal italic">not theory</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              How response time, pipeline design, AI-assisted follow-up, and scheduling actually
              work, and how to fix the parts that are quietly costing you leads.
            </p>
          </div>
        </section>

        <section className="pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-3xl gap-6">
              {sorted.map((post) => (
                <Link
                  key={post.slug}
                  href={`/resources/${post.slug}`}
                  className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-7"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{post.category}</p>
                  <h2 className="mt-1.5 text-lg font-semibold sm:text-xl">{post.title}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">{post.dek}</p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{post.readingMinutes} min read</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                      Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
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
