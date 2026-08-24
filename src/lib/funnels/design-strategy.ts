import type { DesignPackTokens, SectionBackground } from "./design-packs";
import { resolveDesignPack } from "./design-packs";

/**
 * Flow Phase 2 — Design Intelligence.
 *
 * DesignPackTokens (design-packs.ts, RC 1.1) was a single fixed token set
 * per pack — every funnel in "startup" looked identical. This layer sits
 * ON TOP of it, decomposing the choice into independent axes (archetype,
 * palette variant, color mode, typography, card geometry, background
 * rhythm, icon style, density, animation, media, CTA) so two businesses in
 * the same archetype render as siblings, not clones — "controlled visual
 * variation," not uncontrolled randomness: every value below is an
 * enumerated, professionally-authored option, never a generated color or
 * font pairing.
 *
 * Purely additive. A funnel with no `designStrategy` renders exactly as it
 * always has (design-packs.ts's `designPack` -> "classic" chain,
 * untouched). `resolveEffectiveDesignTokens()` is the one bridge function
 * the renderer calls; it prefers `designStrategy` when present and falls
 * back to the RC-1.1 `designPack` path otherwise — see that function's
 * doc comment.
 */

export type VisualArchetype =
  | "direct_response"
  | "local_service"
  | "saas_technology"
  | "luxury_premium"
  | "nonprofit_mission"
  | "coach_consultant"
  | "wellness"
  | "agency_creative"
  | "professional_enterprise";

export type ColorMode = "light" | "dark" | "mixed";
export type CardStyle = "soft" | "sharp" | "elegant" | "floating";
export type BorderRadiusStyle = "square" | "soft" | "rounded";
export type IconStyle = "outline" | "duotone" | "filled";
export type VisualDensity = "low" | "medium" | "high";
export type AnimationLevel = "none" | "minimal" | "moderate" | "expressive";
export type TypographyPairingId =
  | "sans_classic"
  | "sans_modern"
  | "serif_editorial"
  | "serif_display"
  | "mono_technical";
export type MediaStrategyId =
  | "founder_photo"
  | "team_photo"
  | "community_photo"
  | "service_photo"
  | "product_screenshot"
  | "dashboard_screenshot"
  | "browser_mockup"
  | "phone_mockup"
  | "video"
  | "illustration"
  | "abstract"
  | "none";
/** Phase 3 — which photo_gallery layout this archetype reaches for when
 *  Zeno adds one (see capabilities.ts's create_funnel gallery insertion). */
export type GalleryLayoutId = "grid" | "masonry" | "carousel" | "before_after";
export type CtaStrategyId =
  | "inline"
  | "popup_form"
  | "popup_calendar"
  | "dual"
  | "sticky_desktop"
  | "floating_mobile"
  | "phone";
export type HeroLayoutId =
  | "centered"
  | "split"
  | "background_image"
  | "founder_image"
  | "browser_mockup"
  | "phone_mockup";

export interface PaletteVariant {
  id: string;
  label: string;
  accentColor: string;
  colorMode: ColorMode;
  headlineGradient?: [string, string];
  iconPalette?: string[];
}

export interface TypographyPairing {
  id: TypographyPairingId;
  label: string;
  headingFont: "sans" | "serif";
}

export const TYPOGRAPHY_PAIRINGS: Record<TypographyPairingId, TypographyPairing> = {
  sans_classic: { id: "sans_classic", label: "Clean sans-serif", headingFont: "sans" },
  sans_modern: { id: "sans_modern", label: "Modern geometric sans", headingFont: "sans" },
  serif_editorial: { id: "serif_editorial", label: "Editorial serif", headingFont: "serif" },
  serif_display: { id: "serif_display", label: "Display serif", headingFont: "serif" },
  mono_technical: { id: "mono_technical", label: "Technical (sans + mono accents)", headingFont: "sans" },
};

