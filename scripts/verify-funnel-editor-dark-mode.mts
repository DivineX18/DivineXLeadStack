/**
 * BUG-005 / BUG-007 — Lead Magnet (and every other) funnel editor: dark
 * theme, Visual tab, the page background behind/between the content cards
 * rendered in the LIGHT theme's cream color while every card kept its own
 * correct dark background. Fields mode on the identical page was unaffected.
 *
 * Root cause: VisualCanvas (funnel-builder's "Visual" tab) renders
 * PublicFunnelView INLINE in the admin editor's own document — "this is NOT
 * a second renderer... renders PublicFunnelView... once per section" (see
 * visual-canvas.tsx's own header comment) — so it shares one html/body with
 * the sidebar and every card around it. PublicFunnelView injects a global
 * `<style>html, body { background: ... !important }</style>` so the three
 * REAL standalone routes (/lp/[funnelId], /preview/funnel/[funnelId], custom
 * domains — each its own Next.js route with its own html/body) can't show a
 * flash of the wrong color at the edges from next-themes' system-preference
 * class. Inside the editor that same rule has nothing of its own to scope
 * to, so it leaked out and permanently overwrote the ADMIN page's html/body
 * background with the funnel's own color the moment Visual mode mounted —
 * independent of admin theme, because of the `!important` + bare `html,
 * body` selector.
 *
 * Fix: an `embedded` prop on PublicFunnelView skips exactly that one global
 * rule (keeping the per-funnel heading-font rules, which are legitimately
 * scoped to `.flow-funnel-root` and harmless anywhere). The root div's own
 * inline `background: bg` style already paints the canvas's own area
 * correctly in both modes — only the stray global reach is removed. The
 * three real standalone routes do not pass `embedded`, so their own
 * html/body fix is untouched.
 *
 * Structural, source-level — same class as every other verify-*.mts here;
 * a real `--conditions=react-server`-gated render test would need the full
 * Next.js app tree mounted, which this repo's structural convention doesn't
 * do for client components.
 *
 * Run: npx tsx scripts/verify-funnel-editor-dark-mode.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const view = read("src/components/funnels/public-funnel-view.tsx");
const canvas = read("src/components/funnels/visual-canvas.tsx");
const lp = read("src/app/lp/[funnelId]/page.tsx");
const previewRoute = read("src/app/preview/funnel/[funnelId]/page.tsx");
const cdomain = read("src/app/cdomain/[hostname]/[[...rest]]/page.tsx");

// ── 1. PublicFunnelView has the new, properly-documented embedded prop ────
check("1a. PublicFunnelView accepts an `embedded` prop, default false", /embedded = false,/.test(view));

// ── 2. The global html/body override is gated behind !embedded ───────────
const styleRegion = view.slice(view.indexOf("Measurement lives HERE"), view.indexOf("return (\n    <>") + 2000);
check(
  "2a. the bare `html, body { background: ... !important }` rule only renders when NOT embedded",
  /\{!embedded && \(\s*<style>\{`html, body \{ background: \$\{bg\} !important/.test(view),
);
check(
  "2b. the embedded branch still applies the per-funnel heading-font rules (scoped to .flow-funnel-root, never global) -- embedding removes ONLY the global reach, not the funnel's own typography",
  (() => {
    const embeddedBranch = view.slice(view.indexOf("{embedded && ("), view.indexOf("{embedded && (") + 400);
    return /\.flow-funnel-root h1, \.flow-funnel-root h2, \.flow-funnel-root h3/.test(embeddedBranch) && !/html, body \{ background/.test(embeddedBranch);
  })(),
);

// ── 3. VisualCanvas (the only embedded caller) passes embedded ───────────
check(
  "3a. VisualCanvas's PublicFunnelView call passes embedded (the ONLY caller that shares the admin's own html/body)",
  /<PublicFunnelView funnel=\{single\} forms=\{forms\} previewMode embedded \/>/.test(canvas),
);

// ── 4. The three REAL standalone routes do NOT pass embedded, so their own
// html/body background-flash fix is untouched (regression guard — this is
// the fix this file's own comment says is legitimate and must be kept) ────
for (const [name, src] of [
  ["/lp/[funnelId]", lp],
  ["/preview/funnel/[funnelId]", previewRoute],
  ["/cdomain/[hostname]/[[...rest]]", cdomain],
] as const) {
  const call = src.slice(src.indexOf("<PublicFunnelView"), src.indexOf("<PublicFunnelView") + 150);
  check(`4. ${name} renders PublicFunnelView WITHOUT embedded (keeps its own real html/body fix)`, call.includes("<PublicFunnelView") && !/\bembedded\b/.test(call));
}

// ── 5. MUTATION guard: embedded must default to false, not true ──────────
// (a flipped default would silently break the three real routes' own fix,
// since none of them pass the prop explicitly either way).
check("5. embedded defaults to false, not true -- the real standalone routes rely on this default", /embedded = false,/.test(view) && !/embedded = true,/.test(view));

console.log(
  failures === 0
    ? `\nverify-funnel-editor-dark-mode: all checks passed`
    : `\nverify-funnel-editor-dark-mode: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
