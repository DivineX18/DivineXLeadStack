import Link from "next/link";
import { Inbox, MessageCircle, Users2, Receipt, LineChart, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Platform — ${brand.name}`,
    description: `How ${brand.name} works: capture leads, respond instantly, organize the follow-up, get paid, and see what's working — one operating system, not five tools stitched together.`,
    openGraph: { title: `Platform — ${brand.name}`, type: "website" as const },
  };
}

const STAGES = [
  {
    icon: Inbox,
    step: "Capture",
    title: "Every lead lands somewhere real",
    body: "A form on your site, a booking page, a web chat widget — every one of them writes straight into a real contact record, with the campaign it came from attached. Nothing sits in an inbox waiting to be copied somewhere else.",
  },
  {
    icon: MessageCircle,
    step: "Respond",
    title: "Someone — or something — answers immediately",
    body: "A form submit can trigger an SMS and email within seconds. An AI agent can answer web chat, SMS, WhatsApp, and phone calls around the clock, qualify the lead, and hand off a summary. You decide how much of the first response is automated and how much stays hands-on.",
  },
  {
    icon: Users2,
    step: "Organize",
    title: "Nothing falls through because nothing's scattered",
    body: "Contacts, a six-stage pipeline, a calendar, and a task list — the same four things a growing team actually uses, connected to each other instead of living in four different apps.",
  },
  {
    icon: Receipt,
    step: "Close & get paid",
    title: "Quoting and payment collection without the back-and-forth",
    body: "Build a line-itemed quote, send it, and the client can accept or pay from their inbox. Accepted quotes can auto-create a won deal, so the pipeline stays honest without extra data entry.",
  },
  {
    icon: LineChart,
    step: "Understand",
    title: "See what's actually working",
    body: "Date-range KPIs, a pipeline funnel, a won-revenue trend, and a leads-by-source breakdown — the numbers you'd otherwise be exporting to a spreadsheet to figure out.",
  },
  {
    icon: Plug,
    step: "Connect",
    title: "It plugs into what you already run",
    body: "A public REST API and outbound webhooks mean Zapier, Make, or a custom script can read and write the same data your team sees — you're not locked into working only inside the app.",
  },
];

export default async function PlatformPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
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

        <div id="pricing-cta">
          <CustomCTA brand={brand} />
        </div>
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
