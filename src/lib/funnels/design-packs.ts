/**
 * Landing Page Design System (RC 1.1) — reusable design packs.
 *
 * A design pack is a token set (colors, typography, card treatment,
 * spacing, section-background rhythm), NOT a new rendering system. Every
 * existing section component keeps rendering the same content the same
 * way; the pack only changes the *style tokens* fed into it (accent color,
 * heading font, card class, background wrapper) plus, at generation time,
 * which optional layout/CTA variants Zeno reaches for. Undefined/"classic"
 * = today's plain rendering, byte-identical to every funnel created before
 * this shipped.
 */

export type DesignPackId =
  | "classic"
  | "executive"
  | "bold"
  | "premium"
  | "startup"
  | "local_business"
  | "wellness";

export type SectionBackground = "white" | "gray" | "gradient" | "dark";
export type CardStyle = "soft" | "sharp" | "elegant" | "floating";
export type SpacingDensity = "compact" | "comfortable" | "spacious";

export interface DesignPackTokens {
  id: DesignPackId;
  label: string;
  /** Who the AI should reach for this pack for — informs create_funnel's
   *  selection instructions, not enforced in code. */
  audienceHint: string;
  defaultAccentColor: string;
  defaultTheme: "light" | "dark";
  headingFont: "sans" | "serif";
  cardStyle: CardStyle;
  spacing: SpacingDensity;
  /** Cycles across sections in order — see applyBackgroundRhythm(). Keep
   *  every pack's rhythm starting and (for most) ending "white" so the
   *  hero and final CTA read cleanly regardless of section count. */
  backgroundRhythm: SectionBackground[];
}

export const DESIGN_PACKS: Record<DesignPackId, DesignPackTokens> = {
  classic: {
    id: "classic",
    label: "Classic",
    audienceHint: "Default — no strong pack signal from the business description.",
    defaultAccentColor: "#2563eb",
    defaultTheme: "light",
    headingFont: "sans",
    cardStyle: "soft",
    spacing: "comfortable",
    backgroundRhythm: ["white"],
  },
  executive: {
    id: "executive",
    label: "Executive",
    audienceHint: "Consultants, healthcare, law, finance, enterprise B2B.",
    defaultAccentColor: "#1d4ed8",
    defaultTheme: "light",
    headingFont: "sans",
    cardStyle: "soft",
    spacing: "spacious",
    backgroundRhythm: ["white", "gray", "white", "gray", "white"],
  },
  bold: {
    id: "bold",
    label: "Bold",
    audienceHint: "Agencies, creators, marketing, sales — high-energy B2C/B2B.",
    defaultAccentColor: "#7c3aed",
    defaultTheme: "dark",
    headingFont: "sans",
    cardStyle: "sharp",
    spacing: "comfortable",
    backgroundRhythm: ["dark", "gradient", "dark", "gray", "dark"],
  },
  premium: {
    id: "premium",
    label: "Premium",
    audienceHint: "Executive coaching, luxury, high-ticket consulting.",
    defaultAccentColor: "#b45309",
    defaultTheme: "light",
    headingFont: "serif",
    cardStyle: "elegant",
    spacing: "spacious",
    backgroundRhythm: ["white", "gray", "white", "gray", "white"],
  },
  startup: {
    id: "startup",
    label: "Startup",
    audienceHint: "SaaS, AI, technology.",
    defaultAccentColor: "#4f46e5",
    defaultTheme: "light",
    headingFont: "sans",
    cardStyle: "floating",
    spacing: "comfortable",
    backgroundRhythm: ["white", "gradient", "white", "gray", "white"],
  },
  local_business: {
    id: "local_business",
    label: "Local Business",
    audienceHint: "Dentists, roofing, HVAC, real estate, restaurants — trust-first local services.",
    defaultAccentColor: "#0891b2",
    defaultTheme: "light",
    headingFont: "sans",
    cardStyle: "soft",
    spacing: "comfortable",
    backgroundRhythm: ["white", "gray", "white"],
  },
  wellness: {
    id: "wellness",
    label: "Wellness",
    audienceHint: "Health, fitness, life coaching, spiritual/holistic.",
    defaultAccentColor: "#0d9488",
    defaultTheme: "light",
    headingFont: "serif",
    cardStyle: "soft",
    spacing: "spacious",
    backgroundRhythm: ["white", "gradient", "white", "gray", "white"],
  },
};

export function resolveDesignPack(id: DesignPackId | undefined): DesignPackTokens {
  return DESIGN_PACKS[id ?? "classic"];
}

/** Cyclical background per section index — the "avoid five white sections
 *  in a row" rule. Index 0 (hero) and the last section both bias toward
 *  the rhythm's own natural start/end rather than being special-cased,
 *  since every pack's rhythm is already authored to read well end-to-end. */
export function backgroundForIndex(pack: DesignPackTokens, index: number): SectionBackground {
  const rhythm = pack.backgroundRhythm;
  return rhythm[index % rhythm.length];
}
