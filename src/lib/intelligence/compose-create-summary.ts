import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { listFunnels } from "@/lib/server/funnels-service";
import { FUNNEL_STATUS_LABEL, isPubliclyRenderable } from "@/types/funnels";
import type { WebsiteDoc, WebsiteStatus } from "@/types/website";
import type { WithMeta } from "@/types/intelligence";

/**
 * Server-side inventory for the Create section.
 *
 * WHY THIS IS NEW CODE. The North Star's Priority 2 names this exact gap by
 * example: a lifecycle section should open with context, insights and
 * "recent projects" before its tools, and /create had none of those. It
 * rendered the builder hub immediately, so the question "what have I
 * actually built, and is any of it live?" could only be answered by picking
 * a category tab and reading a list.
 *
 * The funnel half REUSES listFunnels() from lib/server/funnels-service, the
 * same Admin-SDK reader the funnel routes use, including its chain-step
 * filter so post-purchase steps do not appear as projects of their own. The
 * website half has no equivalent server-side lister (websites-service only
 * exposes getWebsiteForSubAccount for one doc), so the subcollection is read
 * here, by the same path and field names website-builder.tsx subscribes to.
 *
 * Deliberately never throws, for the same reason compose-agents-summary does
 * not: the execution band underneath is the real builder hub and works on
 * its own, so a read failure must cost the customer context, never the
 * feature.
 */

export interface CreateProject {
  kind: "funnel" | "website";
  id: string;
  name: string;
  /** Customer-facing status wording, never the storage value. */
  statusLabel: string;
  /** True only when the public can actually see it. */
  live: boolean;
  /** Where to open it inside the Ascend shell. */
  href: string;
  /** The public URL, when there is one. */
  liveUrl: string | null;
  at: number | null;
  /** Set when this project is why a recommendation exists. */
  needsAttention: string | null;
}

export interface CreateSummary {
  funnelsTotal: number;
  funnelsLive: number;
  funnelsDraft: number;
  funnelsAwaitingReview: number;
  websitesTotal: number;
  websitesLive: number;
  websitesBuilding: number;
  websitesNeedingReview: number;
  /** Newest first, across both kinds. */
  recent: CreateProject[];
}

function toMillis(value: unknown): number | null {
  const t = value as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

/**
 * Website status in the customer's words. "ready" reads as "Live" for the
 * same reason FUNNEL_STATUS_LABEL maps "published" that way: customers think
 * in terms of what the public can see, not our storage value.
 */
const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  building: "Building",
  ready: "Live",
  needs_review: "Needs review",
  failed: "Build failed",
};

export async function composeCreateSummary(workspaceId: string): Promise<WithMeta<CreateSummary>> {
  try {
    const [funnels, siteSnap] = await Promise.all([
      listFunnels(workspaceId).catch(() => []),
      getAdminDb()
        .collection(`subAccounts/${workspaceId}/website`)
        .get()
        .catch(() => null),
    ]);

    const projects: CreateProject[] = [];

    let funnelsLive = 0;
    let funnelsDraft = 0;
    let funnelsAwaitingReview = 0;

    for (const f of funnels) {
      const live = isPubliclyRenderable(f.status);
      if (live) funnelsLive += 1;
      if (f.status === "draft") funnelsDraft += 1;
      if (f.status === "ready_for_review") funnelsAwaitingReview += 1;
      projects.push({
        kind: "funnel",
        id: f.id,
        name: f.name?.trim() || "Untitled funnel",
        statusLabel: FUNNEL_STATUS_LABEL[f.status] ?? "Draft",
        live,
        href: `/create/funnel/${f.id}`,
        liveUrl: live ? `/lp/${f.id}` : null,
        at: toMillis(f.updatedAt) ?? toMillis(f.createdAt),
        needsAttention:
          f.status === "ready_for_review"
            ? "waiting on your review"
            : f.status === "changes_requested"
              ? "you asked for changes"
              : null,
      });
    }

    let websitesLive = 0;
    let websitesBuilding = 0;
    let websitesNeedingReview = 0;

    for (const doc of siteSnap?.docs ?? []) {
      const d = { id: doc.id, ...(doc.data() as Omit<WebsiteDoc, "id">) };
      const live = d.status === "ready";
      if (live) websitesLive += 1;
      if (d.status === "queued" || d.status === "building") websitesBuilding += 1;
      if (d.status === "needs_review") websitesNeedingReview += 1;
      projects.push({
        kind: "website",
        id: d.id,
        // The legacy singleton doc predates `name`, so fall back the way
        // website-builder.tsx's own card does.
        name: d.name?.trim() || d.config?.heading?.trim() || "Untitled site",
        statusLabel: WEBSITE_STATUS_LABEL[d.status] ?? "Draft",
        live,
        href: "/create",
        liveUrl: d.liveUrl ?? null,
        at: toMillis(d.updatedAt) ?? toMillis(d.lastBuildAt) ?? toMillis(d.createdAt),
        needsAttention:
          d.status === "needs_review"
            ? "built, but some claims need checking before you share it"
            : d.status === "failed"
              ? "the build failed"
              : null,
      });
    }

    projects.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

    return {
      meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null },
      data: {
        funnelsTotal: funnels.length,
        funnelsLive,
        funnelsDraft,
        funnelsAwaitingReview,
        websitesTotal: siteSnap?.size ?? 0,
        websitesLive,
        websitesBuilding,
        websitesNeedingReview,
        recent: projects.slice(0, 6),
      },
    };
  } catch {
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "firestore_read_failed" }, data: null };
  }
}
