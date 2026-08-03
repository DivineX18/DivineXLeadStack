import type { AgendaConfig } from "@/types/funnels";

export function AgendaSection({
  config,
  accentColor,
  iconPalette,
}: {
  config: AgendaConfig;
  accentColor: string;
  /** Cycled per-step circle color when a design pack provides one (the
   *  Soulware-reference "1/2/3" step treatment) — omitted = monochrome
   *  accent circles, today's behavior. */
  iconPalette?: string[];
}) {
  if (config.days.length === 0) return null;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h2
          className="mb-7 text-balance text-center font-extrabold tracking-tight"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
        >
          Everything you&apos;ll learn
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {config.days.map((day, i) => {
            const stepColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
            return (
            <div
              key={i}
              className="rounded-2xl border bg-[var(--card-bg)] p-6 shadow-[0_12px_30px_-15px_rgba(0,0,0,0.25)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_-18px_rgba(0,0,0,0.35)]"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2%, transparent)",
                  borderColor: `${accentColor}26`,
                } as React.CSSProperties
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
                  style={{ backgroundColor: stepColor, color: "#fff" }}
                >
                  {i + 1}
                </span>
                {day.label && (
                  <span
                    className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${stepColor}1a`, color: stepColor }}
                  >
                    {day.label}
                  </span>
                )}
              </div>
              <h3 className="mt-3.5 text-lg font-bold tracking-tight">
                {day.title}
              </h3>
              {day.bullets.length > 0 && (
                <ul className="mt-3.5 space-y-2 text-sm opacity-80">
                  {day.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2.5">
                      <span className="font-bold" style={{ color: accentColor }}>
                        •
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
