"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { UpsellOfferConfig } from "@/types/funnels";

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function UpsellOfferSection({
  config,
  accentColor,
  funnelId,
  sectionId,
}: {
  config: UpsellOfferConfig;
  accentColor: string;
  theme: "light" | "dark";
  funnelId: string;
  sectionId: string;
}) {
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setLoading(accept ? "accept" : "decline");
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const checkoutSessionId = params.get("session_id");
      if (accept) {
        const res = await fetch(`/api/lp/${funnelId}/upsell/${sectionId}/charge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutSessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          nextUrl?: string;
          requiresAction?: boolean;
          error?: string;
        };
        if (data.requiresAction) {
          setError(
            "We couldn't charge your card automatically for this add-on. Your original order is unaffected.",
          );
          setLoading(null);
          if (data.nextUrl) window.location.href = data.nextUrl;
          return;
        }
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't process that.");
        window.location.href = data.nextUrl || `/lp/${funnelId}`;
      } else {
        const nextUrl = config.declineFunnelId
          ? `/lp/${config.declineFunnelId}${checkoutSessionId ? `?session_id=${checkoutSessionId}` : ""}`
          : `/lp/${funnelId}/thanks?paid=1`;
        window.location.href = nextUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that.");
      setLoading(null);
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
        <h2
          className="text-balance text-center font-bold tracking-tight"
          style={{ fontSize: "clamp(1.25rem, 3vw, 1.625rem)", lineHeight: 1.2 }}
        >
          {config.headline}
        </h2>

        <p
          className="mt-4 text-center text-4xl font-extrabold tracking-tight"
          style={{ color: accentColor }}
        >
          {formatPrice(config.priceCents)}
        </p>

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

        {error && <p className="mt-5 text-center text-sm text-red-600">{error}</p>}

        <div className="mt-7 space-y-3">
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-center text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_var(--accent-shadow)] disabled:opacity-60"
            style={
              {
                backgroundColor: accentColor,
                "--accent-shadow": `${accentColor}80`,
              } as React.CSSProperties
            }
          >
            {loading === "accept" && <Loader2 className="h-4 w-4 animate-spin" />}
            {config.acceptLabel}
          </button>
          <button
            type="button"
            onClick={() => respond(false)}
            disabled={loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-center text-sm font-medium opacity-60 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading === "decline" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {config.declineLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
