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
import { MediaPlaceholder } from "./media-placeholder";

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
  iconPalette,
  iconStyle,
}: {
  config: BenefitsGridConfig;
  accentColor: string;
  /** Design-pack icon-badge colors, cycled one-per-card instead of every
   *  card reusing the single accent color. Omitted = monochrome (today's
   *  behavior). */
  iconPalette?: string[];
  /** "duotone" (default, today's behavior) = tinted bg + colored icon.
   *  "filled" = solid accent bg + white icon (agency/bold). "outline" = no
   *  bg, colored icon only (luxury/professional, minimal icon usage). */
  iconStyle?: "outline" | "duotone" | "filled";
}) {
  if (config.items.length === 0) {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto max-w-5xl">
          {config.headline && (
            <h2
              className="mb-10 text-balance text-center font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
            >
              {config.headline}
            </h2>
          )}
          <MediaPlaceholder
            label="This section has no content yet — add it in the builder"
            accentColor={accentColor}
            className="min-h-32"
          />
        </div>
      </section>
    );
  }
  const cols =
    config.items.length === 1
      ? "sm:grid-cols-1"
      : config.items.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
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
                className="border bg-[var(--card-bg)] p-6 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:ring-white/[0.06]"
                style={
                  {
                    "--card-bg": "color-mix(in oklab, currentColor 2.5%, transparent)",
                    borderRadius: "var(--flow-radius, 1rem)",
                  } as React.CSSProperties
                }
              >
                <span
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={badgeStyle}
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
