import { Mail } from "lucide-react";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { ContactForm } from "@/components/landing-custom/contact-form";
import { siteOrigin } from "@/lib/seo/site";
import { FaqSection } from "@/components/seo/faq-section";
import { PRODUCT_FAQS } from "@/data/product-faqs";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Contact | ${brand.name}`,
    description: `Talk to a real person about ${brand.name}: what it does, whether it fits how your team works, pricing, and moving your existing contacts across.`,
    openGraph: { title: `Contact | ${brand.name}`, type: "website" as const },
  };
}

export default async function ContactPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = await siteOrigin();

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-2 md:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Contact</p>
                <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
                  Talk to a <span className="font-serif font-normal italic">human</span>.
                </h1>
                <p className="mt-6 text-lg text-muted-foreground">
                  Tell us about your business and what you&apos;re trying to fix. We&apos;ll reply
                  directly, no ticket queue.
                </p>
                <div className="mt-8 flex items-center gap-3 rounded-xl border bg-card p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Prefer email?</p>
                    <a href={`mailto:${brand.supportEmail}`} className="text-sm text-primary hover:underline">
                      {brand.supportEmail}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-6 sm:p-8">
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
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
