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
  // Sales-letter narrative: the problem stated plainly, a visual "turn", then
  // the solution — STACKED in a narrow centered column, flowing like a letter,
  // not two side-by-side website cards.
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
