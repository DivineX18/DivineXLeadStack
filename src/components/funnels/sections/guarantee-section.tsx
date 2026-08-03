import { Shield, BadgeCheck, CircleCheck } from "lucide-react";
import type { GuaranteeConfig } from "@/types/funnels";

const ICONS = { shield: Shield, seal: BadgeCheck, check: CircleCheck } as const;

export function GuaranteeSection({
  config,
  accentColor,
}: {
  config: GuaranteeConfig;
  accentColor: string;
}) {
  if (!config.headline && !config.bodyText) return null;
  const Icon = ICONS[config.badgeIcon ?? "shield"];

  return (
    <section className="px-4 py-10">
      <div
        className="mx-auto flex max-w-xl items-start gap-4 border bg-[var(--card-bg)] p-6 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.25)] sm:items-center sm:p-7"
        style={
          {
            "--card-bg": "color-mix(in oklab, currentColor 3%, transparent)",
            borderColor: `${accentColor}26`,
            borderRadius: "var(--flow-radius, 1rem)",
          } as React.CSSProperties
        }
      >
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-inner"
          style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
        >
          <Icon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          {config.durationLabel && (
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: accentColor }}
            >
              {config.durationLabel}
            </p>
          )}
          {config.headline && (
            <h3 className="mt-0.5 text-lg font-bold tracking-tight">
              {config.headline}
            </h3>
          )}
          {config.bodyText && (
            <p className="mt-1.5 text-sm leading-relaxed opacity-75">
              {config.bodyText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
