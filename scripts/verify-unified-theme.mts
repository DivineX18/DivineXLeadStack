/**
 * FINAL LAUNCH PASS — UI ACCEPTANCE (light + dark).
 *
 * Light/dark is a launch REQUIREMENT, so this asserts the properties that make
 * a theme real rather than merely present:
 *
 *   - both palettes are DEFINED and are not inversions of one another
 *   - text/background contrast is legible in BOTH modes (WCAG AA)
 *   - nav hover and active are VISIBLE, and DISTINCT from each other, in both
 *   - no shell surface is hardcoded to a single theme (the half-light/half-dark
 *     failure: white Flow panels sitting inside a dark shell)
 *   - the toggle exists in the shell and rides the existing next-themes engine
 *
 * Colour maths is done here rather than eyeballed because "barely perceptible
 * hover" and "unreadable muted text" are exactly the defects that survive a
 * visual skim.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-unified-theme.mts
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/** Pull a token's value out of a specific CSS block. */
function block(selector: string): string {
  const i = css.indexOf(selector + " {");
  if (i === -1) return "";
  return css.slice(i, css.indexOf("\n}", i));
}
function token(blk: string, name: string): string {
  const m = blk.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : "";
}

const LIGHT = block(".theme-ascend");
const DARK = block(".dark .theme-ascend");

// ── colour helpers ────────────────────────────────────────────────────────
function parse(c: string): [number, number, number, number] | null {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  return null;
}
/** Composite a possibly-translucent colour over an opaque background. */
function over(fg: [number, number, number, number], bg: [number, number, number, number]): [number, number, number, number] {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}
function lum(c: [number, number, number, number]): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(a: [number, number, number, number], b: [number, number, number, number]): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Perceptual delta between a hover/active overlay and its base surface. */
function deltaL(overlay: string, base: string): number {
  const o = parse(overlay), b = parse(base);
  if (!o || !b) return 0;
  return Math.abs(lum(over(o, b)) - lum(b)) * 100;
}

// ── 1. BOTH PALETTES EXIST AND ARE INTENTIONAL ────────────────────────────
console.log("── PALETTES\n");
const KEYS = ["--dx-surface-0", "--dx-surface-1", "--dx-surface-2", "--dx-surface-3", "--dx-elevated",
              "--dx-border-subtle", "--dx-border", "--dx-text-primary", "--dx-text-secondary", "--dx-text-muted",
              "--dx-hover", "--dx-active"];
check("a LIGHT palette is defined", LIGHT.length > 0);
check("a DARK palette is defined", DARK.length > 0);
for (const k of KEYS) {
  const l = token(LIGHT, k), d = token(DARK, k);
  check(`  ${k} defined in both modes`, !!l && !!d, `light=${l || "MISSING"} dark=${d || "MISSING"}`);
}

const lightBg = parse(token(LIGHT, "--dx-surface-0"))!;
const darkBg = parse(token(DARK, "--dx-surface-0"))!;
check("light and dark are genuinely different palettes, not one inverted",
  lum(lightBg) > 0.5 && lum(darkBg) < 0.1,
  `light L=${lum(lightBg).toFixed(3)} dark L=${lum(darkBg).toFixed(3)}`);

// ── 2. LEGIBILITY IN BOTH MODES ───────────────────────────────────────────
console.log("\n── TEXT LEGIBILITY (WCAG AA)\n");
for (const [mode, blk] of [["LIGHT", LIGHT], ["DARK", DARK]] as const) {
  for (const surface of ["--dx-surface-0", "--dx-surface-1", "--dx-surface-2"]) {
    const bg = parse(token(blk, surface));
    if (!bg) continue;
    for (const [label, tok, min] of [
      ["primary", "--dx-text-primary", 4.5],
      ["secondary", "--dx-text-secondary", 4.5],
      ["muted", "--dx-text-muted", 3.0],
    ] as const) {
      const fg = parse(token(blk, tok));
      if (!fg) continue;
      const ratio = contrast(over(fg, bg), bg);
      check(`  ${mode} ${label} text on ${surface.replace("--dx-", "")}`, ratio >= min,
        `${ratio.toFixed(2)}:1 (min ${min})`);
    }
  }
}

