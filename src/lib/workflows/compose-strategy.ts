import type { WorkflowNode } from "@/types/workflows";

/**
 * AUTOMATION STRATEGY ENGINE — the workflow generator's equivalent of the
 * Sales Argument Engine. Instead of attaching one universal 6-node spine to
 * every business, the model reasons about the conversion LIFECYCLE first
 * (what a submission means, the states a lead moves through, the state that
 * ENDS the journey, when a human takes over, cadence between touches) and
 * the composer below turns that plan into a REAL state machine on the
 * existing workflow engine — no new node types, no parallel executor:
 *
 *   create_deal → add_tag → confirmation email → notify owner
 *     → [per nurture step] wait → if_else(has_tag goalTag → GOAL/end)
 *                               → send_email (continues the page's argument)
 *     → wait → if_else(goalTag → end) → handoff create_task
 *
 * The goal-tag check before EVERY post-wait touch is the state-change
 * suppression the stress test found missing: the moment the operator (or
 * another workflow) applies the goal tag — "booked", "purchased",
 * "replied" — the run exits at the next tick instead of nurturing a
 * converted lead. Engine-level email/SMS opt-out suppression still applies
 * on top. Pure function: fully unit-testable, no Firestore, no network.
 */

export interface AutomationStrategyPlan {
  /** What a form submission MEANS for this funnel ("requested the guide",
   *  "applied for the program", "asked for an emergency callback"). */
  conversionEvent: string;
  /** The state that ENDS the journey ("booked the consultation"). */
  goalState: string;
  /** The tag whose presence exits the sequence — applied by the operator,
   *  another workflow, or a future integration hook. Slug-ish, ≤40 chars. */
  goalTag: string;
  /** Days from signup until a human-handoff task is created. */
  handoffDays: number;
  /** Why this cadence fits this buyer/intent (stored for explainability). */
  cadenceRationale: string;
  /** True when the model supplied no plan and this was synthesized. */
  synthesized?: boolean;
}

export interface AutomationSequenceStep {
  /** Hours AFTER SIGNUP this touch fires (not after the previous step). */
  delayHours: number;
  subject: string;
  body: string;
  /** The step's job in the journey ("resolve the price objection"). */
  purpose: string;
}

export interface ComposeStrategyInput {
  plan: AutomationStrategyPlan;
  sequence: AutomationSequenceStep[];
  displayName: string;
  tag: string;
  confirmationSubject: string;
  confirmationBody: string;
  ownerNotifyBody: string;
}

const HOUR = 3600;
const DAY = 86_400;

function withUnsubscribe(body: string): string {
  return body.includes("{{unsubscribeLink}}") ? body : `${body}\n\n{{unsubscribeLink}}`;
}

/** Synthesis floor (mirrors synthesizeSalesArgument): a model that supplied
 *  no plan still gets goal-tag exits + handoff around the classic spine. */
export function synthesizeAutomationPlan(displayName: string, tag: string): AutomationStrategyPlan {
  return {
    conversionEvent: `submitted "${displayName}"`,
    goalState: "the operator has made contact",
    goalTag: `${tag}`.slice(0, 30) + "-converted",
    handoffDays: 1,
    cadenceRationale: "Default: confirm instantly, hand to a human within a day.",
    synthesized: true,
  };
}

export function composeStrategyNodes(input: ComposeStrategyInput): {
  nodes: Record<string, WorkflowNode>;
  startNodeId: string;
} {
  const { plan, displayName, tag } = input;
  const nodes: Record<string, WorkflowNode> = {};
  const goalCheck = { all: [{ field: "tags", op: "has_tag" as const, value: plan.goalTag }] };

  // Terminal goal node — every exit branch routes here.
  nodes.goal = {
    id: "goal",
    type: "goal",
    config: { label: `Goal reached — ${plan.goalState}` },
    next: null,
  };

  // Instant spine: deal + tag + confirmation + owner notify.
  nodes.n1 = { id: "n1", type: "create_deal", config: { title: displayName, value: 0, currency: "usd", stageId: "new", priority: "medium" }, next: "n2" };
  nodes.n2 = { id: "n2", type: "add_tag", config: { tag }, next: "n3" };
  nodes.n3 = { id: "n3", type: "send_email", config: { subject: input.confirmationSubject, body: withUnsubscribe(input.confirmationBody) }, next: "n4" };
  nodes.n4 = { id: "n4", type: "notify", config: { recipient: "owner", to: "", subject: `New lead: ${displayName}`, body: input.ownerNotifyBody }, next: null };

  // Nurture steps: wait → goal-tag exit check → email. Delays are absolute
  // from signup; converted to increments and floored at 1h so a mis-ordered
  // plan still runs forward.
  const steps = [...input.sequence]
    .filter((s) => s.subject.trim() && s.body.trim())
    .sort((a, b) => a.delayHours - b.delayHours)
    .slice(0, 4);
  let elapsed = 0;
  let prevId = "n4";
  steps.forEach((step, i) => {
    const wId = `w${i + 1}`;
    const cId = `c${i + 1}`;
    const eId = `e${i + 1}`;
    const increment = Math.max(HOUR, Math.round(step.delayHours * HOUR) - elapsed);
    elapsed += increment;
    nodes[prevId] = { ...nodes[prevId], next: wId };
    nodes[wId] = { id: wId, type: "wait", config: { seconds: increment }, next: cId };
    nodes[cId] = {
      id: cId,
      type: "if_else",
      config: { conditions: goalCheck },
      branches: { whenTrue: "goal", whenFalse: eId },
      next: null,
    };
    nodes[eId] = { id: eId, type: "send_email", config: { subject: step.subject, body: withUnsubscribe(step.body) }, next: null };
    prevId = eId;
  });

  // Human handoff: wait out the remainder, re-check the goal tag, then leave
  // a task for the operator. Handoff never happens before the last touch.
  const handoffSeconds = Math.max(HOUR, Math.round(plan.handoffDays * DAY) - elapsed);
  nodes[prevId] = { ...nodes[prevId], next: "wh" };
  nodes.wh = { id: "wh", type: "wait", config: { seconds: handoffSeconds }, next: "ch" };
  nodes.ch = {
    id: "ch",
    type: "if_else",
    config: { conditions: goalCheck },
    branches: { whenTrue: "goal", whenFalse: "task" },
    next: null,
  };
  nodes.task = {
    id: "task",
    type: "create_task",
    config: { title: `Follow up with {{contact.firstName}} — ${displayName} (${plan.goalState} not reached)`, dueInDays: 0 },
    next: null,
  };

  return { nodes, startNodeId: "n1" };
}
