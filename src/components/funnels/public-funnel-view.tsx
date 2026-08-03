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
import { ComparisonSection } from "./sections/comparison-section";
import { TestimonialsSection } from "./sections/testimonials-section";
import { StatsSection } from "./sections/stats-section";
import { CalloutSection } from "./sections/callout-section";
import { TeamSection } from "./sections/team-section";
import { ImageTextSection } from "./sections/image-text-section";
import { resolveDesignPack, backgroundForIndex, type SectionBackground } from "@/lib/funnels/design-packs";

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
  comparison: ComparisonSection,
  testimonials: TestimonialsSection,
  stats: StatsSection,
  callout: CalloutSection,
  team: TeamSection,
  image_text: ImageTextSection,
};

const SERIF_FONT_STACK = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

/** Section-background wrapper — the "avoid five white sections in a row"
 *  rule. Pure presentation, computed from the pack + section index; no
 *  schema field, so it costs nothing to change per-pack and can't drift
 *  out of sync with stored data. "dark"/"gray" locally invert text color
 *  only when that would actually contrast against the page's own base
 *  theme (kept as a safety net — none of the current packs' rhythms
 *  produce that combination, since a pack's "dark" entries only appear
 *  when the pack's own defaultTheme is already dark). */
function backgroundWrapStyle(bg: SectionBackground, pageDark: boolean, accentColor: string): React.CSSProperties {
  switch (bg) {
    case "white":
      return {};
    case "gray":
      return { backgroundColor: pageDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)" };
    case "gradient":
      return { backgroundImage: `linear-gradient(180deg, ${accentColor}14 0%, transparent 100%)` };
    case "dark":
      return pageDark ? {} : { backgroundColor: "#0a0a0a", color: "#f5f5f5" };
  }
}

const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
  const pack = resolveDesignPack(funnel.designPack);
  const fontStack = pack.headingFont === "serif" ? SERIF_FONT_STACK : SYSTEM_FONT_STACK;

  return (
    <>
      {/* Forces html/body background so next-themes' system-preference
       *  class on <html> can't leak a mismatched background through —
       *  same fix the public form page (/f/[formId]) already applies. */}
      <style>{`html, body { background: ${bg} !important; background-color: ${bg} !important; }`}</style>
      <div
        style={{ background: bg, color: fg, fontFamily: fontStack }}
        className="min-h-screen"
      >
        {funnel.sections.map((section, i) => {
          const Component = SECTION_COMPONENTS[section.type];
          if (!Component) return null;
          const bgStyle = backgroundWrapStyle(backgroundForIndex(pack, i), dark, funnel.accentColor);
          return (
            <div key={section.id} style={bgStyle}>
              <Component
                config={section.config}
                accentColor={funnel.accentColor}
                theme={funnel.theme}
                forms={forms}
                funnelId={funnel.id}
                sectionId={section.id}
                subAccountId={funnel.subAccountId}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
