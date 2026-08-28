import { PackageCheck } from "lucide-react";
import type { IncludedConfig } from "@/types/funnels";

export function IncludedSection({
  config,
  accentColor,
  iconPalette,
  iconStyle,
}: {
  config: IncludedConfig;
  accentColor: string;
  iconPalette?: string[];
  iconStyle?: "outline" | "duotone" | "filled";
}) {
  if (config.items.length === 0) return null;

  // Business Reality Engine (slice E): "deliverable_preview" — the real
  // deliverable contents presented as a framed document, explicitly
  // labeled an example. Answers "what does the thing I receive actually
  // look like" without fabricating a historical artifact.
  if (config.variant === "deliverable_preview") {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto max-w-3xl">
          {config.headline && (
            <h2
              className="mb-8 text-balance text-center font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
            >
              {config.headline}
            </h2>
          )}
          <div className="overflow-hidden rounded-2xl border shadow-[0_18px_50px_-18px_rgba(0,0,0,0.25)]" style={{ borderColor: `${accentColor}2e` }}>
            <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: `${accentColor}22`, backgroundColor: `${accentColor}0d` }}>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/20" />
              </div>
              <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ borderColor: `${accentColor}44` }}>
                Example preview
              </span>
            </div>
            <div className="space-y-4 bg-white/60 px-6 py-6 dark:bg-white/5">
              {config.items.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: accentColor }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold tracking-tight">{item.title}</p>
                    {item.description && <p className="mt-0.5 text-sm leading-relaxed opacity-70">{item.description}</p>}
                    <div className="mt-2 space-y-1.5" aria-hidden>
                      <div className="h-1.5 w-4/5 rounded-full bg-black/[0.07] dark:bg-white/10" />
                      <div className="h-1.5 w-3/5 rounded-full bg-black/[0.07] dark:bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-3xl">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        <div className="space-y-3">
          {config.items.map((item, i) => {
            const badgeColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
            const badgeStyle: React.CSSProperties =
              iconStyle === "filled"
                ? { backgroundColor: badgeColor, color: "#fff" }
                : iconStyle === "outline"
                  ? { backgroundColor: "transparent", color: badgeColor, boxShadow: `inset 0 0 0 1.5px ${badgeColor}55` }
                  : { backgroundColor: `${badgeColor}1a`, color: badgeColor };
            return (
            <div
              key={i}
              className="flex items-start gap-4 border bg-[var(--card-bg)] p-5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2.5%, transparent)",
                  borderRadius: "var(--flow-radius, 1rem)",
                } as React.CSSProperties
              }
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={badgeStyle}
              >
                <PackageCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold tracking-tight">{item.title}</p>
                {item.description && (
                  <p className="mt-1 text-sm leading-relaxed opacity-75">
                    {item.description}
                  </p>
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
