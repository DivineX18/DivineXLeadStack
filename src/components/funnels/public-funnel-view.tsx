"use client";

import type { ComponentType } from "react";
import type { FunnelDoc, FunnelSectionType } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { HeroSection } from "./sections/hero-section";
import { ProofStripSection } from "./sections/proof-strip-section";
import { OfferSection } from "./sections/offer-section";
import { StorySection } from "./sections/story-section";
import { FaqSection } from "./sections/faq-section";
import { CtaBannerSection } from "./sections/cta-banner-section";
import { CountdownSection } from "./sections/countdown-section";
import { AgendaSection } from "./sections/agenda-section";
import { TicketTiersSection } from "./sections/ticket-tiers-section";
import { GuaranteeSection } from "./sections/guarantee-section";
import { TrustBadgesSection } from "./sections/trust-badges-section";
import { CheckoutSection } from "./sections/checkout-section";
import { UpsellOfferSection } from "./sections/upsell-offer-section";
import { VideoSection } from "./sections/video-section";
import { BenefitsGridSection } from "./sections/benefits-grid-section";
import { ProblemSolutionSection } from "./sections/problem-solution-section";
import { BeforeAfterSection } from "./sections/before-after-section";
import { IncludedSection } from "./sections/included-section";
import { ValueStackSection } from "./sections/value-stack-section";
import { ComparisonSection } from "./sections/comparison-section";
import { TestimonialsSection } from "./sections/testimonials-section";
import { StatsSection } from "./sections/stats-section";
import { CalloutSection } from "./sections/callout-section";
import { TeamSection } from "./sections/team-section";
import { ImageTextSection } from "./sections/image-text-section";
import { PhotoGallerySection } from "./sections/photo-gallery-section";
import { AnimatedSection } from "./sections/animated-section";
import { backgroundForIndex, type SectionBackground } from "@/lib/funnels/design-packs";
import { resolveEffectiveDesignTokens } from "@/lib/funnels/design-strategy";

/**
 * Maps a funnel's `sections[]` to its section component, mirroring the
 * engine.ts REGISTRY dispatch pattern from the Workflow Builder. Genre is
 * irrelevant here — this renders whatever sections actually exist, in
 * order; genre only shaped what the builder pre-seeded at creation.
 *
 * Loosely typed at the map level (each section component is individually
 * strongly typed on its own props) — a common, low-risk trade-off for a
 * heterogeneous component registry, same shape as engine.ts's own
 * `Partial<Record<WorkflowNodeType, NodeExecutor>>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<FunnelSectionType, ComponentType<any>> = {
  hero: HeroSection,
  proof_strip: ProofStripSection,
  offer: OfferSection,
  story: StorySection,
  faq: FaqSection,
  cta_banner: CtaBannerSection,
  countdown: CountdownSection,
  agenda: AgendaSection,
  ticket_tiers: TicketTiersSection,
  guarantee: GuaranteeSection,
  trust_badges: TrustBadgesSection,
  checkout: CheckoutSection,
  upsell_offer: UpsellOfferSection,
  video: VideoSection,
  benefits_grid: BenefitsGridSection,
  problem_solution: ProblemSolutionSection,
  before_after: BeforeAfterSection,
  included: IncludedSection,
  value_stack: ValueStackSection,
  comparison: ComparisonSection,
  testimonials: TestimonialsSection,
  stats: StatsSection,
  callout: CalloutSection,
  team: TeamSection,
  image_text: ImageTextSection,
  photo_gallery: PhotoGallerySection,
};

const SERIF_FONT_STACK = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

/** Section-background wrapper — the "avoid five white sections in a row"
 *  rule. Pure presentation, computed from the resolved tokens + section
 *  index; no schema field, so it costs nothing to change per-archetype and
 *  can't drift out of sync with stored data. "dark"/"gray"/"elevated"
 *  locally invert text color only when that would actually contrast
 *  against the page's own base theme. */
