import { ASCEND_LIFECYCLE_SECTIONS, type AscendLifecycleSectionId, type AscendNavigationSection } from "@/types/ascend-shell";
import type { WorkspaceIdentity } from "@/types/identity";
import type { WorkspacePermission } from "@/types/workspace-permissions";
import type { WorkspaceModule } from "@/types/workspace-entitlements";

/**
 * Ascend OS Phase 2, Slice 8 — the lifecycle-section -> permission/module
 * requirement map.
 *
 * IMPORTANT: this is a NEW SLICE 8 PRODUCT DECISION, not a discovered
 * repository fact — the audit confirmed zero prior UI code consumes Slice
 * 5's permissions or Slice 6's entitlements (see the Slice 8 ledger entry),
 * so there is no existing mapping to preserve. These are reasonable
 * first-pass associations between the Architecture spec's lifecycle names
 * and the CLOSEST existing permission (Slice 5) + module (Slice 6)
 * registry entries, chosen so Slice 8 can prove the gating mechanism works
 * end-to-end without inventing a new permission or module. Revisiting this
 * mapping (e.g. once Slice 9 defines what "Identify" actually renders) is
 * expected and does not require touching the gating mechanism itself.
 *
 * Home and Settings have no module requirement — Home is always reachable
 * once a workspace is active (it's the shell's own landing page, not a
 * Flow feature), and Settings maps only to a permission (workspace-level
 * administration, not a purchasable module).
 */
export const LIFECYCLE_REQUIREMENTS: Record<
  AscendLifecycleSectionId,
  { permission: WorkspacePermission | null; module: WorkspaceModule | null }
> = {
  home: { permission: null, module: null },
  // CREATE absorbs what was "Campaigns": everything Ascend builds — funnels,
  // pages, emails/SMS, ads/social, documents, media — as one searchable
  // library rather than a separate destination per asset type.
  create: { permission: "funnels.read", module: "funnels" },
  // LEADS absorbs what was "CRM": contacts, pipeline, conversations,
  // appointments and follow-up, framed as "who should I talk to?".
  leads: { permission: "pipeline.read", module: "pipeline" },
  // AGENTS surfaces the existing Flow AI channels (Web Chat, SMS, WhatsApp,
  // Voice, Outbound Voice). Gated on the ai_suite module they already run
  // on — no new module, no new permission, no new pricing.
  agents: { permission: "workspace.read", module: "ai_suite" },
  // PERFORMANCE answers "what's happening?" — business outcomes, not GA4.
  performance: { permission: "reports.read", module: "reports" },
  intelligence: { permission: "assessments.read", module: "growth_scan" },
  settings: { permission: "workspace.update", module: null },
};

const LIFECYCLE_LABELS: Record<AscendLifecycleSectionId, string> = {
  home: "Home",
  create: "Create",
  leads: "Leads",
  agents: "Agents",
  performance: "Performance",
  intelligence: "Intelligence",
  settings: "Settings",
};

/**
 * Pure. No Firestore, no request context — everything it needs is already
 * resolved onto `workspace` (Slice 7's WorkspaceIdentity, which itself
 * already carries `allowedPermissions` and `entitlements.allowedModules`
 * from Slices 5/6). Returns [] when no workspace is active, matching the
 * existing sidebar's "pick a sub-account first" empty state (see the
 * consuming layout for the equivalent UI).
 */
export function buildShellNavigation(workspace: WorkspaceIdentity | null): AscendNavigationSection[] {
  if (!workspace || workspace.status !== "active") return [];

  return ASCEND_LIFECYCLE_SECTIONS.map((id) => {
    const req = LIFECYCLE_REQUIREMENTS[id];
    const hasPermission = req.permission === null || workspace.allowedPermissions.includes(req.permission);
    const hasModule = req.module === null || (workspace.entitlements?.allowedModules.includes(req.module) ?? false);

    const visible = hasPermission;
    const locked = hasPermission && !hasModule;

    return {
      id,
      label: LIFECYCLE_LABELS[id],
      // Customer-facing clean URLs; the implementation stays at /app/* behind
      // the rewrites in next.config.ts. Home is the bare root.
      href: id === "home" ? "/" : `/${id}`,
      requiredPermission: req.permission,
      requiredModule: req.module,
      visible,
      locked,
      lockedReason: locked ? "Not included in this workspace's current plan" : null,
    };
  });
}
