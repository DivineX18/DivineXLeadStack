import type { WorkflowNode, WorkflowNodeType } from "@/types/workflows";

/**
 * The builder edits a TREE (linear list, where an `if_else` step carries two
 * nested branch lists); the engine stores a NODE MAP with next/branch pointers.
 * These two helpers convert between them. An `if_else` is always terminal in
 * its list — branches are where the flow continues.
 */
export interface BuilderStep {
  id: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
  whenTrue?: BuilderStep[];
  whenFalse?: BuilderStep[];
}

/**
 * A GOAL-GATE IS NOT A BRANCH.
 *
 * The compiler puts a "has the goal tag been applied yet?" check before every
 * post-wait touch, as `if_else` with whenTrue pointing at the terminal goal
 * node and whenFalse carrying the rest of the sequence. It is an early exit,
 * not a fork: one side ends the run, the other IS the main line.
 *
 * parseTree treats every if_else as terminal and recurses into both sides, so
 * a linear series of four gated emails came out four levels deep. The builder
 * then split the canvas in two at each level, which quartered and then
 * eighthed the column width until the cards overlapped and the text could not
 * be read.
 *
 * So the renderer asks this question instead of assuming. A gate draws as one
 * line on the main column and the sequence carries straight on. Anything with
 * real steps on both sides is a real fork and still splits.
 */
export function isGoalGate(step: BuilderStep): boolean {
  if (step.type !== "if_else") return false;
  const exit = step.whenTrue ?? [];
  const carryOn = step.whenFalse ?? [];
  // Exactly one terminal goal node on the exit side, and a continuation on
  // the other. Anything the operator has added to the exit side makes it a
  // real branch again, and it goes back to splitting.
  return exit.length === 1 && exit[0].type === "goal" && carryOn.length > 0;
}

/** The tag a goal-gate watches for, for the label on the line. */
export function goalGateTag(step: BuilderStep): string {
  const conds = (step.config?.conditions ?? {}) as {
    all?: { field?: string; op?: string; value?: unknown }[];
  };
  const first = (conds.all ?? []).find((c) => c.op === "has_tag");
  return typeof first?.value === "string" ? first.value : "";
}

export function newNodeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Node map → editable tree. */
export function parseTree(
  nodes: Record<string, WorkflowNode>,
  startNodeId: string | null,
): BuilderStep[] {
  const walk = (start: string | null): BuilderStep[] => {
    const out: BuilderStep[] = [];
    const seen = new Set<string>();
    let cur = start;
    while (cur && nodes[cur] && !seen.has(cur)) {
      seen.add(cur);
      const n = nodes[cur];
      const step: BuilderStep = {
        id: n.id,
        type: n.type,
        config: n.config ?? {},
      };
      if (n.type === "if_else") {
        step.whenTrue = walk(n.branches?.whenTrue ?? null);
        step.whenFalse = walk(n.branches?.whenFalse ?? null);
        out.push(step);
        break; // if_else is terminal in a list
      }
      out.push(step);
      cur = n.next ?? null;
    }
    return out;
  };
  return walk(startNodeId);
}

/** Editable tree → node map + entry id. */
export function flattenTree(steps: BuilderStep[]): {
  nodes: Record<string, WorkflowNode>;
  startNodeId: string | null;
} {
  const nodes: Record<string, WorkflowNode> = {};
  const build = (list: BuilderStep[]): string | null => {
    let firstId: string | null = null;
    let prev: WorkflowNode | null = null;
    for (const s of list) {
      const node: WorkflowNode = { id: s.id, type: s.type, config: s.config };
      if (s.type === "if_else") {
        node.branches = {
          whenTrue: build(s.whenTrue ?? []),
          whenFalse: build(s.whenFalse ?? []),
        };
      }
      nodes[s.id] = node;
      if (!firstId) firstId = s.id;
      if (prev && prev.type !== "if_else") prev.next = s.id;
      prev = node;
    }
    return firstId;
  };
  const startNodeId = build(steps);
  return { nodes, startNodeId };
}
