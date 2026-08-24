import type { CtaBannerConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { CtaButton } from "./cta-button";

export function CtaBannerSection({
  config,
  accentColor,
  theme,
  subAccountId,
  ctaAnimationLevel,
  forms,
}: {
  config: CtaBannerConfig;
  accentColor: string;
  theme?: "light" | "dark";
  subAccountId?: string;
  ctaAnimationLevel?: "none" | "minimal" | "moderate" | "expressive";
  forms?: Record<string, LeadForm>;
}) {
  const form = config.formId && forms ? forms[config.formId] ?? null : null;
  return (
    <section className="px-4 py-16">
      <div
        className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl px-6 py-12 text-center shadow-[0_20px_60px_-20px_var(--accent-shadow)]"
        style={
          {
            backgroundImage: `linear-gradient(135deg, ${accentColor}26, ${accentColor}0a 55%, transparent), radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}22, transparent)`,
            "--accent-shadow": `${accentColor}40`,
          } as React.CSSProperties
        }
      >
        <h2
          className="text-balance font-extrabold tracking-tight"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
        >
          {config.headline}
        </h2>
        {config.subtext && (
          <p className="mx-auto mt-2.5 max-w-md opacity-70">{config.subtext}</p>
        )}
        <div className="mt-7">
          <CtaButton
            label={config.ctaLabel}
            href={config.ctaHref}
            cta={config.cta}
            form={form}
            accentColor={accentColor}
            subAccountId={subAccountId}
            pageTheme={theme}
            animationLevel={ctaAnimationLevel}
          />
        </div>
      </div>
    </section>
  );
}
