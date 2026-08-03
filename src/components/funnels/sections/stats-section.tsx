import type { StatsConfig } from "@/types/funnels";

// Renders nothing when empty — real numbers only, same discipline as
// TestimonialsConfig. See that type's doc comment.
export function StatsSection({
  config,
  accentColor,
}: {
  config: StatsConfig;
  accentColor: string;
}) {
  if (config.items.length === 0) return null;
  const cols = config.items.length <= 2 ? "sm:grid-cols-2" : config.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";

  return (
    <section className="px-4 py-10">
      <div className={`mx-auto grid max-w-4xl grid-cols-2 gap-6 text-center ${cols}`}>
        {config.items.map((s, i) => (
          <div key={i}>
            <p
              className="font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)", color: accentColor }}
            >
              {s.value}
            </p>
            <p className="mt-1 text-sm opacity-70">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
