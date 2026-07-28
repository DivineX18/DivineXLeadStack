import Link from "next/link";
import { Inbox, MessageCircle, Users2, Receipt, LineChart } from "lucide-react";
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
    title: `Platform — ${brand.name} Growth Operations Platform`,
    description: `How ${brand.name} works: capture leads, respond instantly with AI agents, organize the follow-up in a real pipeline, get paid, and see what's working — one growth operations platform, not five tools stitched together.`,
    openGraph: { title: `Platform — ${brand.name}`, type: "website" as const },
  };
}

const WHO_ITS_FOR = [
  { title: "Service businesses", body: "Coaches, consultants, agencies, and local service providers running on referrals and inbound leads that need a real system underneath them." },
  { title: "Small sales teams", body: "A handful of people who all need to see the same pipeline and the same contact history — without paying for enterprise CRM seats." },
  { title: "Anyone tired of tool sprawl", body: "If your lead flow currently touches a spreadsheet, a shared inbox, a separate texting app, and a calendar tool that don't talk to each other, this replaces the seams." },
];

const PLATFORM_FAQS: FaqItem[] = [
  {
    question: "Is this a CRM, a growth operations platform, or both?",
    answer:
      "Both, in the sense that matters: it's a CRM (contacts, pipeline, calendar, tasks) with the operational layer — AI-driven response, quoting, booking, and reporting — built in, rather than bolted on as separate paid add-ons from different vendors.",
  },
  {
    question: "Do I have to use every part of it?",
    answer:
      "No. Most teams start with contacts and pipeline, then turn on AI agents, booking pages, or quoting as they're ready. Nothing forces an all-or-nothing rollout.",
  },
  {
    question: "Does it replace tools I'm already paying for?",
    answer:
      "For most teams, yes — a separate texting tool, a booking-link tool, a basic quoting tool, and spreadsheet-based reporting are usually the first things people consolidate in.",
  },
  {
    question: "How is this different from a generic CRM?",
    answer:
      "A generic CRM stores contacts and deals and stops there. The response layer — AI agents answering chat, SMS, WhatsApp, and calls, plus speed-to-lead automation — is what actually closes the gap between a lead arriving and someone following up.",
  },
];

// Same five stages as the homepage's journey visualization (Capture,
// Convert, Deliver, Retain, Understand) — kept identical on purpose so
// the story doesn't change shape between pages, just depth.
const STAGES = [
  {
    icon: Inbox,
    step: "Capture",
    title: "Every lead lands somewhere real",
    body: "A form on your site, a booking page, a web chat widget — every one of them writes straight into a real contact record, with the campaign it came from attached. Nothing sits in an inbox waiting to be copied somewhere else.",
  },
  {
    icon: MessageCircle,
    step: "Convert",
    title: "Someone — or something — answers immediately, and the deal moves",
    body: "A form submit can trigger an SMS and email within seconds. An AI agent can answer web chat, SMS, WhatsApp, and phone calls around the clock, qualify the lead, and hand it into a six-stage pipeline you can actually see move.",
  },
  {
    icon: Receipt,
    step: "Deliver",
    title: "Quoting and payment collection without the back-and-forth",
    body: "Build a line-itemed quote, send it, and the client can accept or pay from their inbox. Accepted quotes can auto-create a won deal, and bookings get an automatic confirmation — no extra data entry to keep either one honest.",
  },
  {
    icon: Users2,
    step: "Retain",
    title: "Every client's history, in one place",
    body: "Notes, messages, bookings, and quotes merge into one activity timeline per contact — a calendar and task list tied back to who they're about, so follow-up doesn't depend on anyone remembering.",
  },
  {
    icon: LineChart,
    step: "Understand",
    title: "See what's actually working",
    body: "Date-range KPIs, a pipeline funnel, a won-revenue trend, and a leads-by-source breakdown — the numbers you'd otherwise be exporting to a spreadsheet to figure out. A public API means a custom report can read the same data, too.",
  },
];

export default async function PlatformPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PLATFORM_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="relative overflow-hidden py-20 md:py-28">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.16_165)_/_16%,transparent_55%)]" />
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">The Platform</p>
              <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl">
                One system, not five tools{" "}
                <span className="font-serif font-normal italic">stitched together</span>.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
                {brand.name} follows a lead from the moment it arrives to the moment it&apos;s a paying
                client — capture, respond, organize, close, and understand, all reading from the
                same record.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button render={<a href="#pricing-cta" />} size="lg" className="px-6 text-base">
                  See plans
                </Button>
                <Button render={<Link href="/features" />} variant="outline" size="lg" className="px-6 text-base">
                  Browse every feature
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-4xl gap-6">
              {STAGES.map(({ icon: Icon, step, title, body }, i) => (
                <div
                  key={step}
                  className="group relative flex gap-5 rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-7"
                >
                  <div className="flex shrink-0 flex-col items-center">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    {i < STAGES.length - 1 && (
                      <span className="mt-2 h-full w-px flex-1 bg-border" aria-hidden="true" />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{step}</p>
                    <h2 className="mt-1 text-lg font-semibold sm:text-xl">{title}</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-semibold tracking-tighter sm:text-4xl">
                One login. One record. <span className="font-serif font-normal italic">One bill.</span>
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Every stage above shares the same contact record and the same activity timeline — a
                lead that starts as a form submission and ends as a paid quote never has to be
                re-entered anywhere along the way.
              </p>
              <div className="mt-8">
                <Button render={<Link href="/features" />} size="lg" className="px-6 text-base">
                  See every feature in detail
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Who it&apos;s for</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Built for teams that outgrew a spreadsheet
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
              {WHO_ITS_FOR.map(({ title, body }) => (
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
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Platform FAQ</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Common questions about the platform
              </h2>
            </div>
            <div className="mx-auto mt-10">
              <FaqAccordion items={PLATFORM_FAQS} />
            </div>
          </div>
        </section>

        <div id="pricing-cta">
          <CustomCTA brand={brand} />
        </div>
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
