import { PublicForm } from "@/components/forms/public-form";
import type { OfferConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

function formatPrice(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export function OfferSection({
  config,
  accentColor,
  forms,
}: {
  config: OfferConfig;
  accentColor: string;
  theme: "light" | "dark";
  forms: Record<string, LeadForm>;
}) {
  const price = formatPrice(config.priceCents);
  const strikePrice = formatPrice(config.strikethroughPriceCents);
  const form = config.formId ? forms[config.formId] : null;

  return (
    <section className="px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-black/10 bg-black/[0.02] p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03] sm:p-8">
        {config.productImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.productImageUrl}
            alt=""
            className="mx-auto mb-5 max-h-48 rounded-lg"
          />
        )}
        {config.headline && (
          <h2 className="text-center text-xl font-bold">{config.headline}</h2>
        )}

        {(price || strikePrice) && (
          <p className="mt-3 text-center">
            {strikePrice && (
              <span className="mr-2 text-base opacity-50 line-through">
                {strikePrice}
              </span>
            )}
            {price && (
              <span className="text-2xl font-extrabold" style={{ color: accentColor }}>
                {price === "$0.00" ? "FREE" : price}
              </span>
            )}
          </p>
        )}

        {config.bullets.length > 0 && (
          <ul className="mx-auto mt-5 max-w-xs space-y-2 text-sm opacity-90">
            {config.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span style={{ color: accentColor }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          {form ? (
            <PublicForm form={form} />
          ) : (
            <a
              href={config.ctaHref || "#"}
              className="block rounded-lg px-6 py-3.5 text-center text-base font-semibold text-white shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: accentColor }}
            >
              {config.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
