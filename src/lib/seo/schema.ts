/**
 * STRUCTURED DATA.
 *
 * Pure builders, no React and no request access, so the same shapes can be
 * unit-tested and reused by any surface. Two rules run through all of them:
 *
 *  1. Nothing is invented. No aggregateRating, no reviewCount, no author who
 *     does not exist. Fabricated review markup is a manual-action risk, and
 *     it is the same integrity line the rest of this codebase already holds
 *     for generated website copy.
 *  2. Every builder drops empty fields rather than emitting null or "",
 *     because a property present but empty is worse than absent.
 */

type Json = Record<string, unknown>;

const clean = (o: Json): Json =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    ),
  );

/** Site identity. One per surface, emitted from the root layout. */
export function websiteSchema(input: {
  name: string;
  url: string;
  description?: string;
  publisherName?: string;
}): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${input.url}#website`,
    name: input.name,
    url: input.url,
    description: input.description,
    publisher: input.publisherName
      ? { "@type": "Organization", name: input.publisherName }
      : undefined,
    inLanguage: "en",
  });
}

/**
 * The trail a crawler shows under the result. Only emitted where there is a
 * real hierarchy: a breadcrumb on a top-level page is noise.
 */
export function breadcrumbSchema(
  items: { name: string; url: string }[],
): Json | null {
  if (items.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Questions and answers as they appear on the page, never more. */
export function faqSchema(
  faqs: { question: string; answer: string }[],
): Json | null {
  const usable = faqs.filter((f) => f.question?.trim() && f.answer?.trim());
  if (usable.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: usable.map((f) => ({
      "@type": "Question",
      name: f.question.trim(),
      acceptedAnswer: { "@type": "Answer", text: f.answer.trim() },
    })),
  };
}

/**
 * SoftwareApplication is the honest type for a SaaS product, and it is what
 * earns the price and category treatment in results. Product is kept for the
 * pricing page's plan offers, where the thing being described really is a
 * set of purchasable offers.
 */
export function softwareApplicationSchema(input: {
  name: string;
  url: string;
  description: string;
  category?: string;
  operatingSystem?: string;
  offers?: { price: string; currency: string; url: string; name?: string }[];
}): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.name,
    url: input.url,
    description: input.description,
    applicationCategory: input.category ?? "BusinessApplication",
    operatingSystem: input.operatingSystem ?? "Web",
    offers: (input.offers ?? []).map((o) =>
      clean({
        "@type": "Offer",
        name: o.name,
        price: o.price,
        priceCurrency: o.currency,
        url: o.url,
        availability: "https://schema.org/InStock",
      }),
    ),
  });
}

/** A capability sold as a service, for the platform and feature pages. */
export function serviceSchema(input: {
  name: string;
  url: string;
  description: string;
  providerName: string;
  areaServed?: string;
  serviceType?: string;
}): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    url: input.url,
    description: input.description,
    serviceType: input.serviceType,
    provider: { "@type": "Organization", name: input.providerName },
    areaServed: input.areaServed,
  });
}

/**
 * A written piece. `author` is only emitted when a real one is known: an
 * invented byline is a claim about a person.
 */
export function articleSchema(input: {
  headline: string;
  url: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName: string;
  image?: string;
  section?: string;
}): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline.slice(0, 110),
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    description: input.description,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: input.publisherName },
    publisher: { "@type": "Organization", name: input.publisherName },
    image: input.image,
    articleSection: input.section,
  });
}

/** A hub page that lists things, such as the industries or resources index. */
export function itemListSchema(
  items: { name: string; url: string }[],
): Json | null {
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
