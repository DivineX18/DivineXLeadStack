import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { decideShellFallbackRoute } from "@/lib/shell/resolve-shell-fallback-route";
import { ascendDarkBranding } from "@/lib/shell/resolve-shell-branding";
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
  // /app/* carries no [subAccountId] URL segment, unlike /sa/[id]/... — the
  // "active_workspace_id" cookie (set by middleware.ts whenever a /sa/[id]/
  // request is made) is the only signal this layout has for which workspace
  // to resolve when the caller belongs to more than one. This is NEVER
  // trusted as authorization: resolveShellContextForLayout ->
  // resolveWorkspaceIdentity -> resolveSubAccountAccess independently
  // re-verifies real membership regardless of where the id came from, so a
  // forged/stale cookie can at worst cause a harmless redirect below, never
  // real access to a workspace the caller isn't really in.
  const activeWorkspaceId = (await cookies()).get("active_workspace_id")?.value;
  const shell = await resolveShellContextForLayout(
    activeWorkspaceId ? { explicitWorkspaceId: activeWorkspaceId } : undefined,
  );

  if (!shell) {
    redirect("/login");
  }

  // Command Center (docs/architecture/ASCEND_OS_LAUNCH_READINESS.md) is the
  // one /app/* surface that intentionally works without an active
  // full_ascend workspace — an agency owner managing the whole platform may
  // have no workspace selected, or their selected workspace may be
  // CRM-only. This is a narrow, path-scoped carve-out from the strict
  // full_ascend gate below, not a relaxation of it: every other lifecycle
  // page is completely unaffected, and even command-center itself only
  // bypasses here for a verified agency owner with an active session —
  // anyone else hitting /app/command-center falls straight through to the
  // existing fallback redirect, unchanged. This is never treated as
  // authorization on its own: every command-center route/server action
  // independently re-checks requireAgencyOwnerAny() itself.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const allowCommandCenterBypass =
    pathname.startsWith("/app/command-center") &&
    shell.capabilities.isAgencyOwner &&
    shell.identity.session.state === "active";

  if (shell.mode !== "full_ascend" && !allowCommandCenterBypass) {
    redirect(
      decideShellFallbackRoute({
        sessionState: shell.identity.session.state,
        // Only pass a workspaceId through when it resolved to a real,
        // active membership — a resolved-but-inactive/not-found workspace
        // (e.g. from a stale/foreign cookie value) should fall through to
        // the /agency picker, not bounce through a doomed /sa/{id}/...
        // redirect first.
        workspaceId: shell.workspace?.status === "active" ? shell.workspace.workspaceId : null,
      }),
    );
  }

  // Zeno is native to the shell now (Phase E) — no bounce out to /sa/*.
  const zenoHref = shell.workspace ? "/app/zeno" : null;
  const email = shell.identity.session.user?.email ?? null;
  // shell.branding tracks the REAL resolved mode, which is "crm_only" for
  // a command-center-bypass render (no active full_ascend workspace) —
  // Command Center still renders inside Ascend chrome per its own spec, so
  // it requests the dark branding directly rather than inheriting
  // whatever crm_only would otherwise resolve to.
  const branding = shell.mode === "full_ascend" ? shell.branding : ascendDarkBranding();

  return (
    <div className="theme-ascend flex min-h-dvh bg-[#08090d] text-[var(--dx-text-primary)]">
      <a
        href="#ascend-main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-black"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 border-r border-[var(--dx-border-subtle)] bg-black/40 p-4 md:flex">
        <AscendShellSidebarContent branding={branding} navigation={shell.navigation} capabilities={shell.capabilities} zenoHref={zenoHref} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--dx-border-subtle)] px-4 md:justify-end md:px-6">
          <AscendMobileNav branding={branding} navigation={shell.navigation} capabilities={shell.capabilities} zenoHref={zenoHref} />
          <span className="text-sm font-medium text-[var(--dx-text-secondary)] md:hidden">{branding.productName}</span>
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
