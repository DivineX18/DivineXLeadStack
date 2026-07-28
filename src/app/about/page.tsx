import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { LANDING_VARIANT } from "@/config/landing";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as LeadStackNavbar } from "@/components/landing/navbar";
import { Footer as LeadStackFooter } from "@/components/landing/footer";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { ChatCta, ChatLink } from "./chat-cta";

/**
 * About page — branches on LANDING_VARIANT like every other dual-render
 * page in this codebase. "leadstack" keeps the original template-seller
 * bio (Melbourne software company, their own app portfolio) unchanged.
 * "custom" (the default — this deployment, Flow) renders DivineX's own
 * About content instead; it previously hard 404'd on this variant.
 */

export async function generateMetadata() {
  if (LANDING_VARIANT !== "leadstack") {
    const brand = await resolveCustomBrand();
    return {
      title: `About — ${brand.name}`,
      description: `${brand.name} is the growth operations platform in the DivineX ecosystem — built to run the day-to-day of a growing business: leads, follow-up, pipeline, and getting paid, in one place.`,
      openGraph: { title: `About — ${brand.name}`, type: "website" as const },
    };
  }
  return {
    title: "About us",
    description:
      "We are a small software development company based in Melbourne, Australia, building practical web apps.",
  };
}

const APPS = [
  {
    name: "LeadStack",
    domain: "leadstack.dev",
    href: "https://leadstack.dev",
    blurb: "All-in-one, white-label CRM for agencies and small teams.",
  },
  {
    name: "GitPage",
    domain: "gitpage.site",
    href: "https://gitpage.site",
    blurb: "Marketing sites and landing pages, generated and live in minutes.",
  },
  {
    name: "SigmaSEO",
    domain: "sigmaseo.io",
    href: "https://sigmaseo.io",
    blurb: "SEO tooling to audit, optimise, and grow organic search traffic.",
  },
];

const PRINCIPLES = [
  {
    title: "Operations, not another dashboard",
    body: "A CRM that just stores data is a filing cabinet. The point isn't to look at your pipeline — it's for the pipeline to actually move, with follow-up that happens whether or not you remembered to do it.",
  },
  {
    title: "Consolidation over sprawl",
    body: "A texting tool, a booking tool, a quoting tool, and a spreadsheet that don't talk to each other is how leads fall through the cracks. One record, one system, is the whole premise.",
  },
  {
    title: "Automation with a human in the loop",
    body: "AI agents handle the immediate first response — the moment that actually determines whether a lead sticks around. Anything that needs judgment routes to a real person, on purpose, every time.",
  },
];

export default async function AboutPage() {
  if (LANDING_VARIANT !== "leadstack") {
    const brand = await resolveCustomBrand();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;

    return (
      <div className="flex min-h-screen flex-col">
        <OrganizationSchema brand={brand} baseUrl={baseUrl} />
        <CustomNavbar brand={brand} />
        <main className="flex-1">
          <section className="py-20 text-center md:py-24">
            <div className="container mx-auto px-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">About</p>
              <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
                The growth operations platform{" "}
                <span className="font-serif font-normal italic">in the DivineX ecosystem</span>.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                {brand.name} is built by DivineX, provided by Jade&rsquo;s Gems &amp; SOULutions
                LLC. It exists to run the operational side of a growing business — capturing
                leads, responding fast, keeping a pipeline honest, and getting paid — after the
                strategy work is done.
              </p>
            </div>
          </section>

          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl">
                <h2 className="text-2xl font-semibold tracking-tighter sm:text-4xl">
                  Two products, one progression
                </h2>
                <p className="mt-4 text-muted-foreground">
                  DivineX runs on two connected phases: understand the business, then improve it.
                  Ascend, DivineX&rsquo;s business-intelligence product, helps a business figure
                  out what actually needs to change — its primary growth constraint, a blueprint,
                  a roadmap. {brand.name} is where that plan gets executed day to day: the
                  contacts, pipeline, follow-up, and booking that turn a strategy into completed
                  work. Each stands on its own — {brand.name} doesn&rsquo;t require Ascend to be
                  useful — but together they cover the full loop from diagnosis to execution.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t py-16 md:py-20">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Principles</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                  What actually shapes how {brand.name} is built
                </h2>
              </div>
              <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
                {PRINCIPLES.map(({ title, body }) => (
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
                <h2 className="text-2xl font-semibold tracking-tighter sm:text-4xl">Get in touch</h2>
                <p className="mt-4 text-muted-foreground">
                  {brand.name} is provided by Jade&rsquo;s Gems &amp; SOULutions LLC, doing
                  business as DivineX, based in Houston, Texas. Questions about the product,
                  pricing, or anything else —{" "}
                  <Link href="/contact" className="text-primary hover:underline">
                    reach out directly
                  </Link>{" "}
                  or email{" "}
                  <a href={`mailto:${brand.supportEmail}`} className="text-primary hover:underline">
                    {brand.supportEmail}
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <CustomCTA brand={brand} />
        </main>
        <CustomFooter brand={brand} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <LeadStackNavbar />

      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 sm:py-28">
          {/* Intro */}
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-violet-500">
              About us
            </p>
            <h1 className="mt-3 text-lg font-semibold leading-relaxed">
              We are a small software development company based in Melbourne, Australia.
            </h1>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                We design and build practical web apps and digital tools that
                help businesses capture leads, launch online, and grow. A small
                team shipping focused, dependable software.
              </p>
              <p>
                Established in 2007, we&apos;ve been building software for well
                over a decade. Since 2021, our focus has been on developing
                tools and resources that help solopreneurs and small businesses
                grow and scale online &mdash; leveraging AI and AI agents.
              </p>
              <p>
                Beyond application development, we also provide coaching and
                training to help you grow in the online space and make the most
                of AI tools and resources.
              </p>
              <p>
                If you have any questions about us or would like more
                information, contact us via the <ChatLink>chat</ChatLink>.
              </p>
            </div>
          </div>

          {/* Apps */}
          <div className="mx-auto mt-16 max-w-3xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Our apps
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {APPS.map((app) => (
                <a
                  key={app.domain}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-2xl border bg-card p-5 transition-colors hover:border-violet-500/50"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">{app.name}</p>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-violet-500" />
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-violet-500">
                    {app.domain}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {app.blurb}
                  </p>
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="mx-auto mt-16 max-w-3xl rounded-2xl border bg-muted/30 p-8 text-center">
            <h2 className="text-xl font-semibold">Want to know more?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For further information, get in touch with us via chat.
            </p>
            <div className="mt-5 flex justify-center">
              <ChatCta />
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-3xl text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to home
            </Link>
          </div>
        </section>
      </main>

      <LeadStackFooter />
    </div>
  );
}
