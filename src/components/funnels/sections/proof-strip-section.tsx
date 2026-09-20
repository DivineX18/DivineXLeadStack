import { Star } from "lucide-react";
import type { ProofStripConfig } from "@/types/funnels";
import { renderableEvidenceStrip } from "@/lib/funnels/evidence-proof";

export function ProofStripSection({ config }: { config: ProofStripConfig }) {
  if (config.variant === "rating" && config.rating) {
    const { score, reviewCount, scale = 5, href, source } = config.rating;
    if (!reviewCount) return null;
    const Wrap = href ? "a" : "div";
    return (
      <section className="px-4 py-5">
        <Wrap
          {...(href ? { href, target: "_blank", rel: "noopener noreferrer", title: "See our reviews" } : {})}
          className="mx-auto flex w-fit max-w-3xl items-center justify-center gap-2.5 rounded-full border bg-[var(--card-bg)] px-4 py-2 shadow-sm"
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
          {/* "4.9 from 127 Google reviews". The source is rendered verbatim
              and only when the business named one — a rating that cannot say
              whose reviews it is never reaches this component (see
              review-proof.ts), and legacy configs without a source keep the
              original wording rather than gaining an implied one. */}
          <span className="text-sm opacity-50">
            {source ? `from ${reviewCount.toLocaleString()} ${source} reviews` : `— ${reviewCount.toLocaleString()} ratings`}
          </span>
        </Wrap>
      </section>
    );
  }

  // THE LAST GATE BEFORE A THIRD-PARTY CLAIM REACHES A VISITOR.
  //
  // This block used to render whatever logos it was handed, under `heading ||
  // "As seen in"`. Both halves were load-bearing in the failure: an upstream
  // backfill supplied first-party website graphics as "evidence", and the
  // default heading turned them into a press claim nobody had made. A generic
  // fallback is never safe here, because the fallback IS the strongest
  // available assertion.
  //
  // So the strip re-establishes its own right to exist rather than trusting
  // the config: every mark must carry a verified category, the categories must
  // agree, and the heading must be the one that category earns. Anything else
  // renders nothing — including legacy strips written before this contract,
  // whose basis cannot be established after the fact.
  const evidence = renderableEvidenceStrip(config as Parameters<typeof renderableEvidenceStrip>[0]);
  if (evidence) {
    return (
      <section className="px-4 py-8">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest opacity-40">
          {evidence.heading}
        </p>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-60 grayscale transition-opacity hover:opacity-80">
          {evidence.logos.map((logo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={logo.url} alt={logo.alt} loading="lazy" className="h-6 sm:h-7" />
          ))}
        </div>
      </section>
    );
  }

  return null;
}
