import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { FaqAccordion } from "@/components/landing-custom/faq-accordion";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { INDUSTRIES, getIndustryBySlug } from "@/data/industries";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const industry = getIndustryBySlug(slug);
  const brand = await resolveCustomBrand();
  if (!industry) return { title: `Industries — ${brand.name}` };
  return {
    title: `${industry.metaTitle} — ${brand.name}`,
    description: industry.metaDescription,
    openGraph: { title: `${industry.metaTitle} — ${brand.name}`, type: "website" as const },
  };
}

export default async function IndustryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const industry = getIndustryBySlug(slug);
  if (!industry) notFound();

  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: industry.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Industries", item: `${baseUrl}/industries` },
      { "@type": "ListItem", position: 3, name: industry.name, item: `${baseUrl}/industries/${industry.slug}` },
    ],
  };

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 text-center md:py-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{industry.heroEyebrow}</p>
            <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              {industry.heroTitleA}{" "}
              <span className="font-serif font-normal italic">{industry.heroTitleB}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{industry.heroSubtitle}</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button render={<Link href="/pricing" />} size="lg" className="px-6 text-base">
                See plans
              </Button>
              <Button render={<Link href="/platform" />} variant="outline" size="lg" className="px-6 text-base">
                See how it works
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">The problem</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                What actually slows down {industry.shortName}
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
              {industry.painPoints.map(({ title, body }) => (
                <div key={title} className="rounded-2xl border bg-card p-6">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">How {brand.name} helps</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Built to fit how {industry.shortName} actually work
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
              {industry.howItHelps.map(({ title, body }) => (
                <div key={title} className="rounded-2xl border bg-card p-6">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">FAQ</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Questions from {industry.shortName}
              </h2>
            </div>
            <div className="mx-auto mt-10">
              <FaqAccordion items={industry.faqs} />
            </div>
          </div>
        </section>

        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
