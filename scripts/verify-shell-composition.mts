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

// Strip /* */ and // comments before checking -- several of these files'
// OWN doc comments explain the "no next/headers, no process.env" invariant
// using those exact strings, which would false-positive a whole-file
// substring check (same class of mistake hit in Slices 5/6/7's own tests).
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
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
check("Shell layout resolves context via the wrapper, not the raw composer", layout.includes("resolveShellContextForLayout("));
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

// ── every OTHER dashboard shell file is untouched ────────────────────────
{
  const PRE_SLICE8_COMMIT = "72c1a47";
  const filesThatMustBeUnchanged = [
    "src/app/(dashboard)/layout.tsx",
    "src/app/(dashboard)/sa/[subAccountId]/layout.tsx",
    "src/components/dashboard/sidebar.tsx",
    "src/components/dashboard/header.tsx",
    "src/components/billing/billing-guard.tsx",
    "src/components/ai-suite/zeno-launcher.tsx",
    "src/hooks/use-auth.ts",
    "src/context/sub-account-context.tsx",
  ];
  for (const f of filesThatMustBeUnchanged) {
    const before = readAtCommit(f, PRE_SLICE8_COMMIT);
    const after = read(f);
    check(`Untouched by this slice: ${f} (byte-for-byte identical to the pre-Slice-8 commit)`, before === after);
  }
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
