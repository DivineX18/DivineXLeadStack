"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AscendShellSidebarContent } from "@/components/shell/ascend-shell-sidebar-content";
import type { AscendNavigationSection, AscendShellCapabilities, AscendBrandingContext } from "@/types/ascend-shell";

interface AscendMobileNavProps {
  branding: AscendBrandingContext;
  navigation: AscendNavigationSection[];
  capabilities: AscendShellCapabilities;
  zenoHref: string | null;
}

/**
 * Ascend OS Phase 2, Slice 8.5 — the shell's mobile navigation. Fixes a
 * real, severe defect found by this slice's audit: the Slice 8 shell's
 * `<aside>` was `hidden ... md:flex`, meaning mobile viewports (<768px)
 * had ZERO way to reach any lifecycle section. Mirrors the EXISTING
 * Flow sidebar's exact desktop-aside + mobile-Sheet-drawer split
 * (components/dashboard/sidebar.tsx) — same primitive (Sheet, built on
 * Base UI's Dialog, which provides focus-trap + Escape-to-close for
 * free), same close-on-navigate behavior.
 */
export function AscendMobileNav({ branding, navigation, capabilities, zenoHref }: AscendMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation, same as the existing Flow sidebar.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <Button variant="ghost" size="icon" className="text-[var(--dx-text-secondary)] hover:bg-[var(--dx-surface-2)] hover:text-[var(--dx-text-primary)] md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="theme-ascend w-72 border-[var(--dx-border-subtle)] bg-[#08090d] p-4 text-[var(--dx-text-primary)]">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <AscendShellSidebarContent branding={branding} navigation={navigation} capabilities={capabilities} zenoHref={zenoHref} />
        </SheetContent>
      </Sheet>
    </>
  );
}
