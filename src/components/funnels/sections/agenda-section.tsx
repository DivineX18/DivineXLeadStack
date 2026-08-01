import type { AgendaConfig } from "@/types/funnels";

export function AgendaSection({
  config,
  accentColor,
}: {
  config: AgendaConfig;
  accentColor: string;
}) {
  if (config.days.length === 0) return null;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-7 text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
          Everything you&apos;ll learn
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {config.days.map((day, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-[var(--card-bg)] p-6 shadow-[0_12px_30px_-15px_rgba(0,0,0,0.25)]"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2%, transparent)",
                  borderColor: `${accentColor}26`,
                } as React.CSSProperties
              }
            >
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
              >
                {day.label}
              </span>
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
          ))}
        </div>
      </div>
    </section>
  );
}
