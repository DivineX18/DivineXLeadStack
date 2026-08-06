"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import type { AscendNavigationSection } from "@/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8 — the Full Ascend shell's lifecycle nav.
 * Client component only for `usePathname()` active-link highlighting; all
 * visibility/lock decisions arrive pre-computed from the server
 * (buildShellNavigation, lib/shell/build-shell-navigation.ts) — this
 * component makes no permission/entitlement decisions of its own.
 */
export function AscendShellNav({ sections }: { sections: AscendNavigationSection[] }) {
  const pathname = usePathname();

  if (sections.length === 0) {
    return <p className="px-3 text-sm text-white/50">No workspace selected.</p>;
  }

  return (
    <nav className="flex flex-col gap-1">
      {sections
        .filter((section) => section.visible)
        .map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);

          if (section.locked) {
            return (
              <div
                key={section.id}
                title={section.lockedReason ?? "Locked"}
                className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-white/40"
              >
                <span>{section.label}</span>
                <Lock className="h-3.5 w-3.5" />
              </div>
            );
          }

          return (
            <Link
              key={section.id}
              href={section.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
    </nav>
  );
}
