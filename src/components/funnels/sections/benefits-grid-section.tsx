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
  published,
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
  published?: boolean;
}) {
  // A section without valid content renders NOTHING on the customer-facing
  // page — never an empty band or a builder message (art-direction mandate).
  if (config.items.length === 0) return null;
  // Art-direction variant: "alternating_image" — zigzag image/text rows for
  // calm, people-led campaigns (comfort/reassurance reads through imagery, not
  // a checklist). Items render their real imageUrl when set; otherwise the
  // designed placeholder panel labeled with the item's subject, so the page
  // looks finished while telling the operator exactly what photo belongs there.
  // EVIDENCE COMPOSITION LAW: absence of evidence changes the COMPOSITION —
  // it never renders a visual stand-in for missing media. On the published
  // page, rows without a real image become full-width editorial text rows
  // (numbered, typography-led); if NO row has a real image the whole
  // section recomposes to the flowing-checklist letter layout. The builder
  // preview keeps the labeled placeholder panels (operator guidance).
  const realImageCount = config.items.filter((it) => !!it.imageUrl).length;
  const effectiveVariant =
    config.variant === "alternating_image" && published && realImageCount === 0
      ? undefined
      : config.variant;

  if (effectiveVariant === "alternating_image") {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto max-w-4xl">
          {config.headline && (
            <h2
              className="mb-10 text-balance text-center font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)", lineHeight: 1.1 }}
            >
              {config.headline}
            </h2>
          )}
          <div className="flex flex-col gap-10 sm:gap-12">
            {config.items.map((item, i) => {
              const Icon = ICONS[item.iconType ?? "check"];
              const badgeColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
              const flip = i % 2 === 1;
              if (published && !item.imageUrl) {
                // Editorial text row: the content carries itself.
                return (
                  <div key={i} className="mx-auto flex w-full max-w-2xl items-start gap-4">
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                      style={{ backgroundColor: badgeColor }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold tracking-tight">{item.title}</h3>
                      {item.description && <p className="mt-1.5 leading-relaxed opacity-80">{item.description}</p>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="grid items-center gap-5 sm:grid-cols-2 sm:gap-10">
                  <div className={flip ? "sm:order-2" : ""}>
                    <span
                      className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${badgeColor}1a`, color: badgeColor }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-xl font-bold tracking-tight">{item.title}</h3>
                    {item.description && (
                      <p className="mt-2 leading-relaxed opacity-80">{item.description}</p>
                    )}
                  </div>
                  <div className={flip ? "sm:order-1" : ""}>
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)]"
                        style={{ borderRadius: "var(--flow-radius, 0.75rem)" }}
                      />
                    ) : (
                      <MediaPlaceholder
                        label={item.title}
                        accentColor={accentColor}
                        tone="soft"
                        className="aspect-[4/3] w-full"
                      />
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

  // Sales-letter layout (default): a CENTERED single-column flowing checklist
  // (icon + title + text in a narrow column), NOT a 3-column boxed card grid.
  // The card grid read as a "website"; this reads as one continuous letter —
  // the whole point of a Brunson-style funnel.
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
