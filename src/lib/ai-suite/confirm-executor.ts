import "server-only";

import { recordAiSuiteAction } from "@/lib/ai-suite/audit";
import {
  CapabilityUserError,
  getCapability,
  type AiSuiteActionContext,
} from "@/lib/ai-suite/capabilities";
import {
  claimExecution,
  claimScope,
  hashArgs,
  isUsableProposalId,
  releaseExecution,
  settleExecution,
} from "@/lib/ai-suite/execution-claim";
import {
  mintReceipt,
  normalizeMutation,
  refFromMutation,
} from "@/lib/ai-suite/execution-result";
import { renderCompletion } from "@/lib/ai-suite/render-completion";
import { recordAiSuiteUsage } from "@/lib/ai-suite/usage";
import type { AiSuiteLevel } from "@/types/ai-suite";

export interface ZenoConfirmInput {
  ctx: AiSuiteActionContext;
  level: AiSuiteLevel;
  capability: string;
  args: Record<string, unknown>;
  /** Makes one approved action run at most once. */
  proposalId?: string;
}

export type ZenoConfirmResult =
  | (Record<string, unknown> & { ok: true })
  | { __replay: true; body: Record<string, unknown> }
  | { __error: string; status: number; refusal?: boolean };

export function isConfirmError(r: ZenoConfirmResult): r is { __error: string; status: number; refusal?: boolean } {
  return "__error" in r;
}
export function isConfirmReplay(r: ZenoConfirmResult): r is { __replay: true; body: Record<string, unknown> } {
  return "__replay" in r;
}

