import "server-only";

import { headers } from "next/headers";
import { resolveShellContext } from "@/lib/shell/resolve-shell-context";
import type { AscendShellContext } from "@/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8 — the ONLY sanctioned ways anything in this
 * codebase should reach resolveShellContext(). Mirrors Slice 7's
 * identity-wrappers.ts discipline exactly: no route, layout, server
 * action, or future Ascend/Zeno bridge should call the core composer
 * directly.
 */

// ── 1. Server Component layout (no explicit uid available) ──────────────

/**
 * Reads the middleware-set `x-user-uid` header directly via `next/headers`
 * — the same header every API-route auth helper already reads from a
 * Request object (require-admin.ts, require-tenancy.ts, etc.), just
 * accessed through the Server Component API since a layout has no Request
 * object of its own. Returns null when unauthenticated (should not happen
 * under the shell route group, since it's not a public path and
 * middleware already redirects unauthenticated requests to /login — this
 * is a defensive fallback, not the primary gate).
 */
export async function resolveShellContextForLayout(options?: {
  explicitWorkspaceId?: string;
}): Promise<AscendShellContext | null> {
  const hdrs = await headers();
  const uid = hdrs.get("x-user-uid");
  if (!uid) return null;
  return resolveShellContext(uid, options);
}

// ── 2. Server Action / explicit uid already known ────────────────────────

export async function resolveShellContextForServerAction(
  uid: string,
  options?: { explicitWorkspaceId?: string },
): Promise<AscendShellContext> {
  return resolveShellContext(uid, options);
}

// ── 3. Future Ascend Intelligence bridge / Zeno (stub, not wired up) ─────

/**
 * Same service-to-service discipline as Slices 5-7: a represented uid is
 * required, never optional. Not called from anywhere yet — a named,
 * stable entry point for Slice 9+.
 */
export async function resolveShellContextForService(params: {
  representedUid: string;
  explicitWorkspaceId?: string;
}): Promise<AscendShellContext | { error: string }> {
  if (!params.representedUid) {
    return { error: "denied_invalid_context" };
  }
  return resolveShellContext(params.representedUid, { explicitWorkspaceId: params.explicitWorkspaceId });
}
