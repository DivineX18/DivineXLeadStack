import Link from "next/link";
import { ClipboardList, Settings2, Plug2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Implementation — ${brand.name}`,
    description: `What getting started with ${brand.name} actually looks like: tell us about your business, we configure your systems, connect what you already use, and go live in days.`,
    openGraph: { title: `Implementation — ${brand.name}`, type: "website" as const },
  };
}

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

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
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

        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
