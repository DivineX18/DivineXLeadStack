import type { VideoConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

/**
 * Renders a real embed when `embedUrl` is set. Otherwise still renders the
 * section — an honest placeholder instead of `return null` — so a VSL/webinar
 * funnel whose Video stage was seeded without a real link (the common case
 * when the operator never gave one) doesn't just silently vanish from the
 * page; the gap is visible and obviously needs filling in, matching the
 * MediaPlaceholder convention used everywhere else (hero, story, team).
 */
export function VideoSection({
  config,
  accentColor,
}: {
  config: VideoConfig;
  accentColor: string;
}) {
  return (
    <section className="px-4 py-10" style={{ paddingBlock: "var(--flow-py, 2.5rem)" }}>
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
        {config.embedUrl ? (
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
        ) : (
          <MediaPlaceholder
            label={config.placeholderLabel || "Add your video"}
            accentColor={accentColor}
            className="mx-auto aspect-video max-w-2xl"
          />
        )}
      </div>
    </section>
  );
}
