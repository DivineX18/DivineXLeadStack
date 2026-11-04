/**
 * Ascend OS Phase 2, Slice 8 — structural/source-level regression coverage
 * for the shell composer, wrappers, route group, and the additive-only
 * globals.css change. The pure decision functions already have genuine
 * unit-test coverage in verify-shell-decisions.mts.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const readAtCommit = (rel: string, commit: string) => execFileSync("git", ["show", `${commit}:${rel}`], { cwd: root, encoding: "utf8" });

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const composer = read("src/lib/shell/resolve-shell-context.ts");
const wrappers = read("src/lib/shell/shell-context-wrappers.ts");
const decider = read("src/lib/shell/decide-shell-mode.ts");
const navBuilder = read("src/lib/shell/build-shell-navigation.ts");
const branding = read("src/lib/shell/resolve-shell-branding.ts");
const fallbackRoute = read("src/lib/shell/resolve-shell-fallback-route.ts");
const layout = read("src/app/app/layout.tsx");
const middleware = read("src/middleware.ts");
const globalsCss = read("src/app/globals.css");

// Strip comments before checking -- several of these files' OWN doc
// comments explain the "no next/headers, no process.env" invariant using
// those exact strings, which would false-positive a whole-file substring
// check (same class of mistake hit in Slices 5/6/7's own tests).
//
// This was two regexes (block comments, then line comments), and a line
// comment containing "/*" defeats them: src/app/app/layout.tsx opens with
// "// /app/* carries no [subAccountId] URL segment", which opened a
// phantom block comment running to the next real "*/". Measured, that hid
// 1190 of the layout's 3142 code characters -- 38% of the file -- from any
// assertion reading stripped source. The four pure shell modules were
// unaffected (their "/app/*" comments have no later "*/" to close the
// phantom), so this hid nothing that shipped; it was a trap waiting for
// the next assertion to step in, which the wrapper check below promptly
// did. Fixing it is cheaper than remembering it.
//
// A single regex pass cannot know whether "/*" is code, string or comment,
// so this is a small scanner that tracks state instead. It is the honest
// minimum for a file whose job is reading source.
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  // "code" | "line" | "block" | the quote char of the string we are inside
  let state: "code" | "line" | "block" | '"' | "'" | "`" = "code";
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; }
      i++; continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; i += 2; continue; }
      // Keep newlines so line-anchored regexes downstream still behave.
      if (c === "\n") out += c;
      i++; continue;
    }
    // Inside a string literal: copy verbatim, honour backslash escapes.
    if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
    if (c === state) state = "code";
    out += c; i++;
  }
  return out;
}

// ── Pure functions stay pure -- no Firestore/headers/env inside them ─────
for (const [name, src] of [
  ["decide-shell-mode.ts", decider],
  ["build-shell-navigation.ts", navBuilder],
  ["resolve-shell-branding.ts", branding],
  ["resolve-shell-fallback-route.ts", fallbackRoute],
] as const) {
  const code = stripComments(src);
  check(`${name} imports no Firestore/Firebase Admin SDK`, !/firebase\/admin|getAdminDb|getAdminAuth/.test(code));
  check(`${name} imports no next/headers or next/navigation (not request/response-aware)`, !/next\/headers|next\/navigation/.test(code));
  check(`${name} does not read process.env directly (inputs only)`, !/process\.env/.test(code));
}

// ── One canonical composer, reuses (does not duplicate) Slice 7 ─────────
check("Exactly one core shell-context composer function exists", composer.includes("export async function resolveShellContext("));
check("Composer is server-only", composer.trimStart().startsWith('import "server-only"'));
check(
  "Composer reuses Slice 7's resolveIdentityForShell (not a duplicated identity/session/workspace lookup)",
  composer.includes('from "@/lib/identity/identity-wrappers"') && composer.includes("resolveIdentityForShell("),
);
check("Composer never performs its own Firestore identityLinks/workspaceMappings read (delegates entirely to Slice 7)", !/identityLinks|getMappingBySubAccountId/.test(composer));
check(
  "Composer reuses Slice 2's isFeatureFlagEnabled for BOTH unified_shell and unified_navigation (registered FeatureFlagIds, not invented strings)",
  composer.includes('isFeatureFlagEnabled("unified_shell"') && composer.includes('isFeatureFlagEnabled("unified_navigation"'),
);
check("Composer delegates the mode decision to the pure decideShellMode (no inline mode logic)", composer.includes("decideShellMode({") && !/mode\s*=\s*.*hostname\s*===.*workspaceTier/.test(composer));
check("Composer delegates navigation building to the pure buildShellNavigation (no inline nav logic)", composer.includes("buildShellNavigation("));
check("Composer delegates branding to the pure resolveShellBranding (no inline branding logic)", composer.includes("resolveShellBranding("));
check("Composer reuses the EXISTING resolveCustomBrand() for crm_only branding (not a duplicated brand lookup)", composer.includes('from "@/lib/landing/resolve-brand"'));

