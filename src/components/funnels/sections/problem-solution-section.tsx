import { X, Check } from "lucide-react";
import type { ProblemSolutionConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

export function ProblemSolutionSection({
  config,
  accentColor,
}: {
  config: ProblemSolutionConfig;
  accentColor: string;
}) {
  if (!config.problemText && !config.solutionText) {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto max-w-5xl">
          <MediaPlaceholder
            label="This section has no content yet — add it in the builder"
            accentColor={accentColor}
            className="min-h-32"
          />
        </div>
      </section>
    );
  }
  // Art-direction variant: "before_after" — the transformation VISUALIZED as
  // two strongly contrasting panels with a directional transition (muted
  // "before" state → accent-bright "after" state). Used by urgent campaigns
  // (hot home → cool home) and rational-confidence campaigns; same content the
  // model already wrote, re-presented as a transformation, never new claims.
  if (config.variant === "before_after") {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto grid max-w-4xl items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div
            className="flex flex-col p-7 opacity-90"
            style={{
              borderRadius: "var(--flow-radius, 1rem)",
              background: "color-mix(in oklab, currentColor 5%, transparent)",
            }}
          >
            <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-55">
              <X className="h-3.5 w-3.5" /> Before
            </span>
            {config.problemHeadline && (
              <h3 className="text-balance font-extrabold tracking-tight" style={{ fontSize: "clamp(1.25rem, 2.8vw, 1.7rem)", lineHeight: 1.16 }}>
                {config.problemHeadline}
              </h3>
            )}
            {config.problemText && <p className="mt-3 leading-relaxed opacity-75">{config.problemText}</p>}
          </div>
          <div className="flex items-center justify-center" aria-hidden>
            <span
              className="flex h-11 w-11 rotate-90 items-center justify-center rounded-full text-white shadow-lg sm:rotate-0"
              style={{ backgroundColor: accentColor, boxShadow: `0 12px 30px -10px ${accentColor}99` }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>
          <div
            className="flex flex-col border p-7"
            style={{
              borderRadius: "var(--flow-radius, 1rem)",
              borderColor: `${accentColor}44`,
              background: `linear-gradient(180deg, ${accentColor}14, ${accentColor}06)`,
            }}
          >
            <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>
              <Check className="h-3.5 w-3.5" /> After
            </span>
            {config.solutionHeadline && (
              <h3 className="text-balance font-extrabold tracking-tight" style={{ fontSize: "clamp(1.25rem, 2.8vw, 1.7rem)", lineHeight: 1.16 }}>
                {config.solutionHeadline}
              </h3>
            )}
            {config.solutionText && <p className="mt-3 leading-relaxed opacity-90">{config.solutionText}</p>}
          </div>
        </div>
      </section>
    );
  }

  // Sales-letter narrative (default): the problem stated plainly, a visual
  // "turn", then the solution — STACKED in a narrow centered column, flowing
  // like a letter, not two side-by-side website cards.
  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 text-center">
        <div>
          <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50">
            <X className="h-3.5 w-3.5" /> The problem
          </span>
          {config.problemHeadline && (
            <h3
              className="text-balance font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.4rem, 3.6vw, 2.1rem)", lineHeight: 1.14 }}
            >
              {config.problemHeadline}
            </h3>
          )}
          {config.problemText && (
            <p className="mx-auto mt-3 max-w-xl text-[1.08rem] leading-relaxed opacity-80">{config.problemText}</p>
          )}
        </div>
        <div
          className="mx-auto h-9 w-px"
          style={{ background: `linear-gradient(to bottom, transparent, ${accentColor})` }}
        />
        <div>
          <span
            className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
            style={{ color: accentColor }}
          >
            <Check className="h-3.5 w-3.5" /> The fix
          </span>
          {config.solutionHeadline && (
            <h3
              className="text-balance font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.4rem, 3.6vw, 2.1rem)", lineHeight: 1.14 }}
            >
              {config.solutionHeadline}
            </h3>
          )}
          {config.solutionText && (
            <p className="mx-auto mt-3 max-w-xl text-[1.08rem] leading-relaxed opacity-90">{config.solutionText}</p>
          )}
        </div>
      </div>
    </section>
  );
}
