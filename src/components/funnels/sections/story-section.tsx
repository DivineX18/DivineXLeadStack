import type { StoryConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";
import { SplitLayout } from "./composition";
import { BeatVisual } from "./concept-visual";

export function StorySection({
  config,
  accentColor,
}: {
  config: StoryConfig;
  accentColor: string;
}) {
  if (config.paragraphs.length === 0) return null;

  const body = (
    <>
      <div className="mb-5 h-px w-12" style={{ backgroundColor: accentColor }} />
      <div className="flex items-start gap-4">
        {config.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.photoUrl}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-full object-cover shadow-md ring-2"
            style={{ borderColor: accentColor } as React.CSSProperties}
          />
        ) : (
          config.photoPlaceholderLabel && (
            <MediaPlaceholder
              label={config.photoPlaceholderLabel}
              accentColor={accentColor}
              shape="circle"
              className="h-14 w-14 shrink-0"
            />
          )
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight opacity-70">{config.byline}</p>
          <div className="mt-4 space-y-4 text-[1.05rem] leading-relaxed opacity-85">
            {config.paragraphs.map((p, i) =>
              i === 0 && config.paragraphs.length > 1 ? (
                <p key={i} className="flow-serif-accent text-[1.22rem] leading-snug opacity-95">
                  {p}
                </p>
              ) : (
                <p key={i}>{p}</p>
              ),
            )}
          </div>
        </div>
      </div>
    </>
  );

  // THE MECHANISM, BESIDE THE PICTURE OF IT. A letter that explains HOW the
  // work happens is the one place on most pages where a reader is already
  // studying, which is what a drawn relationship needs to be worth anything.
  if (config.beatVisual) {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <SplitLayout
          className="mx-auto max-w-6xl"
          mediaSide={config.beatVisual.side ?? "right"}
          emphasis="text"
          media={<BeatVisual visual={config.beatVisual} accentColor={accentColor} />}
        >
          {body}
        </SplitLayout>
      </section>
    );
  }

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-xl">
        <div
          className="mb-5 h-px w-12"
          style={{ backgroundColor: accentColor }}
        />
        <div className="flex items-start gap-4">
          {config.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.photoUrl}
              alt=""
              loading="lazy"
              className="h-14 w-14 shrink-0 rounded-full object-cover shadow-md ring-2"
              style={{ borderColor: accentColor } as React.CSSProperties}
            />
          ) : (
            config.photoPlaceholderLabel && (
              <MediaPlaceholder
                label={config.photoPlaceholderLabel}
                accentColor={accentColor}
                shape="circle"
                className="h-14 w-14 shrink-0"
              />
            )
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight opacity-70">
              {config.byline}
            </p>
            <div className="mt-4 space-y-4 text-[1.05rem] leading-relaxed opacity-85">
              {config.paragraphs.map((p, i) =>
                // Editorial lead-in: the first line of a multi-paragraph story
                // reads as a larger serif-italic pull (the design target's
                // personality touch). Single-paragraph stories stay plain.
                i === 0 && config.paragraphs.length > 1 ? (
                  <p
                    key={i}
                    className="flow-serif-accent text-[1.22rem] leading-snug opacity-95"
                  >
                    {p}
                  </p>
                ) : (
                  <p key={i}>{p}</p>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
