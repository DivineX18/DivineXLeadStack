import { Star } from "lucide-react";
import type { ProofStripConfig } from "@/types/funnels";

export function ProofStripSection({ config }: { config: ProofStripConfig }) {
  if (config.variant === "rating" && config.rating) {
    const { score, reviewCount, scale = 5 } = config.rating;
    if (!reviewCount) return null;
    return (
      <section className="px-4 py-5">
        <div className="mx-auto flex w-fit max-w-3xl items-center justify-center gap-2.5 rounded-full border bg-[var(--card-bg)] px-4 py-2 shadow-sm"
          style={
            {
              "--card-bg": "color-mix(in oklab, currentColor 3%, transparent)",
              borderColor: "rgba(128,128,128,0.16)",
            } as React.CSSProperties
          }
        >
          <div className="flex" style={{ color: "#f59e0b" }}>
            {Array.from({ length: scale }).map((_, i) => (
              <Star
                key={i}
                className="h-5 w-5 drop-shadow-sm"
                fill={i < Math.round(score) ? "currentColor" : "none"}
                strokeWidth={i < Math.round(score) ? 0 : 1.5}
              />
            ))}
          </div>
          <span className="text-sm font-semibold opacity-80">
            {score.toFixed(1)}
          </span>
          <span className="text-sm opacity-50">
            — {reviewCount.toLocaleString()} ratings
          </span>
        </div>
      </section>
    );
  }

  if (config.variant === "logos" && config.logos && config.logos.length > 0) {
    return (
      <section className="px-4 py-8">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest opacity-40">
          As seen in
        </p>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-60 grayscale transition-opacity hover:opacity-80">
          {config.logos.map((logo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={logo.url} alt={logo.alt} loading="lazy" className="h-6 sm:h-7" />
          ))}
        </div>
      </section>
    );
  }

  return null;
}
