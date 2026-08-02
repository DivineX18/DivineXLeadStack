import { Minus, ArrowRight } from "lucide-react";
import type { BeforeAfterConfig } from "@/types/funnels";

export function BeforeAfterSection({
  config,
  accentColor,
}: {
  config: BeforeAfterConfig;
  accentColor: string;
}) {
  if (config.beforeItems.length === 0 && config.afterItems.length === 0) return null;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto grid max-w-4xl items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-7 dark:border-white/[0.08] dark:bg-white/[0.03]">
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
          className="rounded-2xl border p-7"
          style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d` }}
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
