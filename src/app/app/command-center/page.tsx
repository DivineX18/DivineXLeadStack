import { notFound } from "next/navigation";
import { getCurrentAgencyOwner } from "@/lib/auth/require-agency-owner";
import { CommandCenterWorkspaceList } from "@/components/shell/command-center-workspace-list";
import { AscendRolloutSection } from "@/components/agency/ascend-rollout-section";
import { DesignIntelligenceSection } from "@/components/shell/design-intelligence-section";

/**
 * Ascend Command Center — the super-admin-only, native-to-Ascend-chrome
 * platform management surface. Gated identically to every other
 * agency-owner-only surface in this codebase (getCurrentAgencyOwner(),
 * same helper /agency/* itself would use) — the UI being reachable only via
 * a hidden nav link is NOT the real gate; this page-level check plus every
 * downstream API route's own requireAgencyOwnerAny() call are. Renders
 * notFound() rather than a 403 page for a non-owner, matching this
 * codebase's existing "don't advertise admin routes" convention.
 */
export default async function CommandCenterPage() {
  const owner = await getCurrentAgencyOwner();
  if (!owner) notFound();

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Command Center</h1>
        <p className="mt-1 text-sm text-white/50">
          Manage every workspace in your agency, its provisioning state, product entitlements, and rollout — without leaving Ascend.
        </p>
      </div>

      <CommandCenterWorkspaceList />

      <section className="rounded-2xl border border-white/10 p-5" style={{ background: "var(--glass-1)", backdropFilter: "blur(12px)" }}>
        <h2 className="mb-1 text-sm font-medium text-white/70">Platform rollout</h2>
        <p className="mb-4 text-xs text-white/40">Applies across the whole deployment, not per workspace.</p>
        <AscendRolloutSection />
      </section>

      <section className="rounded-2xl border border-white/10 p-5" style={{ background: "var(--glass-1)", backdropFilter: "blur(12px)" }}>
        <h2 className="mb-1 text-sm font-medium text-white/70">Design Intelligence</h2>
        <p className="mb-4 text-xs text-white/40">
          The Landing Page Calibration Engine — every generated funnel is scored against a 13-point premium bar, and
          operator feedback trains the design vault Zeno draws on for every future page, across every workspace.
        </p>
        <DesignIntelligenceSection />
      </section>
    </div>
  );
}
