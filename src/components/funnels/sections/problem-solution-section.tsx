import { X, Check } from "lucide-react";
import type { ProblemSolutionConfig } from "@/types/funnels";

export function ProblemSolutionSection({
  config,
  accentColor,
}: {
  config: ProblemSolutionConfig;
  accentColor: string;
}) {
  if (!config.problemText && !config.solutionText) return null;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-7 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
            <X className="h-4 w-4 opacity-60" />
          </span>
          {config.problemHeadline && (
            <h3
              className="font-bold tracking-tight"
              style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.375rem)" }}
            >
              {config.problemHeadline}
            </h3>
          )}
          <p className="mt-3 text-sm leading-relaxed opacity-75">{config.problemText}</p>
        </div>
        <div
          className="rounded-2xl border p-7"
          style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d` }}
        >
          <span
            className="mb-4 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: `${accentColor}26`, color: accentColor }}
          >
            <Check className="h-4 w-4" />
          </span>
          {config.solutionHeadline && (
            <h3
              className="font-bold tracking-tight"
              style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.375rem)" }}
            >
              {config.solutionHeadline}
            </h3>
          )}
          <p className="mt-3 text-sm leading-relaxed opacity-85">{config.solutionText}</p>
        </div>
      </div>
    </section>
  );
}
