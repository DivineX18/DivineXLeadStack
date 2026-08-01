import type { FaqConfig } from "@/types/funnels";

export function FaqSection({ config }: { config: FaqConfig }) {
  if (config.items.length === 0) return null;
  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {config.items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border border-black/10 p-4 dark:border-white/10"
            >
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                <span className="flex items-center justify-between gap-4">
                  {item.question}
                  <span className="shrink-0 text-lg opacity-50 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed opacity-80">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
