import Link from "next/link";
import { AscendShellNav } from "@/components/shell/ascend-shell-nav";
import type { AscendNavigationSection, AscendShellCapabilities, AscendBrandingContext } from "@/types/ascend-shell";

interface AscendShellSidebarContentProps {
  branding: AscendBrandingContext;
  navigation: AscendNavigationSection[];
  capabilities: AscendShellCapabilities;
  zenoHref: string | null;
}

/**
 * Ascend OS Phase 2, Slice 8.5 — the shell sidebar's content, extracted so
 * the desktop `<aside>` and the mobile drawer (ascend-mobile-nav.tsx)
 * render IDENTICAL navigation rather than two hand-maintained copies —
 * same reuse pattern the existing Flow sidebar already uses for its own
 * desktop-aside-vs-Sheet split (SidebarContent, confirmed by this slice's
 * audit). Server-renderable (no hooks of its own); AscendShellNav is the
 * only client boundary inside it.
 */
export function AscendShellSidebarContent({ branding, navigation, capabilities, zenoHref }: AscendShellSidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 px-3">
        <p className="text-lg font-semibold tracking-tight">{branding.productName}</p>
        <p className="text-xs text-[var(--dx-text-muted)]">{branding.tagline}</p>
      </div>

      <AscendShellNav sections={navigation} />

      <nav aria-label="Account and workspace" className="mt-auto flex flex-col gap-1 border-t border-[var(--dx-border-subtle)] px-3 pt-4 text-sm">
        {capabilities.isAgencyOwner && (
          <Link
            href="/app/command-center"
            className="rounded-md px-3 py-2 font-medium text-[var(--dx-text-secondary)] outline-none transition-colors hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] motion-reduce:transition-none"
          >
            Command Center
          </Link>
        )}
        {capabilities.canUseZeno && zenoHref && (
          <a
            href={zenoHref}
            className="rounded-md px-3 py-2 text-[var(--dx-text-secondary)] outline-none transition-colors hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] motion-reduce:transition-none"
          >
            Ask Zeno
          </a>
        )}
        {capabilities.canSwitchWorkspace && (
          <a
            href="/agency?next=/app/home"
            className="rounded-md px-3 py-2 text-[var(--dx-text-secondary)] outline-none transition-colors hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] motion-reduce:transition-none"
          >
            Switch workspace
          </a>
        )}
        {capabilities.canAccessAgency && (
          <a
            href="/agency?next=/app/home"
            className="rounded-md px-3 py-2 text-[var(--dx-text-secondary)] outline-none transition-colors hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] motion-reduce:transition-none"
          >
            Agency home
          </a>
        )}
      </nav>
    </div>
  );
}
