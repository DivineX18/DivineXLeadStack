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
};

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

  return (
    <>
      {/* Forces html/body background so next-themes' system-preference
       *  class on <html> can't leak a mismatched background through —
       *  same fix the public form page (/f/[formId]) already applies. */}
      <style>{`html, body { background: ${bg} !important; background-color: ${bg} !important; }`}</style>
      <div
        style={{ background: bg, color: fg, fontFamily: SYSTEM_FONT_STACK }}
        className="min-h-screen"
      >
        {funnel.sections.map((section) => {
          const Component = SECTION_COMPONENTS[section.type];
          if (!Component) return null;
          return (
            <Component
              key={section.id}
              config={section.config}
              accentColor={funnel.accentColor}
              theme={funnel.theme}
              forms={forms}
            />
          );
        })}
      </div>
    </>
  );
}
