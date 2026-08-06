import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { decideShellFallbackRoute } from "@/lib/shell/resolve-shell-fallback-route";
import { AscendShellSidebarContent } from "@/components/shell/ascend-shell-sidebar-content";
import { AscendMobileNav } from "@/components/shell/ascend-mobile-nav";
import { AscendUserMenu } from "@/components/shell/ascend-user-menu";

/**
 * Ascend OS Phase 2, Slice 8 (stabilized in Slice 8.5) — the Full Ascend
 * shell frame. Mounted at `/app/*`, transitional and feature-flagged: this
 * route group renders Ascend UI ONLY when resolveShellContext() decides
 * "full_ascend" mode (see decide-shell-mode.ts — requires the Ascend
 * domain, a "full_ascend" workspace entitlement tier, AND the
 * "unified_shell" rollout flag, all three). Everyone else is redirected to
 * their existing, unmodified Flow surface — this route group cannot
 * change what a CRM-only customer sees.
 *
 * Slice 8.5 fixes (found by static/code audit against the certification
 * checklist — see docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md):
 *   - Mobile navigation was completely absent (the desktop `<aside>` was
 *     `hidden ... md:flex` with no alternative below 768px) — now uses
 *     AscendMobileNav, mirroring the existing Flow sidebar's own
 *     desktop-aside + mobile-Sheet-drawer split.
 *   - No user menu / sign-out existed anywhere in the shell — now uses
 *     AscendUserMenu (reuses the existing signOutUser(), not a new
 *     sign-out implementation).
 *   - No skip-to-content link existed — added below.
 *
 * This is the unified customer-facing frame + transitional routing
 * architecture only (per Slice 8's explicit scope, unchanged in 8.5) —
 * not the final Home dashboard, not the Ascend Intelligence integration,
 * not the Zeno execution bridge, not a builder rewrite.
 */
export default async function AscendAppLayout({ children }: { children: ReactNode }) {
  const shell = await resolveShellContextForLayout();

  if (!shell) {
    redirect("/login");
  }

  if (shell.mode !== "full_ascend") {
    redirect(
      decideShellFallbackRoute({
        sessionState: shell.identity.session.state,
        workspaceId: shell.workspace?.workspaceId ?? null,
      }),
    );
  }

  const zenoHref = shell.workspace ? `/sa/${shell.workspace.workspaceId}/ai-suite` : null;
  const email = shell.identity.session.user?.email ?? null;

  return (
    <div className="theme-ascend flex min-h-dvh bg-[#08090d] text-white">
      <a
        href="#ascend-main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-black"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-black/40 p-4 md:flex">
        <AscendShellSidebarContent branding={shell.branding} navigation={shell.navigation} capabilities={shell.capabilities} zenoHref={zenoHref} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 md:justify-end md:px-6">
          <AscendMobileNav branding={shell.branding} navigation={shell.navigation} capabilities={shell.capabilities} zenoHref={zenoHref} />
          <span className="text-sm font-medium text-white/80 md:hidden">{shell.branding.productName}</span>
          <div className="ml-auto md:ml-0">
            <AscendUserMenu email={email} />
          </div>
        </header>

        <main id="ascend-main" className="flex-1 overflow-y-auto p-6 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
