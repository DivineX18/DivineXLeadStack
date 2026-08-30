"use client";

import { BusinessFooterSection, TopIdentityStrip } from "@/components/funnels/sections/business-footer-section";
import { Archivo, Fraunces, Inter } from "next/font/google";
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
  business_footer: BusinessFooterSection,
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

/** Art-direction canvas treatments (per-section, assigned by the Campaign Art
 *  Direction layer — see lib/funnels/art-direction.ts). Overrides the
 *  archetype's rhythm-by-index background when a section carries `canvas`.
 *  All theme-safe: each value resolves sensibly on light AND dark pages. */
function canvasWrapStyle(
  canvas: NonNullable<FunnelDoc["sections"][number]["canvas"]>,
  pageDark: boolean,
  accentColor: string,
): React.CSSProperties {
  switch (canvas) {
    case "clean":
      return {};
    case "warm_paper":
      // A breath of surface change against the page ground.
      return { backgroundColor: pageDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)" };
    case "brand_tint":
      return {
        backgroundImage: `linear-gradient(180deg, ${accentColor}14 0%, ${accentColor}05 100%)`,
      };
    case "photographic": // v1: designed immersive fallback — never a fabricated stock photo
    case "dark_immersive":
      return pageDark
        ? {
            backgroundColor: "rgba(255,255,255,0.045)",
            backgroundImage: `radial-gradient(70% 55% at 50% 0%, ${accentColor}26, transparent 70%)`,
          }
        : {
            backgroundColor: "#0a0a0a",
            color: "#f5f5f5",
            backgroundImage: `radial-gradient(70% 55% at 50% 0%, ${accentColor}33, transparent 70%), linear-gradient(180deg, #0c0c0c, #060606)`,
          };
    case "high_contrast_cta":
      return {
        backgroundImage: `linear-gradient(135deg, ${accentColor}, color-mix(in oklab, ${accentColor} 65%, black))`,
        color: "#ffffff",
      };
  }
}

const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Premium funnel typography (the visual port of the approved design target):
// Archivo for oversized display headlines, Inter for body, Fraunces for the
// editorial serif accent. Loaded via next/font (self-hosted, CSP-safe, no
// layout shift) and exposed as CSS variables so the render can apply display
// vs body vs serif independently — a big step up from the old single system
// stack that made every funnel read as generic.
const displaySans = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--flow-font-display",
  display: "swap",
});
const bodySans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--flow-font-body",
  display: "swap",
});
const accentSerif = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--flow-font-serif",
  display: "swap",
});
const FONT_VARS = `${displaySans.variable} ${bodySans.variable} ${accentSerif.variable}`;

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
  previewMode = false,
}: {
  funnel: FunnelDoc;
  forms: Record<string, LeadForm>;
  /** Authenticated draft preview (Production Experience 2.0): renders the
   *  page exactly as it will publish, but suppresses every side-effecting
   *  action — no real leads, no automation firing, no production
   *  analytics. Set ONLY by the /app/preview route. */
  previewMode?: boolean;
}) {
  const dark = funnel.theme === "dark";
  // Warm off-white base instead of stark #fff — softens the "website" feel and
  // reads as an intentional sales-letter ground. Neutral-warm so it works under
  // any accent (orange/green/blue). Dark theme unchanged.
  const bg = dark ? "#0a0a0a" : "#faf9f6";
  const fg = dark ? "#f5f5f5" : "#0a0a0a";
  const tokens = resolveEffectiveDesignTokens(funnel);
  // Body reads in Inter for every archetype; headings take the display face —
  // Archivo for sans archetypes, Fraunces for serif/editorial ones.
  const headingIsSerif = tokens.headingFont === "serif";
  const bodyFamily = `var(--flow-font-body), ${SYSTEM_FONT_STACK}`;
  const headingFamily = headingIsSerif
    ? `var(--flow-font-serif), ${SERIF_FONT_STACK}`
    : `var(--flow-font-display), ${SYSTEM_FONT_STACK}`;
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
      <style>{`html, body { background: ${bg} !important; background-color: ${bg} !important; }
        .flow-funnel-root h1, .flow-funnel-root h2, .flow-funnel-root h3 { font-family: ${headingFamily}; letter-spacing: -0.02em; }
        .flow-funnel-root .flow-serif-accent { font-family: var(--flow-font-serif), ${SERIF_FONT_STACK}; font-style: italic; }`}</style>
      <div
        style={
          {
            background: bg,
            color: fg,
            fontFamily: bodyFamily,
            "--flow-py": DENSITY_TO_PY[tokens.visualDensity] ?? "3rem",
            "--flow-radius": RADIUS_TO_PX[tokens.borderRadiusStyle] ?? "0.75rem",
          } as React.CSSProperties
        }
        // A single-section (one-fold) page STRETCHES its section to fill the
        // viewport (flex-col + the child wrapper grows). Centering a fixed-
        // height block instead exposed bare page background above the hero's
        // own painted background (user QA: dead white band at the top) —
        // the section fills edge to edge and centers its own content.
        className={`flow-funnel-root ${FONT_VARS} min-h-screen${funnel.sections.length === 1 ? " flex flex-col [&>div]:flex-1 [&>div]:flex [&>div]:flex-col [&>div]:justify-center" : ""}${hasFixedBottomCta ? " pb-24" : ""}`}
      >
        {funnel.logoUrl && (
          <div className="flex justify-center px-4 pt-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={funnel.logoUrl} alt="" className="h-8 w-auto object-contain sm:h-10" />
          </div>
        )}
        {(() => {
          // Business Reality Engine: slim identity strip above the hero,
          // sourced from the business_footer section's verified data.
          const footerSec = funnel.sections.find((x) => x.type === "business_footer");
          return footerSec ? (
            <TopIdentityStrip
              config={footerSec.config as never}
              accentColor={funnel.accentColor}
            />
          ) : null;
        })()}
        {funnel.sections.map((section, i) => {
          const Component = SECTION_COMPONENTS[section.type];
          if (!Component) return null;
          // A section's art-direction canvas (when assigned) wins over the
          // archetype's rhythm-by-index background — that's what lets two
          // campaigns share components yet read structurally different.
          const bgStyle = section.canvas
            ? canvasWrapStyle(section.canvas, dark, funnel.accentColor)
            : backgroundWrapStyle(backgroundForIndex(tokens, i), dark, funnel.accentColor);
          return (
            <div key={section.id} style={bgStyle}>
              <AnimatedSection level={tokens.animationLevel} index={i}>
                <Component
                  config={section.config}
                  accentColor={funnel.accentColor}
                  theme={funnel.theme}
                  forms={forms}
                  previewMode={previewMode}
                  successRedirect={
                    funnel.status === "published"
                      ? funnel.bridge?.nextFunnelId
                        ? // Straight to the next offer — no extra click. The
                          // offer page shows a confirmation bar (?welcome=1)
                          // with the delivery note + download link, so the
                          // visitor still sees their signup landed.
                          `/lp/${funnel.bridge.nextFunnelId}?welcome=1&from=${funnel.id}`
                        : `/lp/${funnel.id}/thanks`
                      : undefined
                  }
                  captureSuccess={
                    funnel.status === "published" && !funnel.bridge?.nextFunnelId
                      ? {
                          message: funnel.leadMagnetAsset
                            ? "Check your inbox — your download is on its way to your email. You can also grab it right here:"
                            : "Check your inbox — everything you need is on its way to your email.",
                          downloadUrl: funnel.leadMagnetAsset?.url,
                          downloadName: funnel.leadMagnetAsset?.filename,
                        }
                      : undefined
                  }
                  published={funnel.status === "published"}
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
