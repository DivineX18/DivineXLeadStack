import { agentOutcomeEnabled } from "@/lib/ai-suite/outcome-activation";
import {validateRecommendation,readRecommendationProposal,beginFeedback,appendFeedback,feedbackExecutionId,type ExecutionDelivery} from "@/lib/ai-suite/outcome-feedback";
import "server-only";

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
import {
  claimConfirmation,
  fingerprintArgs,
  releaseConfirmationFailed,
  settleConfirmationSucceeded,
  waitForConcurrentResult,
  type ConfirmIdentity,
} from "@/lib/ai-suite/confirm-idempotency";
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

  if(body.decision!==undefined&&body.decision!=="execute"&&body.decision!=="reject")return NextResponse.json({error:"Invalid decision"},{status:400});
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

  // Identifies THIS specific confirm click (the model's own tool-call id),
  // not just the capability+args -- see confirm-idempotency.ts for why that
  // distinction matters. Required, not defaulted: a confirm with no way to
  // tell it apart from a retry of itself can't be deduplicated.
  const confirmationId = body.confirmationId;
  if (!confirmationId || typeof confirmationId !== "string") {
    return NextResponse.json(
      { error: "`confirmationId` is required." },
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

  // ── Idempotency: collapse a concurrent or sequential duplicate confirm of
  // THIS SAME proposed action onto one execution. Identity is scoped to the
  // authorized user, the workspace, the capability, and the confirmation
  // (never args alone -- see confirm-idempotency.ts for why). A second
  // request that loses the race waits briefly for the first's result rather
  // than being told to retry into a double-execution.
  const identity: ConfirmIdentity = {
    uid: ctx.uid,
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId ?? null,
    level,
    capability: cap.name,
  };
  let reference;
  try{reference=ctx.subAccountId?await readRecommendationProposal(ctx.uid,ctx.subAccountId,confirmationId,cap.name,validated.args,body.recommendationRef):null;}catch{return NextResponse.json({error:'Recommendation proposal mismatch'},{status:403});}
  // Never downgrade a registered linked proposal to an unlinked action while OFF.
  if ((reference || body.recommendationRef) && !agentOutcomeEnabled()) return NextResponse.json({error:"Recommendation execution is inactive"},{status:503});
  const argsFingerprint = fingerprintArgs(reference?{args:validated.args,recommendationRef:reference,decision:body.decision??"execute"}:validated.args);
  let claim = await claimConfirmation(identity, confirmationId, argsFingerprint);
  if (claim.kind === "duplicate_in_progress") {
    claim = await waitForConcurrentResult(identity, confirmationId, argsFingerprint);
    if (claim.kind === "proceed") {
      // The in-flight attempt released (it failed) while we were waiting --
      // the lock is free, so this request gets a genuine turn.
      claim = await claimConfirmation(identity, confirmationId, argsFingerprint);
    }
  }
  if (claim.kind === "cached") {
    return NextResponse.json(claim.response);
  }
  if (claim.kind === "fingerprint_mismatch") {
    return NextResponse.json(
      {
        error:
          "This confirmation was already used for a different request. Ask me again and I'll rebuild it.",
      },
      { status: 409 },
    );
  }
  if (claim.kind === "duplicate_in_progress") {
    return NextResponse.json(
      {
        error:
          "This action is still being processed from an earlier request. Give it a moment, then check whether it completed before trying again.",
      },
      { status: 409 },
    );
  }
  // claim.kind === "proceed" from here on.

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
  if(reference){try{await validateRecommendation(ctx.subAccountId!,reference);}catch{await releaseConfirmationFailed(identity,confirmationId);return NextResponse.json({error:'Recommendation unavailable; nothing executed'},{status:503});}}
  if(body.decision==='reject'){
    if(!reference){await releaseConfirmationFailed(identity,confirmationId);return NextResponse.json({error:'Only registered recommendation proposals support rejection receipts'},{status:400});}
    try{await beginFeedback(reference,feedbackExecutionId(ctx.uid,ctx.subAccountId!,cap.name,confirmationId),cap.name,true,ctx.uid);}catch{return NextResponse.json({error:'Rejection receipt unavailable'},{status:409});}
    const response={ok:true,rejected:true};
    await settleConfirmationSucceeded(identity,confirmationId,argsFingerprint,response,{level,capability:cap.name,args:validated.args,summary,status:'rejected',recommendationRef:reference,executionId:feedbackExecutionId(ctx.uid,ctx.subAccountId!,cap.name,confirmationId),agencyId:ctx.agencyId,subAccountId:ctx.subAccountId??null,confirmedByUid:ctx.uid,confirmedByEmail:ctx.email});
    return NextResponse.json(response);
  }
  let delivery:ExecutionDelivery|undefined;
  if(reference){try{delivery=await beginFeedback(reference,feedbackExecutionId(ctx.uid,ctx.subAccountId!,cap.name,confirmationId),cap.name,false,ctx.uid);}catch{return NextResponse.json({error:'Execution receipt unavailable; action not retried'},{status:409});}}
  let result: Awaited<ReturnType<typeof cap.execute>>;
  try {
    result = await cap.execute(ctx, validated.args);
  } catch (err) {
    if(delivery){const batch=getAdminDb().batch();appendFeedback(batch,delivery,'failed',{reason:'execution_failed',retryAllowed:cap.name==='create_task'&&err instanceof CapabilityUserError});await batch.commit();}
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
      ...(reference&&delivery?{recommendationRef:reference,executionId:delivery.executionId}:{}),
    });
    // Release the idempotency lock so this exact confirmation can be
    // retried -- a failure here is intentionally not a permanent block (see
    // confirm-idempotency.ts).
    await releaseConfirmationFailed(identity, confirmationId);
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

  const auditEntry = {
    level,
    capability: cap.name,
    args: validated.args,
    summary,
    status: "executed",
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId ?? null,
    confirmedByUid: ctx.uid,
    confirmedByEmail: ctx.email,
    resultRef: result.ref ?? null,
    ...(reference&&delivery?{recommendationRef:reference,executionId:delivery.executionId}:{}),
  } as const;
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
    resultRef: result.ref ?? null,
  };
  // Cache AFTER the response body is fully built, so a safe retry replays
  // exactly what the first caller received, byte for byte.
  const settled=await settleConfirmationSucceeded(identity, confirmationId, argsFingerprint, responseBody, auditEntry, delivery);
  if(delivery&&!settled)return NextResponse.json({...responseBody,feedbackStatus:'outcome_unknown',auditStatus:'reconciliation_required'},{status:202});
  return NextResponse.json(responseBody);
}
