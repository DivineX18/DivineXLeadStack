"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { signOutUser } from "@/lib/firebase/auth";
import { maskEmail } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Ascend OS Phase 2, Slice 8.5 — the shell's user/account menu. Reuses the
 * EXISTING signOutUser() (lib/firebase/auth.ts) and the exact
 * clear-session-then-navigate-home pattern header.tsx already uses — not a
 * second sign-out implementation. Fixes a real gap found by this slice's
 * audit: the Slice 8 shell shipped with no user menu and no logout path
 * at all.
 */
export function AscendUserMenu({ email }: { email: string | null }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutUser();
    router.push("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-[var(--dx-text-secondary)] hover:bg-[var(--dx-hover)] hover:text-[var(--dx-text-primary)]" />}>
        <User className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Account menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {email && <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{maskEmail(email)}</div>}
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
