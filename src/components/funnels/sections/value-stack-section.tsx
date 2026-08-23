import { Check } from "lucide-react";
import type { ValueStackConfig } from "@/types/funnels";

/**
 * The Grand-Slam / ClickFunnels value stack — real deliverables each with an
 * honest value, summed to a struck-through anchor total, then the real price
 * revealed beneath. Theme-safe (currentColor-based surfaces) so it reads on the
 * direct_response dark theme and any light archetype alike.
 */
export function ValueStackSection({
  config,
  accentColor,
  iconPalette,
  iconStyle,
}: {
  config: ValueStackConfig;
  accentColor: string;
  iconPalette?: string[];
  iconStyle?: "outline" | "duotone" | "filled";
}) {
  if (!config.items || config.items.length === 0) return null;

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-2xl">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}

        {/* The stack — one row per real deliverable, value on the right. */}
        <div
          className="overflow-hidden border ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
          style={{ borderRadius: "var(--flow-radius, 1rem)" }}
        >
          {config.items.map((item, i) => {
            const badgeColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
            const badgeStyle: React.CSSProperties =
              iconStyle === "outline"
                ? { backgroundColor: "transparent", color: badgeColor, boxShadow: `inset 0 0 0 1.5px ${badgeColor}55` }
                : iconStyle === "duotone"
                  ? { backgroundColor: `${badgeColor}1a`, color: badgeColor }
                  : { backgroundColor: badgeColor, color: "#fff" };
            return (
              <div
                key={i}
                className="flex items-start gap-4 border-b p-5 last:border-b-0"
                style={{ background: "color-mix(in oklab, currentColor 2.5%, transparent)", borderColor: "color-mix(in oklab, currentColor 10%, transparent)" }}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={badgeStyle}>
                  <Check className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tracking-tight">{item.title}</p>
                  {item.description && <p className="mt-1 text-sm leading-relaxed opacity-75">{item.description}</p>}
                </div>
                {item.value && (
                  <span className="shrink-0 self-center font-bold tabular-nums" style={{ color: accentColor }}>
                    {item.value}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Total value anchor — struck through so the price feels like a discount. */}
        {config.totalValueLabel && (
          <p className="mt-5 text-center text-lg font-semibold opacity-70">
            <span style={{ textDecoration: "line-through" }}>{config.totalValueLabel}</span>
          </p>
        )}

        {/* Price reveal — the payoff of the stack. */}
        {config.priceLabel && (
          <div
            className="mx-auto mt-3 max-w-md rounded-2xl border-2 px-6 py-5 text-center"
            style={{ borderColor: accentColor, background: `${accentColor}14` }}
          >
            <p className="font-extrabold tracking-tight" style={{ fontSize: "clamp(1.6rem, 5vw, 2.5rem)", color: accentColor, lineHeight: 1.1 }}>
              {config.priceLabel}
            </p>
            {config.footnote && <p className="mt-2 text-sm opacity-80">{config.footnote}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
