import type { VideoConfig } from "@/types/funnels";

export function VideoSection({
  config,
  accentColor,
}: {
  config: VideoConfig;
  accentColor: string;
}) {
  if (!config.embedUrl) return null;
  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-3xl text-center">
        {config.headline && (
          <h2
            className="mb-3 text-balance font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        {config.subtext && (
          <p className="mx-auto mb-8 max-w-xl opacity-70">{config.subtext}</p>
        )}
        <div
          className="relative mx-auto aspect-video overflow-hidden rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10"
          style={{ boxShadow: `0 20px 60px -15px ${accentColor}40` }}
        >
          <iframe
            src={config.embedUrl}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
