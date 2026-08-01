import { PublicForm } from "@/components/forms/public-form";
import type { TicketTiersConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return cents === 0 ? "$0" : `$${(cents / 100).toFixed(0)}`;
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
    <section className="px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Select your ticket
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {config.tiers.map((tier, i) => {
            const form = tier.formId ? forms[tier.formId] : null;
            return (
              <div
                key={i}
                className="rounded-2xl border p-6"
                style={
                  tier.highlighted
                    ? { borderColor: accentColor, borderWidth: 2 }
                    : { borderColor: "rgba(128,128,128,0.2)" }
                }
              >
                <h3 className="text-lg font-bold">{tier.name}</h3>
                <p className="mt-1 text-3xl font-extrabold" style={{ color: accentColor }}>
                  {formatPrice(tier.priceCents)}
                </p>
                {tier.features.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm opacity-85">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex gap-2">
                        <span style={{ color: accentColor }}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5">
                  {form ? (
                    <PublicForm form={form} />
                  ) : (
                    <a
                      href={tier.ctaHref || "#"}
                      className="block rounded-lg px-6 py-3 text-center text-sm font-semibold text-white shadow"
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
