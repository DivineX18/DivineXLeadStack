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
  // Sales-letter layout: a CENTERED single-column flowing checklist (icon +
  // title + text in a narrow column), NOT a 3-column boxed card grid. The card
  // grid read as a "website"; this reads as one continuous letter — the whole
  // point of a Brunson-style funnel.
  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-2xl">
        {config.headline && (
          <h2
            className="mb-9 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)", lineHeight: 1.1 }}
          >
            {config.headline}
          </h2>
        )}
        <div className="flex flex-col gap-6">
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
              <div key={i} className="flex items-start gap-4">
                <span
                  className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={badgeStyle}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold tracking-tight">{item.title}</h3>
                  {item.description && (
                    <p className="mt-1 leading-relaxed opacity-80">{item.description}</p>
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
