import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCreateContent } from "@/components/shell/ascend-create-content";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Ascend OS launch pass, Task B — replaces the Slice 8 placeholder with the
 * real Funnel Builder + Website Builder, reused as-is (not rebuilt) inside
 * Ascend chrome. FunnelsList/FunnelBuilder/WebsiteBuilder are already
 * prop-driven and carry their own gate checks + server-side enforcement
 * (see AscendCreateContent's own doc comment) — this page's only job is to
 * resolve the workspace id + the admin/site-cap inputs those components
 * need, server-side, the same way the legacy /sa/[id]/website page does via
 * useSubAccount() client-side.
 */
export default async function AscendCreatePage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;
  const effectiveRole = shell?.workspace?.effectiveRole ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Create"
        description="No active workspace yet — once you're linked to one, your builders will appear here."
        links={[]}
      />
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const isAdmin = effectiveRole === "admin" || effectiveRole === "agencyOwner";
  const websiteMaxSites = sub?.websiteMaxSites ?? null;

  return (
    <AscendCreateContent saId={saId} isAdmin={isAdmin} websiteMaxSites={websiteMaxSites} />
  );
}
