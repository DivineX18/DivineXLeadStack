import type { CtaBannerConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { CtaButton } from "./cta-button";

export function CtaBannerSection({
  config,
  accentColor,
  theme,
  subAccountId,
  ctaAnimationLevel,
  successRedirect,
  forms,
}: {
  config: CtaBannerConfig;
  accentColor: string;
  theme?: "light" | "dark";
  subAccountId?: string;
  ctaAnimationLevel?: "none" | "minimal" | "moderate" | "expressive";
  successRedirect?: string;
  forms?: Record<string, LeadForm>;
}) {
  const form = config.formId && forms ? forms[config.formId] ?? null : null;

  // Art-direction variant: "full_bleed_close" — the full-width, high-contrast
  // final close (big type on a solid accent field, inverted white button).
  // Paints its OWN background so it renders correctly regardless of the
  // section's canvas assignment.
  if (config.variant === "full_bleed_close") {
    return (
      <section
        className="px-4 text-center text-white"
        style={{
          paddingBlock: "clamp(3rem, 7vw, 5rem)",
          backgroundImage: `radial-gradient(70% 60% at 50% 0%, rgba(255,255,255,0.14), transparent 65%), linear-gradient(135deg, ${accentColor}, color-mix(in oklab, ${accentColor} 62%, black))`,
        }}
      >
        <div className="mx-auto max-w-3xl">
          <h2
            className="text-balance font-extrabold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5.5vw, 3.25rem)", lineHeight: 1.08 }}
          >
            {config.headline}
          </h2>
          {config.subtext && (
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/85">{config.subtext}</p>
          )}
          <div className="mt-8">
            <CtaButton
              label={config.ctaLabel}
              href={config.ctaHref}
              cta={config.cta}
              form={form}
              accentColor={accentColor}
              subAccountId={subAccountId}
              pageTheme={theme}
              animationLevel={ctaAnimationLevel}
              successRedirect={successRedirect}
              inverted
              className="inline-flex items-center justify-center gap-2 px-10 py-4 text-base font-bold shadow-[0_14px_40px_-10px_rgba(0,0,0,0.45)] transition-all duration-200 hover:-translate-y-0.5"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4" style={{ paddingBlock: "var(--flow-py, 3rem)" }}>
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
              successRedirect={successRedirect}
          />
        </div>
      </div>
    </section>
  );
}
