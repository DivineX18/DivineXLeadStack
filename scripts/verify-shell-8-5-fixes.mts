/**
 * Ascend OS Phase 2, Slice 8.5 — regression coverage for every defect
 * fixed this slice (fixing policy §15 item 3: "Add a regression test
 * where practical"). Structural/source-level, same class as
 * verify-shell-composition.mts — these properties are also exercised
 * live by e2e/shell/full-ascend-entry.spec.ts and
 * e2e/shell/lifecycle-navigation.spec.ts once a real test account is
 * configured (see e2e/README.md); this script guarantees the code-level
 * fix can never silently regress even without one.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const nav = read("src/components/shell/ascend-shell-nav.tsx");
const layout = read("src/app/app/layout.tsx");
const mobileNav = read("src/components/shell/ascend-mobile-nav.tsx");
const userMenu = read("src/components/shell/ascend-user-menu.tsx");
const sidebarContent = read("src/components/shell/ascend-shell-sidebar-content.tsx");
const globalsCss = read("src/app/globals.css");

// ── Defect: no aria-current on the active nav link ───────────────────────
check("FIXED: active nav link sets aria-current=\"page\"", nav.includes('aria-current={active ? "page" : undefined}'));

// ── Defect: locked nav items were non-focusable, tooltip-only divs ──────
check("FIXED: locked nav items are keyboard-focusable (tabIndex=0)", nav.includes("tabIndex={0}"));
check("FIXED: locked nav items expose the lock reason via aria-label, not just a title tooltip", nav.includes("aria-label={`${section.label}"));
check("FIXED: locked nav items are marked aria-disabled for assistive tech", nav.includes('aria-disabled="true"'));

// ── Defect: nav had no accessible landmark name ──────────────────────────
check("FIXED: lifecycle nav has an explicit aria-label landmark", nav.includes('aria-label={ariaLabel}'));

// ── Defect: mobile viewports had ZERO navigation (aside was md:flex only) ─
check("FIXED: shell layout renders AscendMobileNav (mobile drawer) alongside the desktop aside", layout.includes("<AscendMobileNav"));
check("FIXED: AscendMobileNav renders the SAME sidebar content as desktop (no second hand-maintained nav)", mobileNav.includes("<AscendShellSidebarContent"));
check("FIXED: mobile nav trigger is icon-only but has an accessible name", mobileNav.includes('aria-label="Open navigation"'));
check("FIXED: mobile drawer closes on navigation (mirrors the existing Flow sidebar's exact pattern)", /useEffect\(\(\) => \{\s*setOpen\(false\);/.test(mobileNav));

// ── Defect: no user menu / no logout path existed anywhere in the shell ──
check("FIXED: shell layout renders AscendUserMenu", layout.includes("<AscendUserMenu"));
check("FIXED: user menu reuses the EXISTING signOutUser() (not a duplicated sign-out implementation)", userMenu.includes('from "@/lib/firebase/auth"') && userMenu.includes("signOutUser()"));

// ── Defect: no skip-to-content link existed ──────────────────────────────
check("FIXED: shell layout has a skip-to-content link targeting #ascend-main", layout.includes('href="#ascend-main"') && layout.includes('id="ascend-main"'));

// ── Defect: desktop aside and mobile drawer duplicated markup ───────────
check("FIXED: desktop aside reuses AscendShellSidebarContent (single source of nav markup, shared with mobile)", layout.includes("<AscendShellSidebarContent"));
check("Desktop aside does NOT re-implement its own inline nav markup (no stray <AscendShellNav directly in layout.tsx anymore)", !layout.includes("<AscendShellNav"));

// ── Defect: no reduced-motion handling ───────────────────────────────────
check("FIXED: .theme-ascend scope honors prefers-reduced-motion", globalsCss.includes("prefers-reduced-motion: reduce") && globalsCss.includes(".theme-ascend *"));

// ── Sidebar content wraps the secondary (account/workspace) links in a labeled landmark ──
check("Secondary links (Zeno/Switch workspace/Agency home) live in a labeled nav landmark, not a bare div", sidebarContent.includes('aria-label="Account and workspace"'));

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
