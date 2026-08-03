"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PublicForm } from "@/components/forms/public-form";
import type { CheckoutConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

function formatPrice(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function CheckoutSection({
  config,
  accentColor,
  forms,
  funnelId,
  sectionId,
}: {
  config: CheckoutConfig;
  accentColor: string;
  theme: "light" | "dark";
  forms: Record<string, LeadForm>;
  funnelId: string;
  sectionId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = formatPrice(config.priceCents);
  const strikePrice = formatPrice(config.strikethroughPriceCents);
  const form = config.formId ? forms[config.formId] : null;
  const interval =
    config.billingMode === "subscription"
      ? config.recurringInterval === "year"
        ? "/yr"
        : "/mo"
      : "";

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lp/${funnelId}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Couldn't start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setLoading(false);
    }
  }

  return (
    <section className="px-4 py-8">
      <div
        className="relative mx-auto max-w-md overflow-hidden border bg-[var(--card-bg)] p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:p-9"
        style={
          {
            "--card-bg": "color-mix(in oklab, currentColor 3%, transparent)",
            borderColor: `${accentColor}26`,
            borderRadius: "var(--flow-radius, 1rem)",
          } as React.CSSProperties
        }
      >
        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />

        {config.productImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.productImageUrl}
            alt=""
            loading="lazy"
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
            {strikePrice && <span className="text-lg opacity-40 line-through">{strikePrice}</span>}
            {price && (
              <span
                className="text-4xl font-extrabold tracking-tight"
                style={{ color: accentColor }}
              >
                {price === "$0" ? "FREE" : price}
                {interval && (
                  <span className="text-base font-semibold opacity-60">{interval}</span>
                )}
              </span>
            )}
          </p>
        )}

        {config.bullets.length > 0 && (
          <ul className="mx-auto mt-6 max-w-xs space-y-2.5 text-sm">
            {config.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
                <span className="opacity-85">{b}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7">
          {config.checkoutMode === "stripe_checkout" ? (
            <>
              {config.orderBump && (
                <div
                  className="mb-4 rounded-lg border p-3 text-sm opacity-80"
                  style={{ borderColor: `${accentColor}33` }}
                >
                  <span className="font-semibold">
                    Add-on offered at checkout: {config.orderBump.headline}
                  </span>
                  {config.orderBump.priceCents ? (
                    <span className="ml-1">
                      (+{formatPrice(config.orderBump.priceCents)})
                    </span>
                  ) : null}
                  {config.orderBump.description && (
                    <span className="block">{config.orderBump.description}</span>
                  )}
                </div>
              )}
              {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)] disabled:opacity-60"
                style={
                  {
                    backgroundColor: accentColor,
                    "--accent-shadow": `${accentColor}80`,
                  } as React.CSSProperties
                }
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {config.ctaLabel}
              </button>
            </>
          ) : form ? (
            <PublicForm form={form} />
          ) : (
            <a
              href={config.ctaHref || "#"}
              className="block rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)]"
              style={
                {
                  backgroundColor: accentColor,
                  "--accent-shadow": `${accentColor}80`,
                } as React.CSSProperties
              }
            >
              {config.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
