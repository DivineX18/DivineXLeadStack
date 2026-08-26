/**
 * Campaign Art Direction (Increment 1 of docs/plans/flow-art-direction-upgrade.md).
 *
 * The layer that turns strategy into VISUAL COMPOSITION — the missing half the
 * audit found: the brain could decide "urgent, people-led, panic→relief" but
 * every funnel still rendered the same single-layout sections on the same
 * background rhythm. This module derives a Campaign Art Direction Profile from
 * model-supplied inputs and DETERMINISTICALLY maps it onto the composed
 * sections: per-section layout `variant`s + per-section `canvas` treatments.
 *
 * Design rules (locked in the plan):
 *  - The model supplies INPUTS (the emotional transformation + optional
 *    dimension overrides); this mapper composes. No per-business hardcoding —
 *    the same inputs always produce the same composition, so it's testable and
 *    generalizes to businesses we've never seen.
 *  - Pure: no LLM, no Firestore, no side effects.
 *  - Regression-safe: a baseline profile (no transformation, balanced
 *    dimensions) returns the sections UNTOUCHED — funnels created without
 *    art-direction inputs render exactly as before.
 *  - Never fabricates content: variants/canvases re-present content the model
 *    already wrote; nothing here invents copy, stats, imagery, or proof.
 */

import type { FunnelSection, SectionCanvas } from "@/types/funnels";
import type {
  BenefitsGridConfig,
  CtaBannerConfig,
  ProblemSolutionConfig,
} from "@/types/funnels";

// ─── Profile dimensions (reasoning axes, never customer-facing sliders) ────

export type CampaignEnergy = "calm" | "balanced" | "urgent";
export type CampaignDensity = "minimal" | "medium" | "rich";
export type CampaignHumanity = "product_led" | "balanced" | "people_led";

/** The buyer's current → desired emotional state. This is the single highest-
 *  leverage art-direction input: it decides whether the page must feel like
 *  "help is available right now" (panic→relief) or "you are safe here"
 *  (fear→safety) — which are structurally different pages, not recolors. */
export type EmotionalTransformation =
  | "panic_to_relief" // emergency/urgent local service (dead AC in July)
  | "fear_to_safety" // anxious/avoidant buyer (dentist, therapy)
  | "uncertainty_to_confidence" // attorney, high-stakes professional
  | "confusion_to_clarity" // financial advisor, complex purchase
  | "frustration_to_control" // SaaS/tools replacing a painful workflow
  | "discouragement_to_possibility" // fitness, coaching, self-improvement
  | "desire_to_aspiration" // luxury/premium
  | "concern_to_action" // nonprofit/cause
  | "interest_to_ownership" // ecommerce/product
  | "stagnation_to_clarity"; // consulting/strategy

export const EMOTIONAL_TRANSFORMATIONS: readonly EmotionalTransformation[] = [
  "panic_to_relief",
  "fear_to_safety",
  "uncertainty_to_confidence",
  "confusion_to_clarity",
  "frustration_to_control",
  "discouragement_to_possibility",
  "desire_to_aspiration",
  "concern_to_action",
  "interest_to_ownership",
  "stagnation_to_clarity",
] as const;

export interface ArtDirectionProfile {
  transformation: EmotionalTransformation | null;
  energy: CampaignEnergy;
  density: CampaignDensity;
  humanity: CampaignHumanity;
}

export interface ArtDirectionInputs {
  transformation?: EmotionalTransformation | null;
  /** Explicit overrides — only set when the business genuinely deviates from
   *  the transformation's default character. */
  energy?: CampaignEnergy | null;
  density?: CampaignDensity | null;
  humanity?: CampaignHumanity | null;
  /** Resolved visual archetype — the SAFETY NET when no transformation was
   *  supplied: distinct industries still get dimension defaults (and thus art
   *  direction) instead of silently falling to the do-nothing baseline. */
  archetype?: string | null;
}

/** Dimension defaults per archetype, used ONLY when no transformation was
 *  supplied. Coarser than a real transformation but always safe — e.g. a
 *  professional/healthcare page composes calm-rational, never urgent. Absent
 *  archetypes (incl. direct_response) stay baseline = unchanged. */
const ARCHETYPE_FALLBACK: Record<string, { energy: CampaignEnergy; density: CampaignDensity; humanity: CampaignHumanity }> = {
  professional_enterprise: { energy: "calm", density: "rich", humanity: "balanced" },
  luxury_premium: { energy: "calm", density: "minimal", humanity: "people_led" },
  nonprofit_mission: { energy: "balanced", density: "medium", humanity: "people_led" },
  wellness: { energy: "calm", density: "medium", humanity: "people_led" },
}

/** The default character of each transformation — how that buyer state maps
 *  onto the reasoning dimensions. Deterministic; overridable per input. */
const TRANSFORMATION_DEFAULTS: Record<
  EmotionalTransformation,
  { energy: CampaignEnergy; density: CampaignDensity; humanity: CampaignHumanity }
> = {
  panic_to_relief: { energy: "urgent", density: "rich", humanity: "people_led" },
  fear_to_safety: { energy: "calm", density: "medium", humanity: "people_led" },
  uncertainty_to_confidence: { energy: "calm", density: "rich", humanity: "balanced" },
  confusion_to_clarity: { energy: "calm", density: "medium", humanity: "balanced" },
  frustration_to_control: { energy: "balanced", density: "medium", humanity: "product_led" },
  discouragement_to_possibility: { energy: "balanced", density: "medium", humanity: "people_led" },
  desire_to_aspiration: { energy: "calm", density: "minimal", humanity: "people_led" },
  concern_to_action: { energy: "balanced", density: "medium", humanity: "people_led" },
  interest_to_ownership: { energy: "balanced", density: "medium", humanity: "product_led" },
  stagnation_to_clarity: { energy: "calm", density: "rich", humanity: "balanced" },
};