// ── Wrappers: the ONLY sanctioned entry points, same discipline as Slice 7 ─
check("Layout wrapper delegates to the core composer", wrappers.includes("return resolveShellContext(uid, options)"));
check("Server-action wrapper delegates to the core composer too (same function, not a parallel implementation)", (wrappers.match(/return resolveShellContext\(/g) ?? []).length >= 2);
check(
  "Service-to-service wrapper REQUIRES representedUid (not optional), same discipline as Slices 5-7",
  /representedUid: string;/.test(wrappers) && /if \(!params\.representedUid\)/.test(wrappers),
);
check("Layout wrapper reads the middleware-set x-user-uid header via next/headers (same header every API-route auth helper reads)", wrappers.includes('hdrs.get("x-user-uid")'));

// ── Route group: gates BEFORE rendering, never trusts a client mode ──────
// The layout must go through A wrapper, not the raw composer -- but which
// wrapper is an implementation detail that has already changed once
// (ForLayout -> ForPage, when pages needed the layout's own cookie-aware
// resolution). Naming one wrapper made this assertion fail on a rename
// that was itself a bug fix, so assert the invariant instead: imports come
// from the wrapper module, and the raw composer is never called here.
{
  const layoutCode = stripComments(layout);
  check(
    "Shell layout resolves context via a wrapper, not the raw composer",
    /from "@\/lib\/shell\/shell-context-wrappers"/.test(layoutCode) &&
      /resolveShellContextFor[A-Za-z]+\(/.test(layoutCode) &&
      !/[^A-Za-z]resolveShellContext\(/.test(layoutCode),
  );
}
check("Shell layout redirects (never renders Ascend UI) when mode !== full_ascend", layout.includes('shell.mode !== "full_ascend"') && layout.includes("redirect("));
check("Shell layout redirects when no shell context resolved at all (defense in depth)", /if \(!shell\)/.test(layout) && layout.includes('redirect("/login")'));
check("Shell layout delegates the fallback destination to the pure decideShellFallbackRoute (no inline redirect-target logic)", layout.includes("decideShellFallbackRoute("));
check("Shell layout never reads a client-supplied mode (no searchParams/query mode override)", !/searchParams.*mode|mode.*searchParams/.test(layout));

// ── /app/* is protected by default (not added to PUBLIC_PATHS) ──────────
check("middleware.ts's PUBLIC_PATHS/PUBLIC_PATH_PATTERNS were NOT modified to expose /app", !/"\/app"/.test(middleware) && !/\/\^\\\/app\\\//.test(middleware));

// ── middleware.ts's active-workspace cookie addition (post-Slice-8, the
// app.divinex.io domain cutover) is structurally safe: defensive, doesn't
// touch PUBLIC_PATHS, doesn't change the pre-existing custom-domain-rewrite
// or auth-middleware control flow. middleware.ts is deliberately no longer
// in the byte-identical set below -- it now legitimately needs to change to
// give /app/* a workspace-selection signal (see /app/layout.tsx's own
// "active_workspace_id" cookie read). This replaces byte-identity with
// structural checks matching this file's existing check() style.
{
  check("middleware.ts sets the active_workspace_id cookie", middleware.includes('"active_workspace_id"'));
  check(
    "Cookie-setting logic is wrapped in try/catch (never blocks a real request)",
    /function applyActiveWorkspaceCookie[\s\S]*?\{\s*try\s*\{[\s\S]*?\}\s*catch/.test(middleware),
  );
  check(
    "Cookie-setting logic does not reference PUBLIC_PATHS/PUBLIC_PATH_PATTERNS",
    (() => {
      const match = middleware.match(/function applyActiveWorkspaceCookie[\s\S]*?\n\}/);
      return !!match && !/PUBLIC_PATHS|PUBLIC_PATH_PATTERNS/.test(match[0]);
    })(),
  );
  check(
    "customDomainRewrite() is still checked first in middleware() (control-flow order unchanged)",
    /export default async function middleware[\s\S]*?customDomainRewrite\(request\)/.test(middleware),
  );
}

// ── the two shells stay separate frames ─────────────────────────────────
//
// This block used to pin eight Flow files byte-for-byte against the
// pre-Slice-8 commit, to prove the new Ascend shell had not disturbed
// Flow. That premise is OBSOLETE, not merely stale: the shells were
// deliberately unified afterwards, so Flow components are now shell-AWARE
// on purpose. src/context/sub-account-context.tsx imports
// resolveAscendShellHref because saPath() is the cross-shell link adapter
// (the mechanism that fixed the "Continue with Zeno" cross-workspace
// defect), and the Flow sidebar imports the shared ProductTour. Five of
// the eight pins were failing on exactly those intended changes.
//
// Re-pinning to today's commit would rebuild the same tripwire one month
// later, and it would fire on every file the Ascend redesign touches. The
// durable invariant underneath is narrower and still true: each shell
// renders its OWN chrome. Sharing a path resolver or a tour is fine;
// rendering Flow's sidebar inside Ascend (or the reverse) is the actual
// regression this was protecting against, and the behavioural suites
// (verify-shell-decisions, verify-funnels-navigation,
// verify-zeno-link-shell-aware) cover the routing half.
{
  const flowLayouts = [
    "src/app/(dashboard)/layout.tsx",
    "src/app/(dashboard)/sa/[subAccountId]/layout.tsx",
  ].map((f) => stripComments(read(f)));
  const ascendChrome = /ascend-shell-nav|ascend-shell-sidebar-content|ascend-mobile-nav|ascend-user-menu/;
  check(
    "Flow's dashboard layouts never render the Ascend shell chrome",
    flowLayouts.every((src) => !ascendChrome.test(src)),
  );
  check(
    "The Ascend layout never renders Flow's sidebar or header",
    !/components\/dashboard\/(sidebar|header)/.test(stripComments(layout)),
  );
}

// ── globals.css change is purely additive (no deletion, no :root/.dark edit) ─
{
  const diff = execFileSync("git", ["diff", "72c1a47", "--", "src/app/globals.css"], { cwd: root, encoding: "utf8" });
  const deletionLines = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  check("globals.css change contains zero deletion lines (purely additive)", deletionLines.length === 0);
  check("New tokens are scoped under .theme-ascend, not :root or .dark", globalsCss.includes(".theme-ascend {"));
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
