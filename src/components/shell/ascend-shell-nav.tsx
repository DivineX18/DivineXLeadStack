"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import type { AscendNavigationSection } from "@/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8.5 — the Full Ascend shell's lifecycle nav.
 * Client component only for `usePathname()` active-link highlighting; all
 * visibility/lock decisions arrive pre-computed from the server
 * (buildShellNavigation, lib/shell/build-shell-navigation.ts) — this
 * component makes no permission/entitlement decisions of its own.
 *
 * Slice 8.5 accessibility fixes (found by static/code audit, not yet
 * browser-reproduced — see docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md):
 *   - `aria-current="page"` on the active link (was missing entirely).
 *   - Locked sections are now a focusable, keyboard-discoverable element
 *     (`role="button"`, `tabIndex=0`, `aria-disabled`) with the lock
 *     reason exposed via `aria-label`, not just a `title` tooltip (which
 *     is unreliable for screen readers and invisible to keyboard-only
 *     users, since a plain non-interactive `<div>` was never a tab stop).
 *   - The nav has an explicit `aria-label` landmark name.
 */
export function AscendShellNav({ sections, ariaLabel = "Lifecycle navigation" }: { sections: AscendNavigationSection[]; ariaLabel?: string }) {
  const pathname = usePathname();

  if (sections.length === 0) {
    return <p className="px-3 text-sm text-[var(--dx-text-muted)]">No workspace selected.</p>;
  }

  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-1">
      {sections
        .filter((section) => section.visible)
        .map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);

          if (section.locked) {
            const reason = section.lockedReason ?? "Locked";
            return (
              <div
                key={section.id}
                role="button"
                tabIndex={0}
                aria-disabled="true"
                aria-label={`${section.label} — locked. ${reason}`}
                className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-[var(--dx-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
              >
                <span>{section.label}</span>
                <Lock aria-hidden="true" className="h-3.5 w-3.5" />
              </div>
            );
          }

          return (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] motion-reduce:transition-none ${
                active ? "bg-[var(--dx-surface-3)] text-[var(--dx-text-primary)]" : "text-[var(--dx-text-secondary)] hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)]"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
    </nav>
  );
}
