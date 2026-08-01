import { Play } from "lucide-react";
import type { HeroConfig } from "@/types/funnels";

export function HeroSection({
  config,
  accentColor,
}: {
  config: HeroConfig;
  accentColor: string;
}) {
  const hasMedia = config.mediaType !== "none" && config.mediaUrl;
  return (
    <section
      className="relative overflow-hidden px-4 pb-14 pt-16 sm:pt-24"
      style={{
        backgroundImage: `radial-gradient(ellipse 80% 60% at 50% -10%, ${accentColor}26, transparent)`,
      }}
    >
      <div className="relative mx-auto max-w-3xl text-center">
        {config.eyebrow && (
          <p
            className="mx-auto mb-5 inline-block rounded-full border px-4 py-1.5 text-sm font-semibold tracking-tight"
            style={{
              backgroundColor: `${accentColor}14`,
              color: accentColor,
              borderColor: `${accentColor}33`,
            }}
          >
            {config.eyebrow}
          </p>
        )}
        <h1 className="text-balance text-[2.5rem] font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
          {config.headline}
        </h1>
        {config.subheadline && (
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed opacity-70">
            {config.subheadline}
          </p>
        )}

        {config.mediaType !== "none" && (
          <div
            className="group relative mx-auto mt-10 aspect-video max-w-2xl overflow-hidden rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10"
            style={
              !hasMedia
                ? {
                    background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}0d)`,
                  }
                : undefined
            }
          >
            {hasMedia ? (
              config.mediaType === "video" ? (
                <iframe
                  src={config.mediaUrl}
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.mediaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg ring-4 ring-white/40 transition-transform group-hover:scale-110 dark:ring-black/30"
                  style={{ backgroundColor: accentColor }}
                >
                  <Play className="ml-1 h-6 w-6 fill-white text-white" />
                </span>
              </div>
            )}
          </div>
        )}

        {config.ctaLabel && config.ctaHref && (
          <a
            href={config.ctaHref}
            className="mt-10 inline-flex items-center gap-2 rounded-xl px-9 py-4 text-base font-bold text-white shadow-[0_8px_24px_-6px_var(--accent-shadow)] transition-transform hover:scale-[1.03]"
            style={
              {
                backgroundColor: accentColor,
                "--accent-shadow": `${accentColor}80`,
              } as React.CSSProperties
            }
          >
            {config.ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}
