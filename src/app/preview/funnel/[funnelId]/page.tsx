import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMemberForPage } from "@/lib/auth/require-tenancy-page";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";
import { VisualRequirementsPanel } from "@/components/funnels/visual-requirements-panel";
import { CopyReviewNotice } from "@/components/funnels/copy-review-notice";
import { loadFunnelFormsForPreview } from "@/lib/funnels/load-funnel-for-render";
import type { FunnelDoc } from "@/types/funnels";

export const dynamic = "force-dynamic";

/**
 * THE ONE CANONICAL DRAFT PREVIEW (Production Experience 2.0, Phase B).
 *
 * Root cause it fixes: loadFunnelForRender() returns null for anything not
 * published, so a Zeno-built draft could not be rendered anywhere — the
 * funnel existed but the product could never show it. Publishing first was
 * the only way to see your own page.
 *
 * ONE implementation, reachable from every surface (Zeno build completion,
 * campaign detail, funnel list, funnel editor). It renders the REAL
 * production component (PublicFunnelView) against the live draft document,
 * so what you preview is what publishes — no second renderer.
 *
 * Safety contract:
 *   - Auth + tenancy: workspace membership is required and the funnel must
 *     belong to that workspace, so a preview link can never expose another
 *     tenant's draft.
 *   - Non-production: previewMode suppresses form submissions and CTA
 *     side-effects, so previewing cannot create real leads, fire real
 *     automations, or pollute production analytics.
 *   - Never publishes: this route only reads.
 *   - Full-bleed: deliberately OUTSIDE /app/* so the Ascend shell's sidebar
 *     and page padding never distort the funnel — preview must render at the
 *     same widths a real visitor sees, including on mobile.
 *
 * The older /funnel-preview/[subAccountId]/[funnelId] route now redirects
 * here so there is exactly one preview implementation, not two that drift.
 */
export default async function FunnelPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ w?: string; from?: string }>;
}) {
  const { funnelId } = await params;
  const sp = await searchParams;

  const snap = await getAdminDb().doc(`funnels/${funnelId}`).get();
  if (!snap.exists) notFound();
  const data = snap.data() as Omit<FunnelDoc, "id">;

  // Tenancy gate: membership in the funnel's OWN workspace.
  const access = await requireSubAccountMemberForPage(data.subAccountId);
  if (!access) notFound();

  const funnel: FunnelDoc = { id: snap.id, ...data, createdAt: null, updatedAt: null };
  const forms = await loadFunnelFormsForPreview(funnel);
  const isDraft = funnel.status !== "published";
  const backHref = sp.from === "campaign" ? `/app/create` : `/app/create?funnel=${funnelId}`;

  return (
    <div className="theme-ascend min-h-dvh" style={{ backgroundColor: "var(--dx-surface-0)" }}>
      {/* Draft indicator + return path are always present and never part of
          the rendered page itself. */}
      <div
        className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b px-4 py-3"
        style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}
      >
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: "var(--dx-text-secondary)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: isDraft ? "var(--dx-opportunity-subtle)" : "var(--dx-growth-subtle)",
            color: isDraft ? "var(--dx-opportunity)" : "var(--dx-growth)",
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          {isDraft ? "Draft preview" : "Published — preview"}
        </span>
        <span className="truncate text-sm font-medium" style={{ color: "var(--dx-text-primary)" }}>
          {funnel.name}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs sm:inline" style={{ color: "var(--dx-text-muted)" }}>
            Form submissions are disabled in preview
          </span>
          <Link
            href={`/app/create/funnel/${funnelId}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--dx-radius-sm)] px-3 py-1.5 text-sm font-semibold dx-primary-action"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        </span>
      </div>

      {/* Unresolved visual requirements, resolvable in place. Deliberately
          ABOVE the page: a blank slot inside the composition reads as a bug,
          whereas a named brief with actions reads as the next step. Completed
          Director decisions are not shown — they are resolved choices, not
          gaps. */}
      <CopyReviewNotice funnel={funnel} />
      <VisualRequirementsPanel
        subAccountId={data.subAccountId}
        funnelId={funnelId}
        requirements={funnel.visualRequirements ?? []}
      />

      {/* The REAL production renderer against the live draft document. */}
      <PublicFunnelView funnel={funnel} forms={forms} previewMode />
    </div>
  );
}
