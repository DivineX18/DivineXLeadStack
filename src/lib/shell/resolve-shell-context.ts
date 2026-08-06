import "server-only";

import { headers } from "next/headers";
import { resolveIdentityForShell } from "@/lib/identity/identity-wrappers";
import { isFeatureFlagEnabled } from "@/lib/flags/evaluate-flag";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { decideShellMode } from "@/lib/shell/decide-shell-mode";
import { buildShellNavigation } from "@/lib/shell/build-shell-navigation";
import { resolveShellBranding } from "@/lib/shell/resolve-shell-branding";
import type { AscendShellContext, ShellModeSignals } from "@/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8 — the single canonical shell-context composer.
 * Composes Slice 7's resolveIdentityForShell() (never a duplicated
 * identity/session/workspace lookup) with shell-specific state: mode,
 * lifecycle navigation, branding, rollout flags, capabilities. Callers
 * should go through lib/shell/shell-context-wrappers.ts, not this function
 * directly — same discipline as Slice 7's resolve-identity.ts vs
 * identity-wrappers.ts.
 *
 * Does not authenticate. `uid` must already be a middleware-verified
 * Firebase uid.
 */
export async function resolveShellContext(
  uid: string,
  options?: { explicitWorkspaceId?: string },
): Promise<AscendShellContext> {
  const identity = await resolveIdentityForShell(uid, options);

  const hdrs = await headers();
  const hostname = normalizeHostname(hdrs.get("host"));
  const ascendHostname = safeHostnameFromUrl(process.env.NEXT_PUBLIC_ASCEND_APP_URL);

  const workspaceTier = identity.workspace?.entitlements?.effectiveTier ?? null;
  const isAgencyOwner = identity.session.user?.agencyRole === "owner";

  // Flag evaluation reads Firestore -- skip it entirely for an inactive/no
  // session rather than evaluating a flag for a caller who can't act on it.
  const [unifiedShellFlagEnabled, unifiedNavigationEnabled] =
    identity.session.state === "active"
      ? await Promise.all([
          isFeatureFlagEnabled("unified_shell", { uid, workspaceId: identity.workspace?.workspaceId, isAgencyOwner }),
          isFeatureFlagEnabled("unified_navigation", { uid, workspaceId: identity.workspace?.workspaceId, isAgencyOwner }),
        ])
      : [false, false];

  const devOverrideRaw = process.env.ASCEND_SHELL_MODE_OVERRIDE;
  const devOverride: ShellModeSignals["devOverride"] =
    devOverrideRaw === "full_ascend" || devOverrideRaw === "crm_only" ? devOverrideRaw : null;

  const mode = decideShellMode({
    hostname,
    ascendHostname,
    workspaceTier,
    unifiedShellFlagEnabled,
    devOverride,
    isProduction: process.env.NODE_ENV === "production",
  });

  const navigation = mode === "full_ascend" ? buildShellNavigation(identity.workspace) : [];

  const flowBrand = await resolveCustomBrand();
  const branding = resolveShellBranding(mode, flowBrand);

  return {
    mode,
    identity,
    workspace: identity.workspace,
    workspaceSelection: identity.workspaceSelection,
    navigation,
    branding,
    rollout: { unifiedShellEnabled: unifiedShellFlagEnabled, unifiedNavigationEnabled },
    capabilities: {
      canSwitchWorkspace: identity.workspaceSelection.candidates.length > 1,
      canAccessSettings: identity.workspace?.status === "active" || isAgencyOwner,
      canAccessAgency: !!identity.session.user?.agencyId,
      canUseZeno: identity.workspace?.allowedPermissions.includes("zeno.advise") ?? false,
    },
  };
}

function normalizeHostname(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.split(":")[0].toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function safeHostnameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}
