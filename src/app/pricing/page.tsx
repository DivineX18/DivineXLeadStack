import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";
import { OrganizationSchema, ProductSchema } from "@/components/landing-custom/site-schema";
import { FaqAccordion, type FaqItem } from "@/components/landing-custom/faq-accordion";
import { HOMEPAGE_FAQS } from "@/components/landing-custom/faq";
import {
  Users2,
  KanbanSquare,
  Calendar,
  CheckSquare,
  Bot,
  Receipt,
  MessageSquareText,
  CalendarClock,
  FileText,
} from "lucide-react";

import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Pricing as CustomPricing } from "@/components/landing-custom/pricing";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Pricing — ${brand.name} CRM & Growth Operations Platform`,
    description: `Simple, transparent CRM pricing for ${brand.name}. One monthly subscription for contacts, pipeline, AI agents, quotes, booking pages, and more — cancel anytime, no contract.`,
    openGraph: {
      title: `Pricing — ${brand.name}`,
      description: `Simple, transparent CRM pricing. One monthly subscription, cancel anytime.`,
      type: "website" as const,
    },
  };
}

const INCLUDED = [
  { icon: Users2, label: "Contacts", body: "A searchable list, CSV import, and a profile page with a unified activity timeline." },
  { icon: KanbanSquare, label: "Pipeline", body: "A six-stage Kanban board with drag-and-drop deals and days-in-stage tracking." },
  { icon: Calendar, label: "Calendar & tasks", body: "A shared calendar and a task list, both linked back to the contact they're about." },
  { icon: CheckSquare, label: "Forms & booking pages", body: "Lead-capture forms and a public booking page — both write straight into contacts." },
  { icon: Receipt, label: "Quotes", body: "Line-itemed quotes clients can accept or pay directly from their inbox." },
  { icon: Bot, label: "AI agents", body: "Channel-by-channel AI availability varies by plan — every plan includes the core CRM above." },
];

const BILLING_FAQS: FaqItem[] = [
  {
    question: "Is there a free trial?",
    answer:
      "If a free tier is available it'll show as one of the plan cards above — otherwise, reach out and we'll walk you through the platform before you commit to anything.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. Upgrading or downgrading takes effect on your next billing cycle, and your data — contacts, pipeline, everything — stays exactly where it is.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "You keep access through the end of the period you've already paid for. Your data isn't deleted on cancellation — export it as a CSV whenever you want.",
  },
  {
    question: "Do you charge per user or per contact?",
    answer:
      "Pricing is a flat monthly subscription per workspace — check each plan's included team size above rather than a per-seat or per-contact fee that scales against you as you grow.",
  },
  {
    question: "Is support included?",
    answer:
      "Yes — every plan includes direct support. There's no separate paid support tier to unlock a real response.",
  },
];

// One combined, organized FAQ instead of two separate accordion blocks
// stacked on the page (general + billing repeated back to back reads as
// padding, not depth) — same total question count, one coherent section.
const PRICING_PAGE_FAQS: FaqItem[] = [...HOMEPAGE_FAQS, ...BILLING_FAQS];

const CONSOLIDATES = [
  { icon: MessageSquareText, label: "A separate texting/AI-answering tool", body: "SMS, WhatsApp, and web chat auto-replies are part of the platform, not a bolt-on line item." },
  { icon: CalendarClock, label: "A separate booking-link tool", body: "Booking pages with ICS confirmations and reminders are included, not a third-party subscription." },
  { icon: FileText, label: "A separate quoting/invoicing tool", body: "Line-itemed quotes clients can accept or pay from their inbox — no export-to-PDF workaround." },
];

/**
 * Dedicated marketing pricing page — same live, Stripe-backed plan data
 * (and the same <Pricing/> component) as the homepage teaser section, so
 * the numbers can never drift between the two places. Carries its own H1
 * and supporting content (the shared <Pricing/> component only renders an
 * <h2>, which is correct for the homepage teaser but left this standalone
 * page without a top-level heading at all).
 */
export default async function PricingPage() {
  const [brand, { plans }] = await Promise.all([
    resolveCustomBrand(),
    getPublicPlans(),
  ]);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_PAGE_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <ProductSchema brand={brand} baseUrl={baseUrl} plans={plans} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="pt-20 pb-6 text-center md:pt-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Pricing</p>
            <h1 className="mx-auto mt-2 max-w-2xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              CRM and growth operations{" "}
              <span className="font-serif font-normal italic">pricing that stays simple</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              One monthly subscription covers the platform — contacts, pipeline, calendar, tasks,
              forms, booking pages, and quotes — with AI agents and channel add-ons layered in by
              plan. No setup fee, no annual lock-in, cancel anytime.
            </p>
          </div>
        </section>

        <CustomPricing plans={plans} configured={billingStripeIsConfigured()} />

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Every plan</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                The core CRM, standard everywhere
              </h2>
              <p className="mt-3 text-muted-foreground">
                Contacts, pipeline, calendar, tasks, forms, booking pages, and quotes aren&apos;t a
                higher-tier upsell — they&apos;re the baseline every workspace starts with. Plans
                differ on which AI channels and add-ons are turned on, not on whether you can run
                your day-to-day operations.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {INCLUDED.map(({ icon: Icon, label, body }) => (
                <div key={label} className="rounded-2xl border bg-card p-6">
                  <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">What this replaces</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Often the same price as one of these alone
              </h2>
              <p className="mt-3 text-muted-foreground">
                Most teams comparing CRM pricing are really comparing it against the cost of
                several separate subscriptions. Here&apos;s what&apos;s already included instead
                of billed on top.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3">
              {CONSOLIDATES.map(({ icon: Icon, label, body }) => (
                <div key={label} className="rounded-2xl border bg-card p-6">
                  <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold">{label}</h3>
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
                Frequently asked questions
              </h2>
              <p className="mt-3 text-muted-foreground">
                Can&apos;t find what you&apos;re looking for?{" "}
                <a href={`mailto:${brand.supportEmail}`} className="text-primary hover:underline">
                  {brand.supportEmail}
                </a>
              </p>
            </div>
            <div className="mx-auto mt-10">
              <FaqAccordion items={PRICING_PAGE_FAQS} />
            </div>
          </div>
        </section>

        <CustomCTA brand={brand} pricingHref="#pricing" />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
