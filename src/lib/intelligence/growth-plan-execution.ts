import "server-only";

import { listFunnels } from "@/lib/server/funnels-service";
import type { FunnelDoc, FunnelStatus } from "@/types/funnels";

/**
 * GROWTH PLAN — EXECUTION PROJECTION (P0.6 Phase 3).
 *
 * Answers the three customer questions Home could not: what has been built,
 * what needs my review, and what happens next for work already underway.
 *
 * A PROJECTION, NOT AN AUTHORITY. The survey (d49d421) established that five
 * plan-adjacent concepts already exist and none of them is a plan; a sixth
 * store would duplicate truths the artifact already owns. So nothing here is
 * persisted. Customer-facing state is DERIVED AT READ TIME from the
 * artifact's own status, which is why the plan can never drift out of
 * agreement with the artifact — there is no second copy to drift.
 *
 * APPROVED IS NOT PUBLISHED. That law is enforced in the label itself:
 * `approved` reads "Approved — not published yet". A surface that rendered it
 * as a finished state would teach customers that approving publishes, which
 * is exactly what P0.4 froze.
 */

export type PlanStage = "needs_you" | "in_progress" | "live" | "inactive";

export interface GrowthPlanItem {
  artifactId: string;
  /** Customer nouns only — never a capability name. */
  kind: "Landing page";
  name: string;
  /** What the customer should understand the state to be. */
  stateLabel: string;
  stage: PlanStage;
  /** The single most useful thing to do next, given the state. */
  nextAction: { label: string; href: string };
  /** Concrete, actionable review items — not a generic "needs review". */
  reviewNotes: string[];
  updatedAtMs: number;
}

/**
 * The mapping between authoritative artifact status and what the customer
 * reads. Deliberately total over FunnelStatus so a new state cannot be added
 * without a decision being made here.
 */
function describe(f: FunnelDoc): { stateLabel: string; stage: PlanStage } {
  const outstandingRequired = (f.visualRequirements ?? []).filter(
    (r) => !r.resolvedWith && r.necessity === "required",
  ).length;

  const byStatus: Record<FunnelStatus, { stateLabel: string; stage: PlanStage }> = {
    // A draft that still needs real photography is a DIFFERENT customer
    // situation from a draft that is simply unreviewed — say which.
    draft: outstandingRequired > 0
      ? { stateLabel: `Built — needs ${outstandingRequired} photo${outstandingRequired === 1 ? "" : "s"} from you`, stage: "needs_you" }
      : { stateLabel: "Built — ready for your review", stage: "needs_you" },
    ready_for_review: { stateLabel: "Built — ready for your review", stage: "needs_you" },
    changes_requested: { stateLabel: "Changes requested", stage: "needs_you" },
    // THE LAW, IN THE LABEL. Approving does not publish, so the label must
    // never let "Approved" read as finished.
    approved: { stateLabel: "Approved — not published yet", stage: "in_progress" },
    scheduled: { stateLabel: "Scheduled to go live", stage: "in_progress" },
    published: { stateLabel: "Live", stage: "live" },
    paused: { stateLabel: "Paused", stage: "inactive" },
    archived: { stateLabel: "Archived", stage: "inactive" },
  };
  return byStatus[f.status] ?? { stateLabel: "Built — ready for your review", stage: "needs_you" };
}

function nextActionFor(f: FunnelDoc, stage: PlanStage): GrowthPlanItem["nextAction"] {
  // DRAFT PREVIEW LAW: an unpublished artifact must still be inspectable.
  // The href is built from the artifact's own id through the canonical
  // preview route, which re-checks tenancy server-side — never from anything
  // a client supplied.
  const preview = `/preview/funnel/${f.id}`;
  if (stage === "live") return { label: "View live page", href: preview };
  if (stage === "inactive") return { label: "Open", href: preview };
  return { label: "Preview and review", href: preview };
}

function reviewNotesFor(f: FunnelDoc): string[] {
  const notes: string[] = [];
  const outstanding = (f.visualRequirements ?? []).filter((r) => !r.resolvedWith);
  const required = outstanding.filter((r) => r.necessity === "required");
  if (required.length > 0) {
    notes.push(`${required.length} photo${required.length === 1 ? "" : "s"} still needed before this works properly.`);
  } else if (outstanding.length > 0) {
    notes.push(`Publishable now — ${outstanding.length} real photo${outstanding.length === 1 ? "" : "s"} would make it stronger.`);
  }
  // Customer-level only. The Critic's findings and reasoning stay internal
  // (U1); the customer is told a review happened, not what the model thought.
  if (!f.criticVerdict) notes.push("Not reviewed yet.");
  if (f.status !== "published") notes.push("Not public yet — publishing is a separate step you control.");
  return notes;
}

/**
 * Resolve the execution half of the Growth Plan for one workspace.
 * Tenancy comes from `listFunnels`, which filters on subAccountId; no
 * client-supplied identifier reaches this function.
 */
export async function resolveGrowthPlanExecution(
  subAccountId: string,
  limit = 6,
): Promise<GrowthPlanItem[]> {
  const funnels = await listFunnels(subAccountId);
  return funnels
    .filter((f) => f.status !== "archived")
    .slice(0, limit)
    .map((f): GrowthPlanItem => {
      const { stateLabel, stage } = describe(f);
      return {
        artifactId: f.id,
        kind: "Landing page",
        name: f.name || "Untitled",
        stateLabel,
        stage,
        nextAction: nextActionFor(f, stage),
        reviewNotes: reviewNotesFor(f),
        updatedAtMs: 0,
      };
    })
    // Work that needs the customer comes first — the plan is an argument
    // about attention, not a reverse-chronological list.
    .sort((a, b) => (a.stage === "needs_you" ? 0 : 1) - (b.stage === "needs_you" ? 0 : 1));
}
