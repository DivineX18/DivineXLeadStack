import "server-only";
import { composeStrategyNodes } from "@/lib/workflows/compose-strategy";
import { createWorkflowServerSide, updateWorkflowServerSide } from "@/lib/server/workflows-service";
import type { WorkflowNode } from "@/types/workflows";
import { validateCampaignPlan, type CampaignPlan, type SegmentationRule } from "@/lib/divinex/campaign";

/**
 * APPLY WORKFLOW PLAN (Unification Slice 7 — Executable Communications Law).
 *
 * THE GAP THIS CLOSES: Zeno could design a follow-up sequence but could not
 * BUILD it — the customer had to paste every email into the builder by hand.
 * The audit showed the backend was never the problem:
 *   - updateWorkflowServerSide already accepts a COMPLETE node graph
 *   - compose-strategy.ts is already the deterministic plan→nodes compiler
 *     (subjects, bodies, waits, event anchors, goal gates, unsubscribe)
 * The missing piece was the AI/tool contract. So this is NOT a new workflow
 * engine, scheduler, or email system: it is a declarative DESIRED-STATE
 * compiler on top of the certified ones.
 *
 * SHAPE (deliberately not raw CRUD): Zeno describes the desired end state,
 * this validates it deterministically, compiles it into real nodes, and
 * writes a DRAFT. Activation stays a human Publish action — a draft can
 * never contact a real customer.
 *
 * SEGMENTATION: rules compile into real if_else + add_tag nodes ahead of
 * the sequence, using the existing condition system (now including numeric
 * comparisons), so "over $500k goes to consulting" is real Flow behavior
 * rather than a note in a document.
 */

export interface ApplyResult {
  ok: boolean;
  workflowId?: string;
  nodeCount?: number;
  emailCount?: number;
  errors?: string[];
}

/** Segmentation prefix: each rule becomes if_else → add_tag, chained so
 *  every rule is evaluated, then flows into the main sequence. */
function buildSegmentationNodes(
  rules: SegmentationRule[],
  entryNodeId: string,
): { nodes: Record<string, WorkflowNode>; startNodeId: string } {
  if (rules.length === 0) return { nodes: {}, startNodeId: entryNodeId };
  const nodes: Record<string, WorkflowNode> = {};
  rules.forEach((rule, i) => {
    const checkId = `seg${i + 1}`;
    const tagId = `segtag${i + 1}`;
    const nextTarget = i + 1 < rules.length ? `seg${i + 2}` : entryNodeId;
    nodes[checkId] = {
      id: checkId,
      type: "if_else",
      config: {
        conditions: { all: [{ field: `customFields.${rule.field}`, op: rule.operator, value: rule.value }] },
      },
      branches: { whenTrue: tagId, whenFalse: nextTarget },
      next: null,
    };
    nodes[tagId] = { id: tagId, type: "add_tag", config: { tag: rule.tag }, next: nextTarget };
  });
  return { nodes, startNodeId: "seg1" };
}

/**
 * Compile an approved Campaign Plan's communication + segmentation strategy
 * into a real DRAFT workflow. Customer-supplied copy is installed verbatim;
 * Zeno-generated copy travels the same path (the compiler cannot tell them
 * apart, which is the point).
 */
export async function applyWorkflowPlan(input: {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  plan: CampaignPlan;
  /** Existing workflow to overwrite (conversational edits re-apply the
   *  whole desired state); omitted = create a new draft. */
  workflowId?: string;
  /** Trigger form; omitted = the workflow is created unattached. */
  formId?: string | null;
  funnelId?: string;
  hasEventTime?: boolean;
  displayName?: string;
}): Promise<ApplyResult> {
  const validation = validateCampaignPlan(input.plan);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const plan = input.plan;
  const displayName = input.displayName ?? `${plan.intent.objective} campaign`;
  const messages = plan.followUpStrategy.messages.filter((m) => m.channel === "email");

  // The FIRST message, when immediate, is the confirmation; the rest are the
  // sequence. This maps the plan onto the certified composer's own shape.
  const immediate = messages.find((m) => m.delayHours === 0);
  const sequence = messages
    .filter((m) => m !== immediate)
    .map((m) => ({
      delayHours: m.delayHours,
      subject: m.subject,
      body: m.body,
      purpose: m.purpose,
      commType: m.commType,
      anchorOffsetHours: m.anchorOffsetHours ?? null,
    }));

  const composed = composeStrategyNodes({
    plan: {
      conversionEvent: `submitted ${displayName}`,
      goalState: plan.followUpStrategy.goalState,
      goalTag: plan.followUpStrategy.goalTag,
      handoffDays: plan.followUpStrategy.handoffDays,
      cadenceRationale: plan.summary ?? "",
    },
    sequence,
    displayName,
    tag: plan.crmRequirements?.tags?.[0] ?? `${displayName} lead`,
    confirmationSubject: immediate?.subject ?? `You're in — ${displayName}`,
    confirmationBody: immediate?.body ?? "Thanks for reaching out. We'll be in touch shortly.",
    ownerNotifyBody: `{{contact.firstName}} ({{contact.email}}) just came through "${displayName}". Apply the "${plan.followUpStrategy.goalTag}" tag the moment they ${plan.followUpStrategy.goalState} and every remaining automated touch stops.`,
    ...(input.funnelId ? { funnelId: input.funnelId } : {}),
    ...(input.hasEventTime ? { hasEventTime: true } : {}),
  });

  const segmentation = buildSegmentationNodes(plan.segmentationRules ?? [], composed.startNodeId);
  const nodes = { ...composed.nodes, ...segmentation.nodes };
  const startNodeId = segmentation.startNodeId;

  const workflowId =
    input.workflowId ??
    (await createWorkflowServerSide({
      subAccountId: input.subAccountId,
      createdByUid: input.createdByUid,
      name: `${displayName} — follow-up`,
      template: "blank",
    }));

  const ok = await updateWorkflowServerSide({
    subAccountId: input.subAccountId,
    workflowId,
    patch: {
      // status is deliberately NOT set: workflows are created as drafts and
      // only a human Publish activates them (draft/live safety boundary).
      trigger: { type: "form.submitted", filters: { all: [] }, formId: input.formId ?? undefined },
      nodes,
      startNodeId,
      strategyPlan: {
        conversionEvent: `submitted ${displayName}`,
        goalState: plan.followUpStrategy.goalState,
        goalTag: plan.followUpStrategy.goalTag,
        handoffDays: plan.followUpStrategy.handoffDays,
        cadenceRationale: plan.summary ?? "",
      },
    },
  });
  if (!ok) return { ok: false, errors: ["workflow_write_failed"] };

  return {
    ok: true,
    workflowId,
    nodeCount: Object.keys(nodes).length,
    emailCount: Object.values(nodes).filter((n) => n.type === "send_email").length,
  };
}
