/**
 * A HERO OVER PHOTOGRAPHY OWNS ITS WHOLE FOREGROUND.
 *
 * Two Summit certification pages shipped an eyebrow in accent-blue on a 14%
 * accent fill, directly over dark shingles, effectively unreadable — with the
 * trust row beneath the CTA at 70% opacity on a busy image. The headline was
 * fine, because the container sets `text-white`; every element that did not ask
 * "am I on photography?" kept its light-page styling.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-hero-contrast.mts
 */
import { heroForeground, heroOnPhotography } from "../src/lib/funnels/hero-foreground.ts";

let failures = 0;
const check = (l: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); if (!ok) failures++; };

const ACCENT = "#1D4ED8";

console.log("\n══ the question is asked once ══");
check("an immersive hero with a photo is on photography", heroOnPhotography({ mediaUrl: "x.jpg" }, "background_image"));
check("... but not without the photo", !heroOnPhotography({ mediaUrl: undefined }, "background_image"));
check("a split hero is not", !heroOnPhotography({ mediaUrl: "x.jpg" }, "split"));
check("a centred hero is not", !heroOnPhotography({ mediaUrl: "x.jpg" }, "centered"));

console.log("\n══ every foreground element switches together ══");
{
  const on = heroForeground(true, ACCENT);
  // THE ELEMENT THAT SHIPPED UNREADABLE.
  check("the eyebrow is white, not accent", on.eyebrowStyle.color === "#fff", on.eyebrowStyle.color);
  check("... on a white scrim, not an accent tint", on.eyebrowStyle.backgroundColor.startsWith("rgba(255,255,255"), on.eyebrowStyle.backgroundColor);
  check("... with a visible border", on.eyebrowStyle.borderColor.startsWith("rgba(255,255,255"), on.eyebrowStyle.borderColor);
  check("no accent colour survives anywhere in the foreground",
    ![on.eyebrowStyle.color, on.eyebrowStyle.backgroundColor, on.eyebrowStyle.borderColor, on.markColor].some((v) => v.toLowerCase().includes(ACCENT.toLowerCase())));
  // THE TRUST ROW.
  check("the trust row is near-solid white, not 70% opacity", on.trustRowClass.includes("text-white/95") && !on.trustRowClass.includes("opacity-70"), on.trustRowClass);
  // SUPPORTING COPY + MARKS.
  check("bullets are near-solid white", on.bulletTextClass.includes("text-white/95") && !on.bulletTextClass.includes("opacity-85"), on.bulletTextClass);
  check("check marks are white, not accent", on.markColor === "#fff", on.markColor);
  // THE HEADLINE.
  check("no gradient headline over a photograph", on.allowHeadlineGradient === false);
}

console.log("\n══ non-photo heroes are untouched ══");
{
  const off = heroForeground(false, ACCENT);
  check("the eyebrow keeps its accent treatment", off.eyebrowStyle.color === ACCENT, off.eyebrowStyle.color);
  check("... and its accent tint", off.eyebrowStyle.backgroundColor === `${ACCENT}14`, off.eyebrowStyle.backgroundColor);
  check("check marks stay accent", off.markColor === ACCENT);
  check("the trust row keeps its original opacity", off.trustRowClass.includes("opacity-70"), off.trustRowClass);
  check("bullets keep their original opacity", off.bulletTextClass.includes("opacity-85"));
  check("gradient headlines remain allowed", off.allowHeadlineGradient === true);
}

console.log("\n══ the component consumes the tokens, not its own styling ══");
{
  const src = await import("node:fs").then((fs) => fs.readFileSync("src/components/funnels/sections/hero-section.tsx", "utf8"));
  // The regression this closes: styling written inline per element, so a new
  // element inherits the light-page treatment by default.
  check("the eyebrow uses the token set", src.includes("className={fg.eyebrowClass}") && src.includes("style={fg.eyebrowStyle}"));
  check("the trust row uses the token set", src.includes("className={fg.trustRowClass}"));
  check("bullets use the token set", src.includes("className={fg.bulletTextClass}"));
  check("check marks use the token set", (src.match(/color: fg\.markColor/g) ?? []).length >= 2);
  check("the headline gradient is gated", src.includes("fg.allowHeadlineGradient ? headlineGradient : undefined"));
  check("no accent-tinted eyebrow literal remains", !src.includes("`${accentColor}14`"));
}

console.log(failures === 0 ? "\nHERO CONTRAST: ALL CHECKS PASSED\n" : `\nHERO CONTRAST: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
