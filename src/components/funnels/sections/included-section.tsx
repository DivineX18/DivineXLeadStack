import { PackageCheck } from "lucide-react";
import type { IncludedConfig } from "@/types/funnels";
import { DocumentShowcase, SectionShell } from "./composition";

export function IncludedSection({
  config,
  accentColor,
  iconPalette,
  iconStyle,
}: {
  config: IncludedConfig;
  accentColor: string;
  iconPalette?: string[];
  iconStyle?: "outline" | "duotone" | "filled";
}) {
  if (config.items.length === 0) return null;

  // Business Reality Engine (slice E): "deliverable_preview" — the real
  // deliverable contents presented as a framed document, explicitly
  // labeled an example. Answers "what does the thing I receive actually
  // look like" without fabricating a historical artifact.
  if (config.variant === "deliverable_preview") {
    return (
      <SectionShell width="content">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        {/* One implementation of the framed example, shared with the
            benefits grid's proof variant — the markup used to live only
            here, so a second section could not present a deliverable
            without copying it. */}
        <DocumentShowcase items={config.items} accentColor={accentColor} />
      </SectionShell>
    );
  }

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
      <div className="mx-auto max-w-3xl">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        <div className="space-y-3">
          {config.items.map((item, i) => {
            const badgeColor = iconPalette && iconPalette.length > 0 ? iconPalette[i % iconPalette.length] : accentColor;
            const badgeStyle: React.CSSProperties =
              iconStyle === "filled"
                ? { backgroundColor: badgeColor, color: "#fff" }
                : iconStyle === "outline"
                  ? { backgroundColor: "transparent", color: badgeColor, boxShadow: `inset 0 0 0 1.5px ${badgeColor}55` }
                  : { backgroundColor: `${badgeColor}1a`, color: badgeColor };
            return (
            <div
              key={i}
              className="flex items-start gap-4 border bg-[var(--card-bg)] p-5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
              style={
                {
                  "--card-bg": "color-mix(in oklab, currentColor 2.5%, transparent)",
                  borderRadius: "var(--flow-radius, 1rem)",
                } as React.CSSProperties
              }
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={badgeStyle}
              >
                <PackageCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold tracking-tight">{item.title}</p>
                {item.description && (
                  <p className="mt-1 text-sm leading-relaxed opacity-75">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
