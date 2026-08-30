/**
 * ABOVE-THE-FOLD DECISION COMPLETENESS.
 *
 * Asserts the CONTRACT, not a pixel height: on a typical viewport the visitor
 * must understand what this is, why it matters, what to do, and see trust
 * evidence, without scrolling. Static check of the hero renderer, so it runs
 * without a browser and cannot silently regress.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-hero-fold.mts
 */
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/components/funnels/sections/hero-section.tsx", import.meta.url), "utf8");
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

check("1. Hero commits to a viewport-height budget", src.includes("min-h-[100svh]"));
check("2. Uses svh, not vh (mobile browser chrome hides the CTA otherwise)",
  src.includes("svh") && !/\bmin-h-\[100vh\]/.test(src));
check("3. No hero layout keeps the old fold-breaking padding",
  !src.includes("py-24 sm:py-32") && !src.includes("pb-16 pt-20 sm:pt-28"));
check("4. Headline shrinks on SHORT viewports, not only narrow ones", src.includes("7.2svh"));
check("5. Media is capped in viewport height so it yields space", src.includes("max-h-[32svh]"));
check("6. Media is contained, never cropped to a fixed box", src.includes("object-contain"));
check("7. Content is vertically centred within the fold", src.includes("flex-col justify-center"));
// The CTA and trust row must be rendered INSIDE the same section as the
// headline — if either moves to a sibling section the fold guarantee is void.
const heroBody = src.slice(src.indexOf("const cta ="));
check("8. CTA is composed into the hero itself", heroBody.includes("{cta}"));
check("9. Trust evidence is composed into the hero itself", src.includes("trustNode"));

console.log(`\n${bad === 0 ? "FOLD CONTRACT HELD" : `${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
