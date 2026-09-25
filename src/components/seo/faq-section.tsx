import Link from "next/link";
import { FaqAccordion, type FaqItem } from "@/components/landing-custom/faq-accordion";
import { faqSchema } from "@/lib/seo/schema";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * AN FAQ AND ITS MARKUP, TOGETHER.
 *
 * The homepage already rendered six questions and emitted no FAQPage schema
 * at all: the content was there, and search engines were told nothing about
 * it. Elsewhere the questions and the JSON-LD were written out separately on
 * each page, which is two lists that have to be kept identical by hand.
 *
 * Here they come from one array. Marking up a question that is not on the
 * page is against Google's structured-data guidelines and risks a manual
 * action, so making that impossible is the point of the component rather
 * than a convenience.
 */
export function FaqSection({
  items,
  heading = "Frequently",
  headingAccent = "asked",
  intro,
  supportEmail,
  showFullFaqLink = true,
  id = "faq",
}: {
  items: FaqItem[];
  heading?: string;
  headingAccent?: string;
  intro?: string;
  supportEmail?: string;
  showFullFaqLink?: boolean;
  id?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="border-t py-24">
      <JsonLd data={faqSchema(items)} />
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            {heading}{" "}
            <span className="font-serif font-normal italic">{headingAccent}</span>
          </h2>
          {intro ? (
            <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
          ) : null}
          {(showFullFaqLink || supportEmail) && (
            <p className="mt-4 text-lg text-muted-foreground">
              {showFullFaqLink ? (
                <Link href="/faq" className="text-primary hover:underline">
                  See the full FAQ
                </Link>
              ) : null}
              {showFullFaqLink && supportEmail ? ", or email " : null}
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-primary hover:underline"
                >
                  {supportEmail}
                </a>
              ) : null}
              .
            </p>
          )}
        </div>
        <div className="mt-12">
          <FaqAccordion items={items} />
        </div>
      </div>
    </section>
  );
}
