import type { CtaBannerConfig } from "@/types/funnels";

export function CtaBannerSection({
  config,
  accentColor,
}: {
  config: CtaBannerConfig;
  accentColor: string;
}) {
  return (
    <section className="px-4 py-14">
      <div
        className="mx-auto max-w-2xl rounded-2xl px-6 py-10 text-center"
        style={{ backgroundColor: `${accentColor}14` }}
      >
        <h2 className="text-2xl font-bold sm:text-3xl">{config.headline}</h2>
        {config.subtext && (
          <p className="mx-auto mt-2 max-w-md opacity-80">{config.subtext}</p>
        )}
        <a
          href={config.ctaHref}
          className="mt-6 inline-block rounded-lg px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:scale-105"
          style={{ backgroundColor: accentColor }}
        >
          {config.ctaLabel}
        </a>
      </div>
    </section>
  );
}