function backgroundWrapStyle(bg: SectionBackground, pageDark: boolean, accentColor: string): React.CSSProperties {
  switch (bg) {
    case "white":
      return {};
    case "gray":
      return { backgroundColor: pageDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)" };
    case "elevated":
      return {
        backgroundColor: pageDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)",
        boxShadow: pageDark ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "inset 0 1px 0 rgba(0,0,0,0.04)",
      };
    case "gradient":
      return { backgroundImage: `linear-gradient(180deg, ${accentColor}14 0%, transparent 100%)` };
    case "dark":
      return pageDark ? {} : { backgroundColor: "#0a0a0a", color: "#f5f5f5" };
  }
}

const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Vertical section padding per visual-density token — consumed via the
 *  `--flow-py` custom property every section component's outer <section>
 *  now reads (see sections/*.tsx). Sections without this token default to
 *  3rem (today's fixed py-12), so anything not yet wired stays unchanged. */
const DENSITY_TO_PY: Record<string, string> = {
  low: "5rem",
  medium: "3rem",
  high: "2rem",
};

/** Border-radius per geometry token — consumed via `--flow-radius`. */
const RADIUS_TO_PX: Record<string, string> = {
  square: "0.25rem",
  soft: "0.75rem",
  rounded: "1.25rem",
};

export function PublicFunnelView({
  funnel,
  forms,
}: {
  funnel: FunnelDoc;
  forms: Record<string, LeadForm>;
}) {
  const dark = funnel.theme === "dark";
  const bg = dark ? "#0a0a0a" : "#ffffff";
  const fg = dark ? "#f5f5f5" : "#0a0a0a";
  const tokens = resolveEffectiveDesignTokens(funnel);
  const fontStack = tokens.headingFont === "serif" ? SERIF_FONT_STACK : SYSTEM_FONT_STACK;
  // A sticky/floating CTA is a fixed-position bar overlaying the bottom of
  // the viewport — without this, it silently covers the last section's
  // content (FAQ answers, fine print) on short pages. Cheap to check
  // upfront and pad for, rather than leaving it to chance per-funnel.
  const hasFixedBottomCta = funnel.sections.some((s) => {
    const cta = (s.config as { cta?: { style?: string } }).cta;
    return cta?.style === "sticky_desktop" || cta?.style === "floating_mobile";
  });

  return (
    <>
      {/* Forces html/body background so next-themes' system-preference
       *  class on <html> can't leak a mismatched background through —
       *  same fix the public form page (/f/[formId]) already applies. */}
      <style>{`html, body { background: ${bg} !important; background-color: ${bg} !important; }`}</style>
      <div
        style={
          {
            background: bg,
            color: fg,
            fontFamily: fontStack,
            "--flow-py": DENSITY_TO_PY[tokens.visualDensity] ?? "3rem",
            "--flow-radius": RADIUS_TO_PX[tokens.borderRadiusStyle] ?? "0.75rem",
          } as React.CSSProperties
        }
        className={`min-h-screen${hasFixedBottomCta ? " pb-24" : ""}`}
      >
        {funnel.logoUrl && (
          <div className="flex justify-center px-4 pt-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={funnel.logoUrl} alt="" className="h-8 w-auto object-contain sm:h-10" />
          </div>
        )}
        {funnel.sections.map((section, i) => {
          const Component = SECTION_COMPONENTS[section.type];
          if (!Component) return null;
          const bgStyle = backgroundWrapStyle(backgroundForIndex(tokens, i), dark, funnel.accentColor);
          return (
            <div key={section.id} style={bgStyle}>
              <AnimatedSection level={tokens.animationLevel} index={i}>
                <Component
                  config={section.config}
                  accentColor={funnel.accentColor}
                  theme={funnel.theme}
                  forms={forms}
                  funnelId={funnel.id}
                  sectionId={section.id}
                  subAccountId={funnel.subAccountId}
                  iconPalette={tokens.iconPalette}
                  headlineGradient={tokens.headlineGradient}
                  iconStyle={tokens.iconStyle}
                  ctaAnimationLevel={tokens.animationLevel}
                />
              </AnimatedSection>
            </div>
          );
        })}
      </div>
    </>
  );
}
