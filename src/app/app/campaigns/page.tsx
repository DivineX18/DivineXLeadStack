import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCreateContent } from "@/components/shell/ascend-create-content";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * DivineX Production Experience 2.0 — Campaigns.
 *
 * The customer-facing name for what the methodology called "Create". This
 * renders the SAME AscendCreateContent (real Funnel Builder + Website
 * Builder, every existing gate intact) with a different section label and
 * funnel base href — deliberately not a second implementation. The legacy
 * /app/create route redirects here.
 */
export default async function CampaignsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  const effectiveRole = shell?.workspace?.effectiveRole ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Campaigns"
        description="No active workspace yet — once you're linked to one, your campaigns will appear here."
        links={[]}
      />
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const isAdmin = effectiveRole === "admin" || effectiveRole === "agencyOwner";

  return (
    <AscendCreateContent
      saId={saId}
      isAdmin={isAdmin}
      websiteMaxSites={sub?.websiteMaxSites ?? null}
      title="Campaigns"
      description="Everything you're running to win business — funnels, pages and the sites behind them. Preview any draft before it goes live."
      funnelBaseHref="/app/campaigns/funnel"
    />
  );
}
