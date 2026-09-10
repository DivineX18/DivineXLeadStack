import "server-only";

import { headers, cookies } from "next/headers";
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

// ── 1b. Page Component reached under /app/* ───────────────────────────────

/**
 * Every page under /app/* is a separate Server Component render from
 * AscendAppLayout — Next.js does not thread a layout's resolved data down
 * to its page automatically, so each page that needs `shell.workspace`
 * (not just the chrome the layout already rendered) has always had to call
 * resolveShellContextForLayout() again itself. Until this wrapper existed,
 * every one of those call sites called it with NO options, meaning the
 * page's own resolution never saw the "active_workspace_id" cookie the
 * layout reads — for a multi-membership caller this fell through
 * decideWorkspaceSelection's "multiple_available, don't guess" branch and
 * silently produced workspace: null (an honest "No active workspace yet."
 * empty state on every /app/* page), even though the layout's OWN
 * cookie-aware call had already resolved a real workspace and rendered the
 * full_ascend chrome around it. This wrapper is the fix: the one place a
 * page should call to get the SAME workspace resolution the layout used.
 */
export async function resolveShellContextForPage(): Promise<AscendShellContext | null> {
  const activeWorkspaceId = (await cookies()).get("active_workspace_id")?.value;
  if (activeWorkspaceId) {
    return resolveShellContextForLayout({ explicitWorkspaceId: activeWorkspaceId });
  }

  // FRESH LOGIN, NO COOKIE YET.
  //
  // decideWorkspaceSelection() deliberately refuses to guess between several
  // candidate workspaces, and it is right to: no "last active" signal exists
  // in the schema, and inventing one at the identity layer would be a real
  // correctness bug. But that returned workspace: null on a fresh login for
  // any multi-membership caller, so the server could not tell WHICH product
  // this person had bought, decideShellMode() fell through to crm_only, and
  // /dashboard rendered Flow while the client-side redirect worked out where
  // the visitor actually belonged. That is the visible "Flow for a few
  // seconds, then Ascend" flash.
  //
  // The tie-break lives here, in the shell wrapper, rather than in the pure
  // resolver: which workspace to OPEN when the customer has not said is a
  // presentation choice, not an identity fact. It reproduces exactly what the
  // client-side redirect already does today (LegacyRedirect sorts memberships
  // by accountNumber and takes the lowest, conventionally the Main/original
  // workspace) so the server and the client can never pick differently.
  //
  // This never grants access: the second resolve runs the full membership +
  // entitlement path for the chosen workspace, so a workspace the caller is
  // not really a member of resolves to inactive and falls back to crm_only.
  const shell = await resolveShellContextForLayout();
  if (!shell || shell.workspaceSelection.reason !== "multiple_available") return shell;

  const pick = await pickLowestAccountNumber(shell.workspaceSelection.candidates);
  if (!pick) return shell;
  return resolveShellContextForLayout({ explicitWorkspaceId: pick });
}

/** Lowest `accountNumber` among the caller's candidate workspaces, id as a
 *  stable tie-break so the choice is deterministic across renders. Returns
 *  null if nothing could be read, in which case the caller keeps the honest
 *  "no workspace selected" state rather than guessing. */
async function pickLowestAccountNumber(candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const db = getAdminDb();
    const snaps = await Promise.all(candidates.map((id) => db.doc(`subAccounts/${id}`).get()));
    const ranked = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, accountNumber: Number(s.data()?.accountNumber ?? Number.MAX_SAFE_INTEGER) }))
      .sort((a, b) => a.accountNumber - b.accountNumber || a.id.localeCompare(b.id));
    return ranked[0]?.id ?? null;
  } catch {
    return null;
  }
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
