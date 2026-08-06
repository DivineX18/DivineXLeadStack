import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { decideShellFallbackRoute } from "@/lib/shell/resolve-shell-fallback-route";
import { AscendShellNav } from "@/components/shell/ascend-shell-nav";

/**
 * Ascend OS Phase 2, Slice 8 — the Full Ascend shell frame. Mounted at
 * `/app/*`, transitional and feature-flagged: this route group renders
 * Ascend UI ONLY when resolveShellContext() decides "full_ascend" mode
 * (see decide-shell-mode.ts — requires the Ascend domain, a "full_ascend"
 * workspace entitlement tier, AND the "unified_shell" rollout flag, all
 * three). Everyone else is redirected to their existing, unmodified Flow
 * surface — this route group cannot change what a CRM-only customer sees.
 *
 * This is the unified customer-facing frame + transitional routing
 * architecture only (per this slice's explicit scope) — not the final
 * Home dashboard, not the Ascend Intelligence integration, not the Zeno
 * execution bridge, not a builder rewrite.
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

  return (
    <div className="theme-ascend flex min-h-dvh bg-[#08090d] text-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-black/40 p-4 md:flex">
        <div className="mb-6 px-3">
          <p className="text-lg font-semibold tracking-tight">{shell.branding.productName}</p>
          <p className="text-xs text-white/50">{shell.branding.tagline}</p>
        </div>

        <AscendShellNav sections={shell.navigation} />

        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 px-3 pt-4 text-sm">
          {shell.capabilities.canUseZeno && zenoHref && (
            <a href={zenoHref} className="rounded-md px-3 py-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white">
              Ask Zeno
            </a>
          )}
          {shell.capabilities.canSwitchWorkspace && (
            <a href="/agency" className="rounded-md px-3 py-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white">
              Switch workspace
            </a>
          )}
          {shell.capabilities.canAccessAgency && (
            <a href="/agency" className="rounded-md px-3 py-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white">
              Agency home
            </a>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 md:p-10">{children}</main>
    </div>
  );
}
