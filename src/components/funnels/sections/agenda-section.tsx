import type { AgendaConfig } from "@/types/funnels";

export function AgendaSection({
  config,
  accentColor,
  iconPalette,
  iconStyle,
}: {
  config: AgendaConfig;
  accentColor: string;
  /** Cycled per-step circle color when a design pack provides one (the
   *  Soulware-reference "1/2/3" step treatment) — omitted = monochrome
   *  accent circles, today's behavior. */
  iconPalette?: string[];
  /** "outline" renders a bordered, transparent number circle instead of a
   *  solid one — luxury/professional archetypes' "minimal icon usage." */
  iconStyle?: "outline" | "duotone" | "filled";
}) {
  if (config.days.length === 0) return null;
  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-4xl">
        <h2
          className="mb-7 text-balance text-center font-extrabold tracking-tight"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
        >
          Everything you&apos;ll learn
        </h2>
        {/* Centered vertical timeline — steps flow down a single column with a
            connecting line, like a sales letter, not a 2-col card grid. */}
        <ol className="mx-auto flex max-w-2xl flex-col">
          {config.days.map((day, i) => {
            const stepColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
            const stepBadgeStyle: React.CSSProperties =
              iconStyle === "outline"
                ? { backgroundColor: "transparent", color: stepColor, boxShadow: `inset 0 0 0 1.5px ${stepColor}` }
                : { backgroundColor: stepColor, color: "#fff" };
            const isLast = i === config.days.length - 1;
            return (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
                    style={stepBadgeStyle}
                  >
                    {i + 1}
                  </span>
                  {!isLast && (
                    <span
                      className="my-1 w-px flex-1"
                      style={{ background: `linear-gradient(to bottom, ${accentColor}66, ${accentColor}1a)` }}
                    />
                  )}
                </div>
                <div className={`min-w-0 pt-1 ${isLast ? "" : "pb-7"}`}>
                  {day.label && (
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                      style={{ backgroundColor: `${stepColor}1a`, color: stepColor }}
                    >
                      {day.label}
                    </span>
                  )}
                  <h3 className="mt-2 text-lg font-bold tracking-tight">{day.title}</h3>
                  {day.bullets.length > 0 && (
                    <ul className="mt-2.5 space-y-2 opacity-80">
                      {day.bullets.map((b, j) => (
                        <li key={j} className="flex gap-2.5">
                          <span className="font-bold" style={{ color: accentColor }}>•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
