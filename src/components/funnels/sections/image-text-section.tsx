import type { ImageTextConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

export function ImageTextSection({
  config,
  accentColor,
}: {
  config: ImageTextConfig;
  accentColor: string;
}) {
  if (config.blocks.length === 0) return null;

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-16">
        {config.blocks.map((b, i) => (
          <div
            key={i}
            className={`grid items-center gap-8 sm:grid-cols-2 ${b.imagePosition === "right" ? "" : ""}`}
          >
            <div className={b.imagePosition === "right" ? "sm:order-1" : "sm:order-2"}>
              {/* A composed media beat carries the page's own verified
                  sentence and no heading of its own; an empty <h3> would be a
                  blank line the reader has to step over. */}
              {b.headline && (
                <h3
                  className="text-balance font-extrabold tracking-tight"
                  style={{ fontSize: "clamp(1.375rem, 3.5vw, 1.875rem)", lineHeight: 1.2 }}
                >
                  {b.headline}
                </h3>
              )}
              <p className={`${b.headline ? "mt-4" : ""} text-[1.02rem] leading-relaxed opacity-80`}>{b.text}</p>
            </div>
            <div className={b.imagePosition === "right" ? "sm:order-2" : "sm:order-1"}>
              {b.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.imageUrl}
                  alt={b.imageAlt ?? b.headline ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:ring-white/10"
                  style={{ borderRadius: "var(--flow-radius, 1rem)" }}
                />
              ) : (
                <MediaPlaceholder label="Add an image" accentColor={accentColor} className="aspect-[4/3] w-full" />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