/** Derive the Campaign Art Direction Profile from model-supplied inputs.
 *  Precedence: explicit dimension override > transformation default >
 *  archetype fallback > neutral baseline (which applyArtDirection treats as
 *  "change nothing"). */
export function deriveArtDirection(inputs: ArtDirectionInputs): ArtDirectionProfile {
  const t = inputs.transformation ?? null;
  const defaults = t
    ? TRANSFORMATION_DEFAULTS[t]
    : ((inputs.archetype && ARCHETYPE_FALLBACK[inputs.archetype]) || {
        energy: "balanced" as const,
        density: "medium" as const,
        humanity: "balanced" as const,
      });
  return {
    transformation: t,
    energy: inputs.energy ?? defaults.energy,
    density: inputs.density ?? defaults.density,
    humanity: inputs.humanity ?? defaults.humanity,
  };
}

/** True when the profile is the do-nothing baseline (no transformation and no
 *  explicit dimension pushed off balanced/medium). */
export function isBaselineProfile(p: ArtDirectionProfile): boolean {
  return p.transformation === null && p.energy === "balanced" && p.humanity === "balanced" && p.density === "medium";
}

// ─── Profile → composition mapping ─────────────────────────────────────────

/**
 * Apply the profile to a composed section list: assign per-section layout
 * variants and canvases so structurally different campaigns come out of the
 * same section library. Returns NEW section objects (never mutates input).
 *
 * Baseline profile → sections returned as-is (identity), so funnels built
 * without art-direction inputs are pixel-identical to today.
 */
export function applyArtDirection(
  sections: FunnelSection[],
  profile: ArtDirectionProfile,
): FunnelSection[] {
  if (isBaselineProfile(profile)) return sections;

  const lastCtaBannerIndex = sections.reduce(
    (last, s, i) => (s.type === "cta_banner" ? i : last),
    -1,
  );

  return sections.map((section, i) => {
    // URGENT (panic→relief): high contrast, visualized transformation, a dark
    // immersive band mid-page, a full-bleed close. "Help is available NOW."
    if (profile.energy === "urgent") {
      switch (section.type) {
        case "problem_solution":
          return {
            ...section,
            canvas: "clean" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
          };
        case "benefits_grid":
          return {
            ...section,
            canvas: "dark_immersive" as SectionCanvas,
            config: { ...(section.config as BenefitsGridConfig), variant: "flowing_checklist" as const },
          };
        case "cta_banner":
          return i === lastCtaBannerIndex
            ? {
                ...section,
                canvas: "clean" as SectionCanvas, // full_bleed_close paints its own bg
                config: { ...(section.config as CtaBannerConfig), variant: "full_bleed_close" as const },
              }
            : { ...section, canvas: "brand_tint" as SectionCanvas };
        case "offer":
        case "ticket_tiers":
        case "stats":
          return { ...section, canvas: "brand_tint" as SectionCanvas };
        default:
          return section;
      }
    }

    // CALM + PEOPLE-LED (fear→safety, desire→aspiration): warm, human,
    // image-led, soft transitions, NO dark bands, editorial close.
    if (profile.energy === "calm" && profile.humanity === "people_led") {
      switch (section.type) {
        case "benefits_grid":
          return {
            ...section,
            canvas: "warm_paper" as SectionCanvas,
            config: { ...(section.config as BenefitsGridConfig), variant: "alternating_image" as const },
          };
        case "problem_solution":
          return {
            ...section,
            canvas: "brand_tint" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "stacked" as const },
          };
        case "story":
        case "testimonials":
          return { ...section, canvas: "warm_paper" as SectionCanvas };
        case "cta_banner":
          return {
            ...section,
            canvas: "brand_tint" as SectionCanvas,
            config: { ...(section.config as CtaBannerConfig), variant: "banner" as const },
          };
        default:
          return section;
      }
    }

    // CALM + rational (uncertainty→confidence, confusion→clarity,
    // stagnation→clarity): composed authority — gentle tint rhythm, the
    // transformation visualized once, contained close. No urgency devices.
    if (profile.energy === "calm") {
      switch (section.type) {
        case "problem_solution":
          return {
            ...section,
            canvas: "clean" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
          };
        case "benefits_grid":
          return { ...section, canvas: "warm_paper" as SectionCanvas };
        case "cta_banner":
          return { ...section, canvas: "brand_tint" as SectionCanvas };
        default:
          return section;
      }
    }

    // BALANCED with a real transformation (control/possibility/ownership/
    // action): moderate contrast — visualized before/after + a strong close,
    // without the urgent dark band.
    switch (section.type) {
      case "problem_solution":
        return {
          ...section,
          config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
        };
      case "cta_banner":
        return i === lastCtaBannerIndex
          ? {
              ...section,
              canvas: "clean" as SectionCanvas,
              config: { ...(section.config as CtaBannerConfig), variant: "full_bleed_close" as const },
            }
          : section;
      case "offer":
      case "ticket_tiers":
        return { ...section, canvas: "brand_tint" as SectionCanvas };
      default:
        return section;
    }
  });
}
