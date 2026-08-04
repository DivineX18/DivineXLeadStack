import { Minus, ArrowRight } from "lucide-react";
import type { BeforeAfterConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

export function BeforeAfterSection({
  config,
  accentColor,
}: {
  config: BeforeAfterConfig;
  accentColor: string;
}) {
  if (config.beforeItems.length === 0 && config.afterItems.length === 0) {
    return (
      <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
        <div className="mx-auto max-w-4xl">
          <MediaPlaceholder
            label="This section has no content yet — add it in the builder"
            accentColor={accentColor}
            className="min-h-32"
          />
        </div>
      </section>
    );
  }
  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto grid max-w-4xl items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div
          className="border border-black/[0.06] bg-black/[0.02] p-7 dark:border-white/[0.08] dark:bg-white/[0.03]"
          style={{ borderRadius: "var(--flow-radius, 1rem)" }}
        >
          <p className="mb-4 text-xs font-bold tracking-wide uppercase opacity-50">
            {config.beforeHeadline || "Before"}
          </p>
          <ul className="space-y-3 text-sm">
            {config.beforeItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 opacity-70">
                <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden items-center justify-center sm:flex">
          <ArrowRight className="h-6 w-6 opacity-30" style={{ color: accentColor }} />
        </div>
        <div
          className="border p-7"
          style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d`, borderRadius: "var(--flow-radius, 1rem)" }}
        >
          <p
            className="mb-4 text-xs font-bold tracking-wide uppercase"
            style={{ color: accentColor }}
          >
            {config.afterHeadline || "After"}
          </p>
          <ul className="space-y-3 text-sm">
            {config.afterItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 font-medium">
                <ArrowRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: accentColor }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
