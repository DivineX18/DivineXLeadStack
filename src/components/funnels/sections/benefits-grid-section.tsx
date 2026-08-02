import {
  Check,
  Clock,
  Target,
  TrendingUp,
  Shield,
  Zap,
  Users,
  Star,
} from "lucide-react";
import type { BenefitIconType, BenefitsGridConfig } from "@/types/funnels";

const ICONS: Record<BenefitIconType, typeof Check> = {
  check: Check,
  clock: Clock,
  target: Target,
  trending: TrendingUp,
  shield: Shield,
  zap: Zap,
  users: Users,
  star: Star,
};

export function BenefitsGridSection({
  config,
  accentColor,
}: {
  config: BenefitsGridConfig;
  accentColor: string;
}) {
  if (config.items.length === 0) return null;
  const cols =
    config.items.length === 1
      ? "sm:grid-cols-1"
      : config.items.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-5xl">
        {config.headline && (
          <h2
            className="mb-10 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        <div className={`grid grid-cols-1 gap-5 ${cols}`}>
          {config.items.map((item, i) => {
            const Icon = ICONS[item.iconType ?? "check"];
            return (
              <div
                key={i}
                className="rounded-2xl border bg-[var(--card-bg)] p-6 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:ring-white/[0.06]"
                style={
                  {
                    "--card-bg": "color-mix(in oklab, currentColor 2.5%, transparent)",
                  } as React.CSSProperties
                }
              >
                <span
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold tracking-tight">{item.title}</h3>
                {item.description && (
                  <p className="mt-2 text-sm leading-relaxed opacity-75">
                    {item.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
