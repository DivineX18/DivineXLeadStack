import "server-only";

import { mintReceipt, normalizeMutation, refFromMutation } from "@/lib/ai-suite/execution-result";
import {
  claimExecution, claimScope, hashArgs, isUsableProposalId, releaseExecution, settleExecution,
} from "@/lib/ai-suite/execution-claim";
import { NextResponse } from "next/server";
import { requireAgencyOwnerAny, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  CapabilityUserError,
  getCapability,
  roleSatisfies,
  type AiSuiteActionContext,
} from "@/lib/ai-suite/capabilities";
import { renderCompletion } from "@/lib/ai-suite/render-completion";
import { recordAiSuiteAction } from "@/lib/ai-suite/audit";
import { recordAiSuiteUsage } from "@/lib/ai-suite/usage";
import type { AiSuiteConfirmRequest } from "@/types/ai-suite";

export const dynamic = "force-dynamic";

/**
 * Execute a previously-proposed AI Suite action, after the user confirmed it.
 *
 * This is the single place a write happens. It re-authenticates the caller,
 * re-checks the capability's required role, re-validates the args, and only
 * then runs the handler, none of which trusts the model or the client
 * beyond the whitelisted capability + validated args. Tenant scope
 * (subAccountId / agencyId) comes from the authenticated session, so a
 * crafted request can never exceed the caller's own permissions or reach
 * another tenant.
 */
export async function POST(request: Request) {
  let body: AiSuiteConfirmRequest;
  try {
    body = (await request.json()) as AiSuiteConfirmRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const level = body.level;
  if (level !== "agency" && level !== "sub-account") {
    return NextResponse.json(
      { error: "`level` must be 'agency' or 'sub-account'." },
      { status: 400 },
    );
  }

  // Readonly lookups execute inline in the chat route, they're not
  // confirmable actions, so this endpoint refuses them.
  const cap = getCapability(body.capability);
  if (!cap || cap.level !== level || cap.readonly) {
    return NextResponse.json(
      { error: "Unknown or unavailable action." },
      { status: 400 },
    );
  }

  // ── Auth + role + (sub-account) gate. Everything the handler runs with is
  // derived from here, never from the request body.
  let ctx: AiSuiteActionContext;
  if (level === "sub-account") {
    if (!body.subAccountId || typeof body.subAccountId !== "string") {
      return NextResponse.json(
        { error: "`subAccountId` is required for sub-account level." },
        { status: 400 },
      );
    }
    const access = await requireSubAccountMember(request, body.subAccountId);
    if (access instanceof NextResponse) return access;

    const subSnap = await getAdminDb()
      .doc(`subAccounts/${body.subAccountId}`)
      .get();
    // Opt-in gate: Zeno (sub-account level) is OFF unless the agency owner
    // explicitly enabled it for this sub-account (legacy/unset reads as off).
    if (subSnap.data()?.aiSuiteEnabledByAgency !== true) {
      return NextResponse.json(
        {
          error:
            "The AI Suite is disabled for this sub-account. Ask your agency owner to enable it.",
        },
        { status: 403 },
      );
    }

    if (
      !roleSatisfies(cap.requiredRole, {
        agencyRoleIsOwner: access.subAccountRole === "agencyOwner",
        subAccountRole: access.subAccountRole,
      })
    ) {
      return NextResponse.json(
        { error: "You don't have permission to perform this action." },
        { status: 403 },
      );
    }

    ctx = {
      uid: access.uid,
      email: access.email,
      displayName: "",
      agencyId: access.agencyId ?? "",
      subAccountId: body.subAccountId,
      subAccountRole: access.subAccountRole,
    };
  } else {
    const owner = await requireAgencyOwnerAny(request);
    if (owner instanceof NextResponse) return owner;
    // Master switch: mirrors the chat route so a stale proposal can't execute
    // after the assistant was turned off.
    const agencySnap = await getAdminDb()
      .doc(`agencies/${owner.agencyId}`)
      .get();
    if (agencySnap.data()?.agencyAssistantEnabled !== true) {
      return NextResponse.json(
        {
          error:
            "Zeno is turned off. Enable it under Agency → Settings.",
        },
        { status: 403 },
      );
    }
    if (!roleSatisfies(cap.requiredRole, { agencyRoleIsOwner: true })) {
      return NextResponse.json(
        { error: "You don't have permission to perform this action." },
        { status: 403 },
      );
    }
    // displayName is cosmetic (member list); fetch it to match UI-created
    // sub-accounts rather than leaving it blank.
    let displayName = "";
    try {
      const record = await getAdminAuth().getUser(owner.uid);
      displayName = record.displayName ?? "";
    } catch {
      /* non-fatal */
    }
    ctx = {
      uid: owner.uid,
      email: owner.email,
      displayName,
      agencyId: owner.agencyId ?? "",
    };
  }

  // Re-validate the args server-side, the client's payload is never trusted.
  const validated = cap.validate(body.args);
  if (!validated.ok) {
    // validate() errors are written as instructions to the MODEL ("YOU are
    // the copywriter…"). The chat route repairs them by handing them back to
    // the model; if one reaches here the proposal is stale or the underlying
    // data changed. Log the real reason, tell the customer something true.
    console.warn(`[ai-suite/confirm] ${cap.name} args invalid: ${validated.error}`);
    return NextResponse.json(
      { error: "That request is missing something I need. Ask me again and I'll rebuild it." },
      { status: 400 },
    );
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
  const proposalId = isUsableProposalId(body.proposalId) ? body.proposalId : null;
  if (proposalId) {
    const claim = await claimExecution({ scope, proposalId, uid: ctx.uid, capability: cap.name, argsHash });
    if (claim.outcome === "replayed") {
      // Already done. Returning the original answer is the truthful response
      // to "this already happened", and it cannot happen a second time.
      return NextResponse.json(claim.response);
    }
    if (claim.outcome === "in_flight") {
      return NextResponse.json(
        { error: "That's already running. Give it a moment rather than sending it again." },
        { status: 409 },
      );
    }
    if (claim.outcome === "mismatch") {
      console.warn(`[ai-suite/confirm] proposal ${proposalId} reused with a different ${claim.reason}`);
      return NextResponse.json(
        { error: "That confirmation doesn't match the action it was for. Ask me again and confirm the new one." },
        { status: 409 },
      );
    }
  }

  let result: Awaited<ReturnType<typeof cap.execute>>;
  try {
    result = await cap.execute(ctx, validated.args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(`[ai-suite/confirm] ${cap.name} failed:`, msg);
    await recordAiSuiteAction({
      level,
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
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "The action failed to run. Please try again." },
      { status: 500 },
    );
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
    level,
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
    level,
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
  const responseBody = {
    ok: true,
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
  return NextResponse.json(responseBody);
}
