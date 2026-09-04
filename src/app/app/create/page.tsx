import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCreateContent } from "@/components/shell/ascend-create-content";
import { SubAccountProvider } from "@/context/sub-account-context";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * CREATE — P0.3.
 *
 * Campaigns is no longer a top-level concept: it lives inside Create, which is
 * the single library for everything Ascend builds. This
 * renders the SAME AscendCreateContent (real Funnel Builder + Website
 * Builder, every existing gate intact) with a different section label and
 * funnel base href — deliberately not a second implementation. The legacy
 * /app/create route redirects here.
 */
export default async function CreatePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  const effectiveRole = shell?.workspace?.effectiveRole ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Create"
        description="No active workspace yet — once you're linked to one, everything you build will appear here."
        links={[]}
      />
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const isAdmin = effectiveRole === "admin" || effectiveRole === "agencyOwner";

  // Flow components mounted here (FunnelsList, WebsiteBuilder) resolve their
  // links through saPath(); inAscendShell keeps those links inside the unified
  // experience instead of bouncing the customer to /sa/{id}.
  return (
    <SubAccountProvider subAccountId={saId} inAscendShell>
      <AscendCreateContent
      saId={saId}
      isAdmin={isAdmin}
      websiteMaxSites={sub?.websiteMaxSites ?? null}
      title="Create"
      description="Everything you're running to win business — funnels, pages and the sites behind them. Preview any draft before it goes live."
      funnelBaseHref="/app/create/funnel"
      />
    </SubAccountProvider>
  );
}
