import { Star } from "lucide-react";
import type { ProofStripConfig } from "@/types/funnels";

export function ProofStripSection({ config }: { config: ProofStripConfig }) {
  if (config.variant === "rating" && config.rating) {
    const { score, reviewCount, scale = 5 } = config.rating;
    if (!reviewCount) return null;
    return (
      <section className="px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2">
          <div className="flex" style={{ color: "#f59e0b" }}>
            {Array.from({ length: scale }).map((_, i) => (
              <Star
                key={i}
                className="h-5 w-5"
                fill={i < Math.round(score) ? "currentColor" : "none"}
              />
            ))}
          </div>
          <span className="text-sm font-medium opacity-80">
            {score.toFixed(1)} — {reviewCount.toLocaleString()} ratings
          </span>
        </div>
      </section>
    );
  }

  if (config.variant === "logos" && config.logos && config.logos.length > 0) {
    return (
      <section className="px-4 py-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-70 grayscale">
          {config.logos.map((logo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={logo.url} alt={logo.alt} className="h-6 sm:h-8" />
          ))}
        </div>
      </section>
    );
  }

  return null;
}
