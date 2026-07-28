import Link from "next/link";
import { ClipboardList, Settings2, Plug2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { FaqAccordion, type FaqItem } from "@/components/landing-custom/faq-accordion";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Implementation & Onboarding — ${brand.name}`,
    description: `What CRM onboarding with ${brand.name} actually looks like: tell us about your business, we configure your systems and migrate your existing contacts, connect what you already use, and go live in days — not months.`,
    openGraph: { title: `Implementation — ${brand.name}`, type: "website" as const },
  };
}

const IMPLEMENTATION_FAQS: FaqItem[] = [
  {
    question: "How long does implementation actually take?",
    answer:
      "Most teams are running within days of the first conversation, not weeks. Timeline depends mainly on how quickly you can hand over existing contacts and confirm your pipeline stages.",
  },
  {
    question: "What format do my existing contacts need to be in?",
    answer:
      "Whatever you've got — a spreadsheet export, a CSV from another CRM, or a live login to your current system. Matching and cleaning the data during import is part of the process, not something you do yourself first.",
  },
  {
    question: "Do I need to train my team, or does someone do that for me?",
    answer:
      "The pipeline and workflows are set up to match how your team already sells, so the learning curve is mostly \"where do I find things,\" not \"how does this work\" — walkthroughs are part of getting set up.",
  },
  {
    question: "What if my business is unusual — will the pipeline actually fit?",
    answer:
      "Pipeline stages are configured around your actual sales process during setup, not left as a generic default you have to adapt to.",
  },
];

const STEPS = [
  {
    icon: ClipboardList,
    title: "Tell us about your business",
    body: "How you currently handle leads, what tools you're already using, and where things tend to slip — a spreadsheet, a shared inbox, a CRM that doesn't fit anymore. No technical setup required on your end for this part.",
  },
  {
    icon: Settings2,
    title: "We configure your systems",
    body: "Contacts imported, pipeline stages built around how you actually sell, and a follow-up sequence configured — not a generic default template, one matched to your business.",
  },
  {
    icon: Plug2,
    title: "Connect what you already use",
    body: "Your sending email, a phone number for SMS and calls, and your calendar. Existing contacts come with you — nothing gets re-entered by hand.",
  },
  {
    icon: Rocket,
    title: "Go live",
    body: "Most teams are running within days, not months. You keep working the way you already do; the system is just underneath it now, catching what used to slip.",
  },
];

export default async function ImplementationPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: IMPLEMENTATION_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="marketing-accent flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 text-center md:py-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Implementation</p>
            <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              What getting started{" "}
              <span className="font-serif font-normal italic">actually looks like</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Not a self-serve wizard you have to figure out alone — a short, direct process from
              first conversation to running system.
            </p>
          </div>
        </section>

        <section className="pb-16 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-3xl gap-5">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <div key={title} className="flex gap-5 rounded-2xl border bg-card p-6 sm:p-7">
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tighter sm:text-4xl">
                Already using something else?
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Existing contacts and data come with you — implementation includes bringing your
                current system over, not asking you to start from a blank slate.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button render={<Link href="/contact" />} size="lg" className="px-6 text-base">
                  Talk through your setup
                </Button>
                <Button render={<Link href="/faq" />} variant="outline" size="lg" className="px-6 text-base">
                  Read the FAQ
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Onboarding FAQ</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Questions about getting set up
              </h2>
            </div>
            <div className="mx-auto mt-10">
              <FaqAccordion items={IMPLEMENTATION_FAQS} />
            </div>
          </div>
        </section>

        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
