import { CheckCircle2 } from "lucide-react";
import { PublicForm } from "@/components/forms/public-form";
import type { TicketTiersConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function TicketTiersSection({
  config,
  accentColor,
  forms,
}: {
  config: TicketTiersConfig;
  accentColor: string;
  theme: "light" | "dark";
  forms: Record<string, LeadForm>;
}) {
  if (config.tiers.length === 0) return null;
  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-4xl">
        <h2
          className="mb-7 text-balance text-center font-extrabold tracking-tight"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
        >
          Select your ticket
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {config.tiers.map((tier, i) => {
            const form = tier.formId ? forms[tier.formId] : null;
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border bg-[var(--card-bg)] p-7 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_55px_-20px_rgba(0,0,0,0.4)]"
                style={
                  {
                    "--card-bg": "color-mix(in oklab, currentColor 2%, transparent)",
                    borderColor: tier.highlighted
                      ? accentColor
                      : "rgba(128,128,128,0.18)",
                    borderWidth: tier.highlighted ? 2 : 1,
                  } as unknown as React.CSSProperties
                }
              >
                {tier.highlighted && (
                  <span
                    className="absolute right-0 top-0 rounded-bl-xl px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    Popular
                  </span>
                )}
                <h3 className="text-lg font-bold tracking-tight">{tier.name}</h3>
                <p
                  className="mt-1.5 text-4xl font-extrabold tracking-tight"
                  style={{ color: accentColor }}
                >
                  {formatPrice(tier.priceCents)}
                </p>
                {tier.features.length > 0 && (
                  <ul className="mt-5 space-y-2.5 text-sm">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: accentColor }}
                        />
                        <span className="opacity-85">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-6">
                  {form ? (
                    <PublicForm form={form} />
                  ) : (
                    <a
                      href={tier.ctaHref || "#"}
                      className="block rounded-xl px-6 py-3.5 text-center text-sm font-bold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                      style={{ backgroundColor: accentColor }}
                    >
                      {tier.ctaLabel}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