/** Every archetype's approved backgrounds, cycled by index the same way
 *  design-packs.ts's DESIGN_PACKS already do — reusing that rhythm engine,
 *  just with two new pattern values (see design-packs.ts's SectionBackground
 *  extension). Kept short and hand-authored per archetype (not generated)
 *  so the rhythm always reads as intentional, per the "don't alternate
 *  mechanically" rule. */
export interface VisualArchetypeDefinition {
  id: VisualArchetype;
  label: string;
  audienceHint: string;
  characteristics: string;
  palettes: PaletteVariant[];
  typography: TypographyPairingId[];
  cardStyle: CardStyle;
  borderRadiusStyle: BorderRadiusStyle;
  iconStyle: IconStyle;
  visualDensity: VisualDensity;
  animationLevel: AnimationLevel;
  backgroundRhythm: SectionBackground[];
  recommendedHeroLayouts: HeroLayoutId[];
  recommendedCtaStyles: CtaStrategyId[];
  recommendedMedia: MediaStrategyId[];
  galleryLayout: GalleryLayoutId;
}

export const VISUAL_ARCHETYPES: Record<VisualArchetype, VisualArchetypeDefinition> = {
  local_service: {
    id: "local_service",
    label: "Local Service",
    audienceHint: "Home services, automotive, clinics, contractors, appointment-driven local businesses.",
    characteristics: "Warm/high-trust palette, friendly sans, rounded cards, low visual complexity, minimal motion.",
    palettes: [
      { id: "trust_blue", label: "Trust Blue", accentColor: "#0891b2", colorMode: "light" },
      { id: "warm_amber", label: "Warm Amber", accentColor: "#d97706", colorMode: "light" },
      { id: "grounded_green", label: "Grounded Green", accentColor: "#16a34a", colorMode: "light" },
    ],
    typography: ["sans_classic"],
    cardStyle: "soft",
    borderRadiusStyle: "rounded",
    iconStyle: "duotone",
    visualDensity: "low",
    animationLevel: "minimal",
    backgroundRhythm: ["white", "gray", "white"],
    recommendedHeroLayouts: ["centered", "split"],
    recommendedCtaStyles: ["popup_calendar", "phone", "popup_form"],
    recommendedMedia: ["service_photo", "team_photo", "none"],
    galleryLayout: "before_after",
  },
  saas_technology: {
    id: "saas_technology",
    label: "SaaS & Technology",
    audienceHint: "SaaS, AI, developer tools, platforms, apps.",
    characteristics: "High-contrast light/dark/mixed, controlled gradients, dashboard/browser mockups, modern type, moderate motion, tight geometry.",
    palettes: [
      { id: "indigo_cloud", label: "Indigo Cloud", accentColor: "#4f46e5", colorMode: "light", headlineGradient: ["#4f46e5", "#0ea5e9"], iconPalette: ["#4f46e5", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981"] },
      { id: "midnight_signal", label: "Midnight Signal", accentColor: "#22d3ee", colorMode: "dark", headlineGradient: ["#22d3ee", "#a855f7"], iconPalette: ["#22d3ee", "#a855f7", "#f472b6", "#facc15"] },
      { id: "mixed_gradient", label: "Mixed Gradient", accentColor: "#6366f1", colorMode: "mixed", headlineGradient: ["#6366f1", "#06b6d4"], iconPalette: ["#6366f1", "#06b6d4", "#f59e0b"] },
    ],
    typography: ["sans_modern", "mono_technical"],
    cardStyle: "floating",
    borderRadiusStyle: "soft",
    iconStyle: "duotone",
    visualDensity: "medium",
    animationLevel: "moderate",
    backgroundRhythm: ["white", "gradient", "elevated", "gray", "white"],
    recommendedHeroLayouts: ["browser_mockup", "split", "phone_mockup"],
    recommendedCtaStyles: ["popup_form", "dual", "sticky_desktop"],
    recommendedMedia: ["dashboard_screenshot", "browser_mockup", "product_screenshot"],
    galleryLayout: "grid",
  },
  luxury_premium: {
    id: "luxury_premium",
    label: "Luxury & Premium",
    audienceHint: "Executive consulting, luxury services, wealth, premium professional services.",
    characteristics: "Cream/charcoal/deep-neutral, restrained gold/metallic accents, serif display, editorial imagery, generous whitespace, thin borders, minimal icons, subtle motion.",
    palettes: [
      { id: "gold_cream", label: "Gold on Cream", accentColor: "#b45309", colorMode: "light", headlineGradient: ["#b45309", "#d97706"] },
      { id: "charcoal_metal", label: "Charcoal & Metal", accentColor: "#a8a29e", colorMode: "dark", headlineGradient: ["#d4d4d8", "#a8a29e"] },
    ],
    typography: ["serif_display", "serif_editorial"],
    cardStyle: "elegant",
    borderRadiusStyle: "square",
    iconStyle: "outline",
    visualDensity: "low",
    animationLevel: "minimal",
    backgroundRhythm: ["white", "gray", "white", "gray", "white"],
    recommendedHeroLayouts: ["background_image", "centered", "founder_image"],
    recommendedCtaStyles: ["popup_calendar", "popup_form"],
    recommendedMedia: ["founder_photo", "abstract", "none"],
    galleryLayout: "carousel",
  },
  nonprofit_mission: {
    id: "nonprofit_mission",
    label: "Nonprofit & Mission-Driven",
    audienceHint: "Nonprofits, causes, community organizations, mission-driven programs.",
    characteristics: "Story-led, community/impact imagery, human-centered hierarchy, warm-but-credible palette, highly accessible typography and contrast.",
    palettes: [
      { id: "warm_terracotta", label: "Warm Terracotta", accentColor: "#c2410c", colorMode: "light" },
      { id: "hopeful_teal", label: "Hopeful Teal", accentColor: "#0f766e", colorMode: "light" },
    ],
    typography: ["sans_classic"],
    cardStyle: "soft",
    borderRadiusStyle: "rounded",
    iconStyle: "duotone",
    visualDensity: "medium",
    animationLevel: "minimal",
    backgroundRhythm: ["white", "gray", "white", "gray"],
    recommendedHeroLayouts: ["centered", "split"],
    recommendedCtaStyles: ["popup_form", "inline"],
    recommendedMedia: ["community_photo", "illustration", "none"],
    galleryLayout: "grid",
  },
  coach_consultant: {
    id: "coach_consultant",
    label: "Coach, Consultant & Personal Brand",
    audienceHint: "Coaches, consultants, personal brands, mastermind/mentorship offers.",
    characteristics: "Founder-forward, founder photo/video, methodology/journey sections, editorial treatment, strong booking/application CTA, authority without fabricated proof.",
    palettes: [
      { id: "confident_navy", label: "Confident Navy", accentColor: "#1e3a8a", colorMode: "light" },
      { id: "warm_clay", label: "Warm Clay", accentColor: "#b45309", colorMode: "light" },
    ],
    typography: ["serif_editorial", "sans_classic"],
    cardStyle: "soft",
    borderRadiusStyle: "soft",
    iconStyle: "outline",
    visualDensity: "medium",
    animationLevel: "minimal",
    backgroundRhythm: ["white", "gray", "white", "gray", "white"],
    recommendedHeroLayouts: ["founder_image", "split", "centered"],
    recommendedCtaStyles: ["popup_calendar", "popup_form"],
    recommendedMedia: ["founder_photo", "video", "none"],
    galleryLayout: "carousel",
  },
  wellness: {
    id: "wellness",
    label: "Wellness",
    audienceHint: "Health, fitness, life coaching, spiritual/holistic practices.",
    characteristics: "Soft natural palette, organic/rounded shapes, calmer spacing, lifestyle imagery, gentle animation, lower density, trust/safety cues.",
    palettes: [
      { id: "sage_calm", label: "Sage Calm", accentColor: "#0d9488", colorMode: "light" },
      { id: "blush_soft", label: "Soft Blush", accentColor: "#be185d", colorMode: "light" },
    ],
    typography: ["serif_editorial", "sans_classic"],
    cardStyle: "soft",
    borderRadiusStyle: "rounded",
    iconStyle: "duotone",
    visualDensity: "low",
    animationLevel: "minimal",
    backgroundRhythm: ["white", "gradient", "white", "gray", "white"],
    recommendedHeroLayouts: ["centered", "founder_image"],
    recommendedCtaStyles: ["popup_form", "popup_calendar"],
    recommendedMedia: ["service_photo", "founder_photo", "illustration"],
    galleryLayout: "masonry",
  },
  agency_creative: {
    id: "agency_creative",
    label: "Agency & Creative",
    audienceHint: "Marketing/creative agencies, freelance studios, sales-led creative services.",
    characteristics: "Bold type, strong contrast, layered cards, selective gradients, higher energy, moderate/expressive motion, strategy-call CTA.",
    palettes: [
      { id: "electric_violet", label: "Electric Violet", accentColor: "#7c3aed", colorMode: "dark", headlineGradient: ["#22d3ee", "#a855f7"], iconPalette: ["#ec4899", "#3b82f6", "#a855f7", "#f97316", "#22c55e", "#06b6d4"] },
      { id: "sunset_energy", label: "Sunset Energy", accentColor: "#ea580c", colorMode: "dark", headlineGradient: ["#f97316", "#ec4899"], iconPalette: ["#f97316", "#ec4899", "#a855f7", "#facc15"] },
    ],
    typography: ["sans_modern"],
    cardStyle: "sharp",
    borderRadiusStyle: "square",
    iconStyle: "filled",
    visualDensity: "high",
    animationLevel: "expressive",
    backgroundRhythm: ["dark", "gradient", "dark", "gray", "dark"],
    recommendedHeroLayouts: ["split", "background_image", "centered"],
    recommendedCtaStyles: ["popup_calendar", "dual"],
    recommendedMedia: ["product_screenshot", "abstract", "video"],
    galleryLayout: "masonry",
  },
  direct_response: {
    id: "direct_response",
    label: "Direct Response",
    audienceHint: "The default for high-converting sales & lead pages (offers, lead magnets, VSLs, applications, webinars, most local-service lead-gen). ClickFunnels/Brunson-style.",
    characteristics: "Dark, high-contrast, oversized bold headlines, one punchy high-visibility CTA color, strong alternating section bands, sharp layered cards, high energy — engineered to convert, not to look tastefully minimal.",
    palettes: [
      { id: "high_voltage_orange", label: "High-Voltage Orange", accentColor: "#f97316", colorMode: "dark", headlineGradient: ["#f97316", "#facc15"], iconPalette: ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#f472b6"] },
      { id: "conversion_green", label: "Conversion Green", accentColor: "#22c55e", colorMode: "dark", headlineGradient: ["#22c55e", "#a3e635"], iconPalette: ["#22c55e", "#a3e635", "#f97316", "#38bdf8"] },
      { id: "electric_blue", label: "Electric Blue", accentColor: "#3b82f6", colorMode: "dark", headlineGradient: ["#38bdf8", "#818cf8"], iconPalette: ["#38bdf8", "#818cf8", "#f97316", "#22c55e"] },
    ],
    typography: ["sans_modern"],
    cardStyle: "sharp",
    borderRadiusStyle: "soft",
    iconStyle: "filled",
    visualDensity: "high",
    animationLevel: "moderate",
    backgroundRhythm: ["dark", "dark", "gradient", "dark", "elevated"],
    // Sales-letter hero: a big CENTERED headline, not a website-style
    // headline-left / media-right split. Media defaults to none (pure copy) or
    // a CENTERED video below — never a side screenshot box.
    recommendedHeroLayouts: ["centered", "background_image"],
    // popup_form leads (capture-safe), but phone + booking are supported so a
    // real call-now / booking CTA survives even in the bold default.
    recommendedCtaStyles: ["popup_form", "phone", "popup_calendar", "sticky_desktop", "dual"],
    recommendedMedia: ["none", "video", "abstract"],
    galleryLayout: "grid",
  },
  professional_enterprise: {
    id: "professional_enterprise",
    label: "Professional & Enterprise",
    audienceHint: "Consultants, healthcare, law, finance, enterprise B2B.",
    characteristics: "Structured grids, restrained color, data/methodology/process visuals, strong hierarchy, conservative motion, clear comparison sections.",
    palettes: [
      { id: "corporate_blue", label: "Corporate Blue", accentColor: "#1d4ed8", colorMode: "light" },
      { id: "slate_authority", label: "Slate Authority", accentColor: "#334155", colorMode: "light" },
    ],
    typography: ["sans_classic"],
    cardStyle: "soft",
    borderRadiusStyle: "soft",
    iconStyle: "outline",
    visualDensity: "medium",
    animationLevel: "none",
    backgroundRhythm: ["white", "gray", "elevated", "gray", "white"],
    recommendedHeroLayouts: ["centered", "split"],
    recommendedCtaStyles: ["popup_form", "popup_calendar"],
    recommendedMedia: ["team_photo", "abstract", "none"],
    galleryLayout: "grid",
  },
};

export interface DesignStrategy {
  visualArchetype: VisualArchetype;
  paletteId: string;
  colorMode: ColorMode;
  typographyPairing: TypographyPairingId;
  heroLayout: HeroLayoutId;
  cardStyle: CardStyle;
  borderRadiusStyle: BorderRadiusStyle;
  sectionBackgroundPattern: SectionBackground[];
  iconStyle: IconStyle;
  visualDensity: VisualDensity;
  animationLevel: AnimationLevel;
  mediaStrategy: MediaStrategyId;
  ctaStrategy: CtaStrategyId;
  galleryLayout: GalleryLayoutId;
}

function pickPalette(archetype: VisualArchetypeDefinition, paletteId?: string): PaletteVariant {
  return archetype.palettes.find((p) => p.id === paletteId) ?? archetype.palettes[0];
}

/**
 * Resolve a full DesignStrategy from an archetype + optional overrides,
 * validating every override against that archetype's OWN approved list
 * (never an arbitrary value) — this is the "controlled variation"
 * boundary: an override that isn't one of the archetype's own options is
 * silently ignored in favor of the archetype's first/default choice,
 * exactly like frameworks.ts's stageAllowedLayouts pattern for section
 * layout overrides.
 */
export function resolveDesignStrategy(
  archetypeId: VisualArchetype | undefined,
  overrides?: {
    paletteId?: string;
    colorMode?: ColorMode;
    typographyPairing?: TypographyPairingId;
    heroLayout?: HeroLayoutId;
    animationLevel?: AnimationLevel;
    visualDensity?: VisualDensity;
    mediaStrategy?: MediaStrategyId;
    ctaStrategy?: CtaStrategyId;
    galleryLayout?: GalleryLayoutId;
  },
): DesignStrategy {
  const archetype = VISUAL_ARCHETYPES[archetypeId ?? "professional_enterprise"];
  const palette = pickPalette(archetype, overrides?.paletteId);
  const typography =
    overrides?.typographyPairing && archetype.typography.includes(overrides.typographyPairing)
      ? overrides.typographyPairing
      : archetype.typography[0];
  const heroLayout =
    overrides?.heroLayout && archetype.recommendedHeroLayouts.includes(overrides.heroLayout)
      ? overrides.heroLayout
      : archetype.recommendedHeroLayouts[0];
  const animationLevel = overrides?.animationLevel ?? archetype.animationLevel;
  const visualDensity = overrides?.visualDensity ?? archetype.visualDensity;
  const ctaStrategy =
    overrides?.ctaStrategy && archetype.recommendedCtaStyles.includes(overrides.ctaStrategy)
      ? overrides.ctaStrategy
      : archetype.recommendedCtaStyles[0];
  const mediaStrategy =
    overrides?.mediaStrategy && archetype.recommendedMedia.includes(overrides.mediaStrategy)
      ? overrides.mediaStrategy
      : archetype.recommendedMedia[0];

  return {
    visualArchetype: archetype.id,
    paletteId: palette.id,
    colorMode: overrides?.colorMode ?? palette.colorMode,
    typographyPairing: typography,
    heroLayout,
    cardStyle: archetype.cardStyle,
    borderRadiusStyle: archetype.borderRadiusStyle,
    sectionBackgroundPattern: archetype.backgroundRhythm,
    iconStyle: archetype.iconStyle,
    visualDensity,
    animationLevel,
    mediaStrategy,
    ctaStrategy,
    galleryLayout: overrides?.galleryLayout ?? archetype.galleryLayout,
  };
}

/** The concrete render tokens a DesignStrategy resolves to — same shape
 *  DesignPackTokens already provides, so the renderer doesn't need two
 *  parallel code paths. */
export interface ResolvedRenderTokens {
  accentColor: string;
  theme: "light" | "dark";
  headingFont: "sans" | "serif";
  cardStyle: CardStyle;
  spacing: "compact" | "comfortable" | "spacious";
  backgroundRhythm: SectionBackground[];
  iconPalette?: string[];
  headlineGradient?: [string, string];
  borderRadiusStyle: BorderRadiusStyle;
  iconStyle: IconStyle;
  visualDensity: VisualDensity;
  animationLevel: AnimationLevel;
}

const DENSITY_TO_SPACING: Record<VisualDensity, "compact" | "comfortable" | "spacious"> = {
  high: "compact",
  medium: "comfortable",
  low: "spacious",
};

function renderTokensFromStrategy(strategy: DesignStrategy): ResolvedRenderTokens {
  const archetype = VISUAL_ARCHETYPES[strategy.visualArchetype];
  const palette = pickPalette(archetype, strategy.paletteId);
  return {
    accentColor: palette.accentColor,
    theme: strategy.colorMode === "dark" ? "dark" : "light",
    headingFont: TYPOGRAPHY_PAIRINGS[strategy.typographyPairing].headingFont,
    cardStyle: strategy.cardStyle,
    spacing: DENSITY_TO_SPACING[strategy.visualDensity],
    backgroundRhythm: strategy.sectionBackgroundPattern,
    iconPalette: palette.iconPalette,
    headlineGradient: palette.headlineGradient,
    borderRadiusStyle: strategy.borderRadiusStyle,
    iconStyle: strategy.iconStyle,
    visualDensity: strategy.visualDensity,
    animationLevel: strategy.animationLevel,
  };
}

function renderTokensFromPack(pack: DesignPackTokens): ResolvedRenderTokens {
  return {
    accentColor: pack.defaultAccentColor,
    theme: pack.defaultTheme,
    headingFont: pack.headingFont,
    cardStyle: pack.cardStyle,
    spacing: pack.spacing,
    backgroundRhythm: pack.backgroundRhythm,
    iconPalette: pack.iconPalette,
    headlineGradient: pack.headlineGradient,
    // RC 1.1 packs never had these axes — safe, conservative defaults that
    // reproduce today's exact look (rounded-2xl cards, duotone icon
    // badges, no motion) so a pre-Phase-2 funnel is byte-identical.
    borderRadiusStyle: "soft",
    iconStyle: "duotone",
    visualDensity: "medium",
    animationLevel: "none",
  };
}

/**
 * The one bridge function the renderer calls. Prefers `funnel.designStrategy`
 * (Phase 2) when present; otherwise falls back to the RC-1.1
 * `designPack`/"classic" chain, completely unchanged. A funnel created
 * before Phase 2 shipped has no `designStrategy` field at all, so it always
 * takes the fallback branch — zero visual change, zero migration needed.
 */
export function resolveEffectiveDesignTokens(funnel: {
  designStrategy?: DesignStrategy | null;
  designPack?: Parameters<typeof resolveDesignPack>[0];
}): ResolvedRenderTokens {
  if (funnel.designStrategy) return renderTokensFromStrategy(funnel.designStrategy);
  return renderTokensFromPack(resolveDesignPack(funnel.designPack));
}

export const VISUAL_ARCHETYPE_IDS = Object.keys(VISUAL_ARCHETYPES) as VisualArchetype[];