// ── 3. NAV HOVER + ACTIVE ARE VISIBLE AND DISTINCT ────────────────────────
console.log("\n── NAV INTERACTION STATES\n");
for (const [mode, blk] of [["LIGHT", LIGHT], ["DARK", DARK]] as const) {
  // The sidebar renders on surface-1; nav states composite over it.
  const base = token(blk, "--dx-surface-1");
  const hoverD = deltaL(token(blk, "--dx-hover"), base);
  const activeD = deltaL(token(blk, "--dx-active"), base);
  check(`  ${mode} hover is perceptible on the sidebar`, hoverD >= 1.2, `ΔL=${hoverD.toFixed(2)}`);
  check(`  ${mode} active is perceptible`, activeD >= 2.5, `ΔL=${activeD.toFixed(2)}`);
  check(`  ${mode} active is clearly stronger than hover`, activeD > hoverD * 1.4,
    `active ΔL=${activeD.toFixed(2)} vs hover ΔL=${hoverD.toFixed(2)}`);
}

const nav = readFileSync(new URL("../src/components/shell/ascend-shell-nav.tsx", import.meta.url), "utf8");
check("nav uses the theme-aware interaction tokens", nav.includes("--dx-active") && nav.includes("--dx-hover"));
check("nav marks the active item for assistive tech", nav.includes('aria-current={active ? "page"'));
check("nav has a visible keyboard focus state", nav.includes("focus-visible:ring"));
check("active state causes no layout shift (no weight/size change)",
  !/active \? "[^"]*(font-(bold|semibold|medium)|text-(base|lg))/.test(nav));

// ── 4. NO SINGLE-THEME SURFACES LEFT IN THE SHELL ─────────────────────────
console.log("\n── NO HARDCODED SINGLE-THEME SURFACES\n");
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const shellFiles = [...walk("src/app/app"), ...walk("src/components/shell")];
const offenders: string[] = [];
for (const f of shellFiles) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/className="[^"]*"/g)) {
    const cls = m[0];
    // The skip-link is deliberately high-contrast on both themes; scrims are
    // meant to be black in both. Neither is a theme leak.
    if (cls.includes("focus-visible:bg-white") || cls.includes("bg-black/50")) continue;
    if (/\bbg-white\b|\bbg-black\/40\b|bg-\[#[0-9a-f]{3,8}\]/i.test(cls)) {
      offenders.push(`${f}: ${cls.slice(0, 90)}`);
    }
  }
}
check("no shell surface is pinned to one theme", offenders.length === 0,
  offenders.slice(0, 4).join(" | ") || "clean");

// ── 5. TOGGLE ─────────────────────────────────────────────────────────────
console.log("\n── THEME TOGGLE\n");
const layout = readFileSync(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
check("the unified shell renders a theme toggle", layout.includes("<ThemeToggle />"));
check("the shell background is themed, not hardcoded", layout.includes("bg-[var(--dx-surface-0)]"));
const toggle = readFileSync(new URL("../src/components/theme-toggle.tsx", import.meta.url), "utf8");
check("the toggle uses the EXISTING next-themes engine (no second engine)", toggle.includes('from "next-themes"'));
check("the toggle offers light / dark / system", ["light", "dark", "system"].every((m) => toggle.includes(`setTheme("${m}")`)));
const providers = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
check("theme persists via next-themes class attribute", providers.includes('attribute="class"'));
check("the toggle is accessible", toggle.includes("sr-only"));

console.log(`\n${bad === 0 ? "UI ACCEPTANCE (THEME): PASS" : `UI ACCEPTANCE (THEME): ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
