import type { PhotoGalleryConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

/**
 * Phase 3 — "more than one photo." Distinct from Hero's single media slot
 * (which stays a clean headline image or logo-only) and from
 * ImageTextConfig's paired-copy blocks — this is a pure visual gallery an
 * operator can grow independently, the natural home for "photos of our
 * work" on a local-service page.
 */
export function PhotoGallerySection({
  config,
  accentColor,
}: {
  config: PhotoGalleryConfig;
  accentColor: string;
}) {
  const images = config.images ?? [];
  // Asset-fallback rule: with no REAL images the composition adapts — the
  // section renders nothing rather than a giant placeholder dead zone.
  if (images.length === 0) return null;
  const layout = config.layout ?? "grid";

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-5xl">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}

        {images.length === 0 ? (
          <MediaPlaceholder
            label={config.placeholderLabel!}
            accentColor={accentColor}
            className="aspect-[21/9] w-full"
          />
        ) : layout === "before_after" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {images.slice(0, 2).map((img, i) => (
              <figure key={i} className="overflow-hidden" style={{ borderRadius: "var(--flow-radius, 1rem)" }}>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <span
                    className="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {i === 0 ? "Before" : "After"}
                  </span>
                </div>
                {img.caption && <figcaption className="mt-2 text-center text-sm opacity-70">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : layout === "carousel" ? (
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {images.map((img, i) => (
              <figure key={i} className="w-[75vw] shrink-0 snap-start sm:w-[340px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.caption ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover shadow-sm"
                  style={{ borderRadius: "var(--flow-radius, 1rem)" }}
                />
                {img.caption && <figcaption className="mt-2 text-sm opacity-70">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : layout === "masonry" ? (
          <div className="columns-2 gap-4 sm:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {images.map((img, i) => (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.caption ?? ""}
                  loading="lazy"
                  className="w-full object-cover shadow-sm"
                  style={{ borderRadius: "var(--flow-radius, 1rem)" }}
                />
                {img.caption && <figcaption className="mt-1.5 text-sm opacity-70">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <div className={`grid grid-cols-2 gap-4 ${images.length >= 3 ? "sm:grid-cols-3" : ""}`}>
            {images.map((img, i) => (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.caption ?? ""}
                  loading="lazy"
                  className="aspect-square w-full object-cover shadow-sm"
                  style={{ borderRadius: "var(--flow-radius, 1rem)" }}
                />
                {img.caption && <figcaption className="mt-1.5 text-sm opacity-70">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
