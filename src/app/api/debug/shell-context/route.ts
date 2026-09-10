import "server-only";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";

/**
 * TEMPORARY diagnostic route — not part of the plan. Exposes the exact
 * runtime signals resolveShellContext()/decideShellMode() use, computed the
 * SAME way app/layout.tsx does (reuses resolveShellContextForLayout with
 * the same cookie-derived explicitWorkspaceId), so what this shows is
 * exactly what the real layout sees on this request. Protected implicitly
 * by middleware (this path isn't in PUBLIC_PATHS, so an unauthenticated
 * request never reaches here). DELETE THIS FILE once the bug is found.
 */
export async function GET() {
  const hdrs = await headers();
  const cookieStore = await cookies();

  const hostHeader = hdrs.get("host");
  const hostname = hostHeader ? hostHeader.split(":")[0].toLowerCase() : null;

  let ascendHostname: string | null = null;
  try {
    ascendHostname = process.env.NEXT_PUBLIC_ASCEND_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_ASCEND_APP_URL).hostname.toLowerCase()
      : null;
  } catch {
    ascendHostname = null;
  }

  const activeWorkspaceCookie = cookieStore.get("active_workspace_id");
  const explicitWorkspaceId = activeWorkspaceCookie?.value;

  const uid = hdrs.get("x-user-uid");

  // Must be the SAME resolver app/layout.tsx uses, or this route reports a
  // shell nobody actually gets. It follows the layout onto
  // resolveShellContextForPage(), which reads the cookie itself and adds the
  // fresh-login fallback for a caller who has not selected a workspace yet.
  const shell = await resolveShellContextForPage();

  return NextResponse.json({
    // Raw signals, computed the same way resolve-shell-context.ts does
    hostHeader,
    hostname,
    ascendHostname,
    hostnameMatchesAscend: !!hostname && !!ascendHostname && hostname === ascendHostname,
    activeWorkspaceCookiePresent: !!activeWorkspaceCookie,
    activeWorkspaceCookieValue: explicitWorkspaceId ?? null,
    uidFromMiddlewareHeader: uid,
    nodeEnv: process.env.NODE_ENV,

    // Resolved shell context -- exactly what app/layout.tsx sees
    shellIsNull: shell === null,
    shellMode: shell?.mode ?? null,
    sessionState: shell?.identity.session.state ?? null,
    workspaceSelectionReason: shell?.identity.workspaceSelection.reason ?? null,
    workspaceSelectionCandidates: shell?.identity.workspaceSelection.candidates ?? null,
    workspaceId: shell?.workspace?.workspaceId ?? null,
    workspaceStatus: shell?.workspace?.status ?? null,
    workspaceEffectiveTier: shell?.workspace?.entitlements?.effectiveTier ?? null,
    workspaceEffectiveRole: shell?.workspace?.effectiveRole ?? null,
    isAgencyOwner: shell?.identity.session.user?.agencyRole === "owner",
    unifiedShellFlagEnabled: shell?.rollout.unifiedShellEnabled ?? null,
    unifiedNavigationEnabled: shell?.rollout.unifiedNavigationEnabled ?? null,
  });
}