export async function executeZenoConfirmation(input: ZenoConfirmInput): Promise<ZenoConfirmResult> {
  const cap = getCapability(input.capability);
  // The caller has already checked this exists and is permitted; this is
  // the belt to that brace, because a null here would be a crash.
  if (!cap) return { __error: "That action no longer exists.", status: 400 };
  const ctx = input.ctx;
  // Re-validate the args server-side, the client's payload is never trusted.
  const validated = cap.validate(input.args);
  if (!validated.ok) {
    // validate() errors are written as instructions to the MODEL ("YOU are
    // the copywriter…"). The chat route repairs them by handing them back to
    // the model; if one reaches here the proposal is stale or the underlying
    // data changed. Log the real reason, tell the customer something true.
    console.warn(`[ai-suite/confirm] ${cap.name} args invalid: ${validated.error}`);
    return { __error: "That request is missing something I need. Ask me again and I'll rebuild it.", status: 400 };
  }

  const summary = cap.summarize(validated.args);

  /**
   * THE TRY COVERS THE MUTATION AND NOTHING AFTER IT.
   *
   * The audit write used to sit between the change committing and the
   * response being sent, inside this try. A Firestore hiccup on that write
   * therefore answered "The action failed to run. Please try again." for a
   * change that had already been made, and the customer would retry it.
   * For an edit that is usually harmless; for anything that creates, it
   * makes a second one.
   *
   * Bookkeeping is not the outcome, so past the execute below the change is
   * committed, the answer says so, and the audit and usage writes happen
   * without being able to contradict it. A failure to record is logged,
   * because an action that ran without an audit row is worth knowing about.
   */
  /**
   * ONE CONFIRMATION, ONE EXECUTION.
   *
   * Claimed before the action runs, so a retry after a dropped response, a
   * second tab, or a replayed request is handed the first answer instead of
   * doing the thing twice. A proposal without a usable id still runs: the
   * id comes from the model's tool call and an older client may not send
   * one, and refusing would break confirmation for them. That is stated
   * rather than silently degraded.
   */
  const scope = claimScope(ctx);
  const argsHash = hashArgs(validated.args);
  const proposalId = isUsableProposalId(input.proposalId) ? input.proposalId : null;
  if (proposalId) {
    const claim = await claimExecution({ scope, proposalId, uid: ctx.uid, capability: cap.name, argsHash });
    if (claim.outcome === "replayed") {
      // Already done. Returning the original answer is the truthful response
      // to "this already happened", and it cannot happen a second time.
      return { __replay: true, body: claim.response };
    }
    if (claim.outcome === "in_flight") {
      return { __error: "That's already running. Give it a moment rather than sending it again.", status: 409 };
    }
    if (claim.outcome === "mismatch") {
      console.warn(`[ai-suite/confirm] proposal ${proposalId} reused with a different ${claim.reason}`);
      return { __error: "That confirmation doesn't match the action it was for. Ask me again and confirm the new one.", status: 409 };
    }
  }

  let result: Awaited<ReturnType<typeof cap.execute>>;
  try {
    result = await cap.execute(ctx, validated.args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(`[ai-suite/confirm] ${cap.name} failed:`, msg);
    await recordAiSuiteAction({
      level: input.level,
      capability: cap.name,
      args: validated.args,
      summary,
      status: "failed",
      agencyId: ctx.agencyId,
      subAccountId: ctx.subAccountId ?? null,
      confirmedByUid: ctx.uid,
      confirmedByEmail: ctx.email,
      error: msg.slice(0, 500),
    });
    // The product lets a customer retry a failed action, so the claim is
    // released rather than held: holding it would turn one transient
    // failure into a permanently unrepeatable request.
    if (proposalId) await releaseExecution({ scope, proposalId });
    // User-facing failures (gate off, record not in this tenant, …) are
    // surfaced verbatim; anything unexpected stays generic.
    if (err instanceof CapabilityUserError) {
      return { __error: err.message, status: 400, refusal: true };
    }
    return { __error: "The action failed to run. Please try again.", status: 500 };
  }

  /**
   * PAST THIS LINE THE CHANGE HAS COMMITTED, and that fact is what mints
   * the receipt. The capability described WHAT it did; it has no way to
   * assert that it happened, because MutationDescriptor has no status
   * field. Only reaching this statement does that.
   *
   * The audit row and the receipt are built from the same normalized
   * descriptor by the same call, so the record of the event and the answer
   * given to the customer cannot describe different things.
   */
  const mutation = normalizeMutation(result.mutation);
  const resultRef = result.ref ?? (mutation ? refFromMutation(mutation) : null);

  const auditId = await recordAiSuiteAction({
    level: input.level,
    capability: cap.name,
    args: validated.args,
    summary,
    status: "executed",
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId ?? null,
    confirmedByUid: ctx.uid,
    confirmedByEmail: ctx.email,
    resultRef,
    mutation,
  }).catch((e) => {
    console.error(
      `[ai-suite/confirm] ${cap.name} ran but its audit row could not be written:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  });

  const receipt = mutation
    ? mintReceipt({ capability: cap.name, mutation, auditId })
    : null;
  void recordAiSuiteUsage({
    level: input.level,
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId,
    kind: "action",
  });

  // BUILD COMPLETION CONTRACT (Production Experience 2.0): return the
  // pointer to what was actually built, not just prose about it. It was
  // already recorded in the audit trail above but never sent to the
  // client, so a successful funnel build rendered as a sentence with no
  // way to open the thing that was created.
  // U1, THE CUSTOMER RESPONSE BOUNDARY.
  //
  // `resultText` is the model-facing receipt: it carries raw ids, internal
  // parameter names (bridge_next_funnel_id), and design-selection
  // rationale. Returning it here is how all of that reached the customer.
  //
  // When a capability supplies a `completion`, that is the ONE authoritative
  // customer-facing message and the receipt is WITHHELD, not filtered,
  // withheld, so a newly-added internal detail cannot leak by default.
  // Capabilities without one are readonly lookups whose resultText is
  // already customer-safe prose.
  const { completion } = result;
  const responseBody: Record<string, unknown> & { ok: true } = {
    ok: true as const,
    ...(completion
      ? { completion, resultText: renderCompletion(completion) }
      : { resultText: result.resultText }),
    // Unchanged for every existing caller.
    resultRef,
    // Additive: the structured result downstream consumers read instead of
    // parsing prose. Absent on a capability that has not been migrated yet,
    // which those consumers treat as "nothing known changed" rather than
    // guessing.
    ...(receipt ? { receipt } : {}),
  };
  // Stored so a replay is served this, byte for byte, rather than running
  // the action again to produce something that looks like it.
  if (proposalId) await settleExecution({ scope, proposalId, response: responseBody });
  return responseBody;
}
