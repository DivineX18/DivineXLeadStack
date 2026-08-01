import { Plus } from "lucide-react";
import type { FaqConfig } from "@/types/funnels";

export function FaqSection({
  config,
  accentColor,
}: {
  config: FaqConfig;
  accentColor: string;
}) {
  if (config.items.length === 0) return null;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h2
          className="mb-7 text-balance text-center font-extrabold tracking-tight"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
        >
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {config.items.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl border bg-[var(--card-bg)] p-5 shadow-sm transition-shadow open:shadow-md"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2%, transparent)",
                } as React.CSSProperties
              }
            >
              <summary className="cursor-pointer list-none font-semibold marker:content-none">
                <span className="flex items-center justify-between gap-4">
                  {item.question}
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-45"
                    style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed opacity-75">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
