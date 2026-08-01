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
    <section className="px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Everything you&apos;ll learn
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {config.days.map((day, i) => (
            <div
              key={i}
              className="rounded-xl border border-black/10 p-5 dark:border-white/10"
            >
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
              >
                {day.label}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{day.title}</h3>
              {day.bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm opacity-80">
                  {day.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2">
                      <span style={{ color: accentColor }}>•</span>
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
