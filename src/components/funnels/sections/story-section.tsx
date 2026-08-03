import type { StoryConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

export function StorySection({
  config,
  accentColor,
}: {
  config: StoryConfig;
  accentColor: string;
}) {
  if (config.paragraphs.length === 0) return null;
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
              {config.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
