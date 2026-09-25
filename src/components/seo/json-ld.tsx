/**
 * One way to put structured data on a page.
 *
 * Server-rendered into the HTML, so it is present for every crawler rather
 * than appearing after hydration. Nulls are accepted and dropped, which lets
 * a caller pass a builder's output straight through without guarding: a page
 * with no FAQs emits no FAQPage instead of an empty one.
 */
export function JsonLd({ data }: { data: unknown | (unknown | null)[] }) {
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
