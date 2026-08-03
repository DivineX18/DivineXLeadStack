import { Quote } from "lucide-react";
import type { TestimonialsConfig } from "@/types/funnels";

// Renders nothing when empty — this section only ever shows quotes an
// operator or Zeno was actually given, never invented ones. See
// TestimonialsConfig's doc comment.
export function TestimonialsSection({
  config,
  accentColor,
}: {
  config: TestimonialsConfig;
  accentColor: string;
}) {
  if (config.items.length === 0) return null;
  const cols = config.items.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-2";

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-4xl">
        <div className={`grid grid-cols-1 gap-5 ${cols}`}>
          {config.items.map((t, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-[var(--card-bg)] p-6 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2.5%, transparent)",
                } as React.CSSProperties
              }
            >
              <Quote className="mb-3 h-6 w-6" style={{ color: `${accentColor}80` }} />
              <p className="text-[1.02rem] leading-relaxed opacity-90">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-semibold tracking-tight opacity-70">
                {t.name}
                {t.detail && <span className="font-normal opacity-70"> — {t.detail}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
