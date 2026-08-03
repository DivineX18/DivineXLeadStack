import { Check, X } from "lucide-react";
import type { ComparisonConfig } from "@/types/funnels";

export function ComparisonSection({
  config,
  accentColor,
}: {
  config: ComparisonConfig;
  accentColor: string;
}) {
  if (config.rows.length === 0) return null;
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
        <div
          className="overflow-hidden rounded-2xl border ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
          style={{ borderColor: `${accentColor}26` }}
        >
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-0 bg-[var(--card-bg)] px-5 py-3 text-xs font-bold tracking-wide uppercase opacity-60"
            style={{ "--card-bg": "color-mix(in oklab, currentColor 3%, transparent)" } as React.CSSProperties}
          >
            <span />
            <span className="w-16 text-center" style={{ color: accentColor }}>
              {config.usLabel}
            </span>
            <span className="w-16 text-center">{config.themLabel}</span>
          </div>
          {config.rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-black/[0.05] px-5 py-3.5 text-sm dark:border-white/[0.06]"
            >
              <span className="font-medium">{row.feature}</span>
              <span className="flex w-16 justify-center">
                {row.us ? (
                  <Check className="h-4 w-4" style={{ color: accentColor }} />
                ) : (
                  <X className="h-4 w-4 opacity-30" />
                )}
              </span>
              <span className="flex w-16 justify-center">
                {row.them ? (
                  <Check className="h-4 w-4 opacity-50" />
                ) : (
                  <X className="h-4 w-4 opacity-30" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
