import "server-only";

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/identity/resolve-identity";
import { logIdentityEvent } from "@/lib/identity/identity-audit";
import type { IdentityContext } from "@/types/identity";

/**
 * Ascend OS Phase 2, Slice 7 — the ONLY ways anything in this codebase
 * should reach resolveIdentity(). Same discipline as Slices 5/6's
 * wrapper files: no route, server action, or future shell/bridge should
 * call the core resolver directly.
 */

// ── 1. API route (HTTP) ────────────────────────────────────────────────

export async function resolveIdentityForRequest(
  request: Request,
  options?: { explicitWorkspaceId?: string },
): Promise<IdentityContext | NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return resolveIdentity(uid, options);
}

// ── 2. Server Action (no Request object) ─────────────────────────────────

export async function resolveIdentityForServerAction(
  uid: string,
  options?: { explicitWorkspaceId?: string },
): Promise<IdentityContext> {
  return resolveIdentity(uid, options);
}

// ── 3. Future unified shell (Slice 8) ──────────────────────────────────

/**
 * Named entry point for the future unified Next.js shell's layout/root
 * data loader (Slice 8, not built yet) — same signature as the server
 * action wrapper today since a shell layout is itself server-rendered,
 * but kept as its own named export so Slice 8 has an obvious, stable
 * place to attach shell-specific composition later (e.g. caching per
 * request) without touching this file's other call sites.
 */
export const resolveIdentityForShell = resolveIdentityForServerAction;

// ── 4. Future Ascend Intelligence bridge / Zeno (stubs, not wired up) ──

/**
 * Mirrors Slices 5/6's service-to-service pattern: a represented uid is
 * required, never optional — a shared secret alone must never imply an
 * identity. Not called from anywhere yet.
 */
export async function resolveIdentityForService(params: {
  representedUid: string;
  explicitWorkspaceId?: string;
}): Promise<IdentityContext | { error: string }> {
  if (!params.representedUid) {
    return { error: "denied_invalid_context" };
  }
  return resolveIdentity(params.representedUid, { explicitWorkspaceId: params.explicitWorkspaceId });
}

export async function resolveIdentityForZeno(params: { representedUid: string; workspaceId: string }): Promise<IdentityContext | { error: string }> {
  return resolveIdentityForService({ representedUid: params.representedUid, explicitWorkspaceId: params.workspaceId });
}

export const resolveIdentityForAscendBridge = resolveIdentityForZeno;

// ── Login / logout event recording ──────────────────────────────────────

/**
 * NOT a session-creation function — Flow's existing session creation
 * (lib/firebase/auth.ts::createSessionCookie(), the SSO finish page, the
 * native login form) is unchanged by this slice, per explicit
 * instruction. This is purely an audit hook a caller invokes AFTER an
 * existing flow has already completed, so "a new session started" is
 * observable without adding logic to any existing login path.
 */
export function recordLoginEvent(uid: string, source: "native" | "sso"): void {
  logIdentityEvent("login", uid, { source });
}

export function recordLogoutEvent(uid: string): void {
  logIdentityEvent("logout", uid);
}
