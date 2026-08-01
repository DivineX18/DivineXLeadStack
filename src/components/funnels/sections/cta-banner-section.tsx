import type { CtaBannerConfig } from "@/types/funnels";

export function CtaBannerSection({
  config,
  accentColor,
}: {
  config: CtaBannerConfig;
  accentColor: string;
}) {
  return (
    <section className="px-4 py-16">
      <div
        className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl px-6 py-12 text-center shadow-[0_20px_60px_-20px_var(--accent-shadow)]"
        style={
          {
            backgroundImage: `linear-gradient(135deg, ${accentColor}22, ${accentColor}08)`,
            "--accent-shadow": `${accentColor}40`,
          } as React.CSSProperties
        }
      >
        <h2 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">
          {config.headline}
        </h2>
        {config.subtext && (
          <p className="mx-auto mt-2.5 max-w-md opacity-70">{config.subtext}</p>
        )}
        <a
          href={config.ctaHref}
          className="mt-7 inline-flex items-center gap-2 rounded-xl px-9 py-4 text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-transform hover:scale-[1.03]"
          style={{ backgroundColor: accentColor }}
        >
          {config.ctaLabel}
        </a>
      </div>
    </section>
  );
}
