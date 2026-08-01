import type { HeroConfig } from "@/types/funnels";

export function HeroSection({
  config,
  accentColor,
}: {
  config: HeroConfig;
  accentColor: string;
  theme: "light" | "dark";
}) {
  return (
    <section className="px-4 pb-10 pt-14 sm:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        {config.eyebrow && (
          <p
            className="mx-auto mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium"
            style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
          >
            {config.eyebrow}
          </p>
        )}
        <h1 className="text-balance text-4xl font-extrabold leading-tight sm:text-5xl">
          {config.headline}
        </h1>
        {config.subheadline && (
          <p className="mx-auto mt-4 max-w-xl text-lg opacity-80">
            {config.subheadline}
          </p>
        )}

        {config.mediaType === "video" && config.mediaUrl && (
          <div className="mx-auto mt-8 aspect-video max-w-2xl overflow-hidden rounded-2xl shadow-xl">
            <iframe
              src={config.mediaUrl}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {config.mediaType === "image" && config.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.mediaUrl}
            alt=""
            className="mx-auto mt-8 max-w-2xl rounded-2xl shadow-xl"
          />
        )}

        {config.ctaLabel && config.ctaHref && (
          <a
            href={config.ctaHref}
            className="mt-8 inline-block rounded-lg px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: accentColor }}
          >
            {config.ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}
