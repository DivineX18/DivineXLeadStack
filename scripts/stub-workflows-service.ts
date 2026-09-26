/**
 * Stub for the ONE thing the apply_workflow_plan end-to-end test cannot do:
 * write to Firestore. Everything else in the chain runs for real, including
 * both validate passes, summarize, the plan construction inside execute, the
 * campaign-plan validator and the node compiler.
 *
 * It records what it was asked to persist so the test can assert on the
 * compiled workflow rather than on a boolean.
 */
import type { WorkflowNode } from "@/types/workflows";

export interface RecordedWrite {
  kind: "create" | "update";
  subAccountId: string;
  name?: string;
  workflowId?: string;
  nodes?: Record<string, WorkflowNode>;
  patch?: Record<string, unknown>;
}

export const RECORDED: RecordedWrite[] = [];
export function resetRecorded(): void {
  RECORDED.length = 0;
}

export async function createWorkflowServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  template?: unknown;
}): Promise<string> {
  RECORDED.push({ kind: "create", subAccountId: opts.subAccountId, name: opts.name });
  return "wf_test_1";
}

export async function updateWorkflowServerSide(opts: {
  subAccountId: string;
  workflowId: string;
  patch: { nodes?: Record<string, WorkflowNode> } & Record<string, unknown>;
}): Promise<boolean> {
  RECORDED.push({
    kind: "update",
    subAccountId: opts.subAccountId,
    workflowId: opts.workflowId,
    nodes: opts.patch?.nodes,
    patch: opts.patch as Record<string, unknown>,
  });
  return true;
}

/**
 * The stored workflow the live-edit guard reads. A test sets this to decide
 * what apply_workflow_plan finds when it re-checks the status.
 */
export let STORED: { id: string; name: string; status: string } | null = null;
export function setStored(w: { id: string; name: string; status: string } | null): void {
  STORED = w;
}

export async function getWorkflow(
  _subAccountId: string,
  workflowId: string,
): Promise<{ id: string; name: string; status: string } | null> {
  return STORED && STORED.id === workflowId ? STORED : null;
}

export async function listWorkflows(): Promise<unknown[]> {
  return STORED ? [STORED] : [];
}
