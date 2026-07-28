import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { FaqAccordion, type FaqItem } from "@/components/landing-custom/faq-accordion";
import { HOMEPAGE_FAQS } from "@/components/landing-custom/faq";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `FAQ — ${brand.name}`,
    description: `Answers about getting started, billing, the AI agents, team access, and support on ${brand.name}.`,
    openGraph: { title: `FAQ — ${brand.name}`, type: "website" as const },
  };
}

const MORE_FAQS: FaqItem[] = [
  {
    question: "Is there a contract, or can I cancel anytime?",
    answer:
      "Billing is monthly with no minimum commitment. Cancel anytime and you keep access through the end of the period you've already paid for — no cancellation fee, no exit interview.",
  },
  {
    question: "Does the AI agent replace my team, or work alongside them?",
    answer:
      "Alongside. You set the business hours it operates in and the keywords that trigger an escalation to a real person — so it handles the immediate first response, and a human takes over anything that needs judgment.",
  },
  {
    question: "What happens if the AI agent can't answer something?",
    answer:
      "It's configured to recognize when a conversation needs a human — specific keywords or situations you define — and hands off with a task and a notification, rather than guessing.",
  },
  {
    question: "Can different people on my team have different access?",
    answer:
      "Yes. Team members are added with a role — full access to manage the workspace, or day-to-day access to the data without workspace settings — so you control who can do what.",
  },
  {
    question: "Can I send from my own phone number and email domain?",
    answer:
      "Yes, both are available as an opt-in upgrade — your own dedicated number for SMS and calls, and your own sending domain for email — so outbound messages carry your brand, not a shared one.",
  },
  {
    question: "What if something breaks or I need help?",
    answer:
      "Reach out directly — the contact page has the fastest way to get to a real person, not a ticket queue you have to wait on.",
  },
];

export default async function FaqPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const allFaqs = [...HOMEPAGE_FAQS, ...MORE_FAQS];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allFaqs.map((f) => ({
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
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">FAQ</p>
            <h1 className="mx-auto mt-2 max-w-2xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              Frequently <span className="font-serif font-normal italic">asked</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Can&apos;t find what you&apos;re looking for?{" "}
              <a href={`mailto:${brand.supportEmail}`} className="text-primary hover:underline">
                {brand.supportEmail}
              </a>
            </p>
          </div>
        </section>

        <section className="pb-20">
          <div className="container mx-auto px-4">
            <FaqAccordion items={allFaqs} />
          </div>
        </section>

        <section className="border-t py-16 text-center">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">Still have questions?</h2>
            <div className="mt-6">
              <Button render={<Link href="/contact" />} size="lg" className="px-6 text-base">
                Talk to us
              </Button>
            </div>
          </div>
        </section>
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
