import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ONE CONFIRMATION, ONE EXECUTION.
 *
 * The confirm route carried no identity for the thing being confirmed. It
 * received a capability name and arguments, and ran them. The browser
 * guards against a second click by tracking the proposal's status locally,
 * but that guard lives in the tab: a retry after a dropped response, two
 * tabs, a refresh mid-flight, or a replayed request all reach the server as
 * a legitimate-looking first confirmation and execute again. For an edit
 * that is usually survivable. For anything that creates, sends or
 * publishes, it happens twice, and the customer has no way to tell which.
 *
 * So a confirmation is claimed before it runs. The claim is a document
 * whose id is the proposal's id, created inside a transaction, so two
 * concurrent confirmations cannot both win. The loser does not execute; it
 * is handed the first one's answer, which is the honest response to "this
 * already happened".
 *
 * BOUND, so a claim is not a shared key. It records who confirmed it, in
 * which workspace, for which capability, over which arguments. A replay
 * that differs in any of those is refused rather than served someone
 * else's result, and a replay carrying the same id with different
 * arguments is refused outright: that is not a retry, it is a different
 * action wearing a used token.
 *
 * A FAILED execution does not hold the claim. The product deliberately
 * lets a customer retry a failed action, so a claim that ends in failure
 * is released and the next confirmation genuinely runs.
 */

export interface ClaimedExecution {
  outcome: "claimed";
}
export interface ReplayedExecution {
  outcome: "replayed";
  /** The response the first, winning confirmation produced. */
  response: Record<string, unknown>;
}
export interface InFlightExecution {
  outcome: "in_flight";
}
export interface MismatchedExecution {
  outcome: "mismatch";
  reason: "caller" | "workspace" | "capability" | "arguments";
}
export type ExecutionClaim =
  | ClaimedExecution
  | ReplayedExecution
  | InFlightExecution
  | MismatchedExecution;

/** Arguments are hashed, not stored: they can contain customer copy. */
export function hashArgs(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, 32);
}

/** A proposal id is a model-supplied string; keep it to a safe doc id. */
export function isUsableProposalId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(id);
}

function claimRef(scope: string, proposalId: string) {
  return getAdminDb().doc(`aiSuiteExecutions/${scope}__${proposalId}`);
}

/**
 * Scope keeps one workspace's claims out of another's namespace, so a
 * proposal id guessed from elsewhere cannot collide into this workspace.
 */
export function claimScope(ctx: { agencyId: string; subAccountId?: string }): string {
  return ctx.subAccountId ? `sa_${ctx.subAccountId}` : `ag_${ctx.agencyId}`;
}

export async function claimExecution(input: {
  scope: string;
  proposalId: string;
  uid: string;
  capability: string;
  argsHash: string;
}): Promise<ExecutionClaim> {
  const db = getAdminDb();
  const ref = claimRef(input.scope, input.proposalId);
  return db.runTransaction(async (tx): Promise<ExecutionClaim> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        scope: input.scope,
        proposalId: input.proposalId,
        uid: input.uid,
        capability: input.capability,
        argsHash: input.argsHash,
        status: "running",
        response: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { outcome: "claimed" };
    }
    const d = snap.data()!;
    // Bound checks first: a mismatch is never served a cached answer.
    if (d.uid !== input.uid) return { outcome: "mismatch", reason: "caller" };
    if (d.scope !== input.scope) return { outcome: "mismatch", reason: "workspace" };
    if (d.capability !== input.capability) return { outcome: "mismatch", reason: "capability" };
    if (d.argsHash !== input.argsHash) return { outcome: "mismatch", reason: "arguments" };

    if (d.status === "done") {
      return { outcome: "replayed", response: (d.response ?? {}) as Record<string, unknown> };
    }
    if (d.status === "failed") {
      // Retryable by design: take the claim again rather than refusing.
      tx.update(ref, { status: "running", response: null, updatedAt: FieldValue.serverTimestamp() });
      return { outcome: "claimed" };
    }
    return { outcome: "in_flight" };
  });
}

/** Store the winning answer so a replay is served it instead of re-running. */
export async function settleExecution(input: {
  scope: string;
  proposalId: string;
  response: Record<string, unknown>;
}): Promise<void> {
  try {
    await claimRef(input.scope, input.proposalId).set(
      { status: "done", response: input.response, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // The action already happened; failing to record that must not undo it.
    console.error("[ai-suite/claim] could not settle claim:", err instanceof Error ? err.message : err);
  }
}

/** Release the claim so the customer can retry, which the product allows. */
export async function releaseExecution(input: { scope: string; proposalId: string }): Promise<void> {
  try {
    await claimRef(input.scope, input.proposalId).set(
      { status: "failed", updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch {
    // Leaving a claim in "running" would wrongly block a retry, so this is
    // logged nowhere louder than the failure that caused it.
  }
}
