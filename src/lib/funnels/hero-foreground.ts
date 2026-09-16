import type { HeroConfig } from "@/types/funnels";

/**
 * A HERO OVER PHOTOGRAPHY OWNS ITS WHOLE FOREGROUND, NOT JUST ITS HEADLINE.
 *
 * The immersive hero paints a photograph, drops a dark scrim over it and sets
 * `text-white` on the container. That covers the headline and subheadline, and
 * it covers nothing else — every remaining foreground element kept the styling
 * written for a light page. Two Summit certification pages shipped an eyebrow
 * in accent-blue on a 14%-accent fill directly over dark shingles, effectively
 * unreadable, with the trust row beneath the CTA at 70% opacity on a busy
 * image.
 *
 * The bug was not the eyebrow's colour. It was that "am I on photography?" was
 * answered independently, implicitly, by each element — so every element that
 * did not ask got it wrong, and the next element added would get it wrong too.
 * The question is asked once here and the answer is a token set the component
 * consumes for ALL of them.
 *
 * Non-photographic heroes are untouched: `onPhotography` is false and every
 * caller falls back to the light-page treatment it already had.
 */

/** Does this hero render its foreground on top of a photograph? */
export function heroOnPhotography(config: Pick<HeroConfig, "mediaUrl">, layout: string): boolean {
  return layout === "background_image" && !!config.mediaUrl;
}

export interface HeroForeground {
  /** True when every token below is the over-photography variant. */
  onPhotography: boolean;
  /** Pill behind the eyebrow: readable on a scrim, not an accent tint. */
  eyebrowClass: string;
  eyebrowStyle: { backgroundColor: string; color: string; borderColor: string };
  /** Supporting copy (bullets, meta). Accent check marks vanish on a scrim. */
  bulletTextClass: string;
  markColor: string;
  /** The trust row under the CTA — the element that was least readable. */
  trustRowClass: string;
  /**
   * A gradient headline over photography is a contrast risk: half the words
   * get a colour chosen for a white page. Solid white is the readable choice.
   */
  allowHeadlineGradient: boolean;
}

/**
 * The foreground treatment for a hero, given whether it sits on photography.
 *
 * `accentColor` still drives the light-page variant, so nothing about the
 * ordinary hero changes. Over photography every token becomes white-based,
 * because the scrim guarantees a dark backdrop and white is the only colour
 * that is readable against ANY photograph beneath it.
 */
export function heroForeground(onPhotography: boolean, accentColor: string): HeroForeground {
  if (!onPhotography) {
    return {
      onPhotography: false,
      eyebrowClass: "mb-6 inline-block rounded-full border px-4 py-1.5 text-sm font-semibold tracking-tight",
      eyebrowStyle: { backgroundColor: `${accentColor}14`, color: accentColor, borderColor: `${accentColor}33` },
      bulletTextClass: "flex items-start gap-2.5 text-sm opacity-85",
      markColor: accentColor,
      trustRowClass: "mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm opacity-70",
      allowHeadlineGradient: true,
    };
  }
  return {
    onPhotography: true,
    eyebrowClass: "mb-6 inline-block rounded-full border px-4 py-1.5 text-sm font-semibold tracking-tight backdrop-blur-sm",
    // Opaque enough to separate from the photograph underneath, in white so it
    // cannot collide with whatever colours the image happens to contain.
    eyebrowStyle: { backgroundColor: "rgba(255,255,255,0.18)", color: "#fff", borderColor: "rgba(255,255,255,0.45)" },
    // 85% and 70% opacity read as grey mush over a photograph; supporting copy
    // stays near-solid and the check marks go white with the text they mark.
    bulletTextClass: "flex items-start gap-2.5 text-sm text-white/95",
    markColor: "#fff",
    trustRowClass: "mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/95",
    allowHeadlineGradient: false,
  };
}
