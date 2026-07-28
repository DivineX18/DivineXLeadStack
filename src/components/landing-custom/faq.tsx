import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { FaqAccordion } from "./faq-accordion";

export const HOMEPAGE_FAQS = [
  {
    question: "How do I get started?",
    answer:
      "No technical setup on your end. Tell us about your business, and we configure your systems — contacts, pipeline, follow-up, everything — and connect the tools you already use. Most teams are running within days.",
  },
  {
    question: "How do imports work?",
    answer:
      "Send us your existing contacts — a spreadsheet, another system, wherever they live now — and we bring them in clean, matched, and ready to work from. No manual re-entry.",
  },
  {
    question: "What about email and SMS?",
    answer:
      "Every conversation lives in one place. Send from any contact profile in one click, and replies route straight back to your inbox — no shared mailbox, nothing to copy-paste.",
  },
  {
    question: "How fast can I get a website live?",
    answer:
      "A marketing site or a focused sales page, live in 1–3 minutes once we hit build. Pick a template that fits your business, fill in the details, and it's up.",
  },
  {
    question: "Is my data safe?",
    answer:
      "Your workspace is yours alone — only you and the people you invite can access it. Data is encrypted at rest, and you can export everything as a CSV whenever you want.",
  },
  {
    question: "Do you have an API?",
    answer:
      "Yes — if your team wants to connect its own tools, the API and integrations give you that flexibility. Most clients never need to touch it; we handle the setup for you.",
  },
];

export function FAQ({ brand }: { brand: ResolvedBrand }) {
  return (
    <section id="faq" className="border-t py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Frequently{" "}
            <span className="font-serif font-normal italic">asked</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            <Link href="/faq" className="text-primary hover:underline">
              See the full FAQ
            </Link>
            , or email{" "}
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-primary hover:underline"
            >
              {brand.supportEmail}
            </a>
            .
          </p>
        </div>

        <div className="mx-auto mt-12">
          <FaqAccordion items={HOMEPAGE_FAQS} />
        </div>
      </div>
    </section>
  );
}
