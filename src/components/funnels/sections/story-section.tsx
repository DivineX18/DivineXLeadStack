import type { StoryConfig } from "@/types/funnels";

export function StorySection({ config }: { config: StoryConfig }) {
  if (config.paragraphs.length === 0) return null;
  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-4">
          {config.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.photoUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          )}
          <div>
            <p className="text-sm font-semibold opacity-70">{config.byline}</p>
            <div className="prose-sm mt-3 space-y-4 text-base leading-relaxed opacity-90">
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
