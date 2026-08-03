import { CheckCircle2 } from "lucide-react";
import type { OfferConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { CtaButton } from "./cta-button";

function formatPrice(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function OfferSection({
  config,
  accentColor,
  forms,
  subAccountId,
}: {
  config: OfferConfig;
  accentColor: string;
  theme: "light" | "dark";
  forms: Record<string, LeadForm>;
  subAccountId?: string;
}) {
  const price = formatPrice(config.priceCents);
  const strikePrice = formatPrice(config.strikethroughPriceCents);
  const form = config.formId ? forms[config.formId] : null;

  return (
    <section className="px-4 py-8">
      <div
        className="relative mx-auto max-w-md overflow-hidden rounded-2xl border bg-[var(--card-bg)] p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:p-9"
        style={
          {
            "--card-bg": "color-mix(in oklab, currentColor 3%, transparent)",
            borderColor: `${accentColor}26`,
          } as React.CSSProperties
        }
      >
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: accentColor }}
        />

        {config.productImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.productImageUrl}
            alt=""
            className="mx-auto mb-6 max-h-52 rounded-lg shadow-lg"
          />
        )}
        {config.headline && (
          <h2
            className="text-balance text-center font-bold tracking-tight"
            style={{ fontSize: "clamp(1.25rem, 3vw, 1.625rem)", lineHeight: 1.2 }}
          >
            {config.headline}
          </h2>
        )}

        {(price || strikePrice) && (
          <p className="mt-4 flex items-baseline justify-center gap-2.5">
            {strikePrice && (
              <span className="text-lg opacity-40 line-through">
                {strikePrice}
              </span>
            )}
            {price && (
              <span
                className="text-4xl font-extrabold tracking-tight"
                style={{ color: accentColor }}
              >
                {price === "$0" ? "FREE" : price}
              </span>
            )}
          </p>
        )}

        {config.bullets.length > 0 && (
          <ul className="mx-auto mt-6 max-w-xs space-y-2.5 text-sm">
            {config.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: accentColor }}
                />
                <span className="opacity-85">{b}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7">
          <CtaButton
            label={config.ctaLabel}
            href={config.ctaHref}
            form={form}
            cta={config.cta}
            accentColor={accentColor}
            subAccountId={subAccountId}
            className="block w-full rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)]"
          />
        </div>
      </div>
    </section>
  );
}
