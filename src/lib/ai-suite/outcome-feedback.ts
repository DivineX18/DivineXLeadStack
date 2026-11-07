import "server-only";
import { agentOutcomeEnabled, requireAgentOutcomeEnabled } from "./outcome-activation";
import { createHash, randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAuthorizedBusinessProfileId } from "@/lib/divinex/profile-authorization";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
export interface RecommendationReference {
  recommendationId: string;
  evidenceId: string;
}
export interface BoundRecommendation extends RecommendationReference {
  businessProfileId: string;
  workspaceId: string;
  measurement?: { source: string; sourceEntity: string; metric: string };
}
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export async function validateRecommendation(
  workspaceId: string,
  raw: RecommendationReference
): Promise<BoundRecommendation> {
  requireAgentOutcomeEnabled();
  if (
    !raw ||
    typeof raw.recommendationId !== "string" ||
    !/^rec_[\w-]+$/.test(raw.recommendationId) ||
    !/^[a-f0-9]{64}$/.test(raw.evidenceId)
  )
    throw new Error("Invalid recommendation reference");
  const mapping = await resolveAuthorizedBusinessProfileId(workspaceId);
  if (!mapping.authorized) throw new Error("No authorized business profile");
  const businessProfileId = String(mapping.businessProfileId);
  const result = await createAscendIntelligenceClient().validateRecommendation(
    businessProfileId,
    workspaceId,
    raw
  );
  if (!result.ok)
    throw new Error(
      "Recommendation evidence is unavailable for this workspace"
    );
  const plan = (
    result.data as {
      measurement?: { source: string; sourceEntity: string; metric: string };
    }
  )?.measurement;
  return {
    recommendationId: raw.recommendationId,
    evidenceId: raw.evidenceId,
    businessProfileId,
    workspaceId,
    ...(plan &&
    ["flow_crm", "ga4", "gsc", "shopify"].includes(plan.source) &&
    typeof plan.sourceEntity === "string" &&
    typeof plan.metric === "string"
      ? { measurement: plan }
      : {}),
  };
}
export function proposalKey(uid: string, workspaceId: string, id: string) {
  return digest([uid, workspaceId, id]);
}
export async function bindRecommendationProposal(
  uid: string,
  id: string,
  capability: string,
  args: unknown,
  reference: BoundRecommendation
) {
  requireAgentOutcomeEnabled();
  await getAdminDb()
    .doc(
      `aiSuiteRecommendationProposals/${proposalKey(uid, reference.workspaceId, id)}`
    )
    .create({
      uid,
      id,
      capability,
      argsHash: digest(args),
      reference,
      createdAt: Date.now(),
    });
}
export async function readRecommendationProposal(
  uid: string,
  workspaceId: string,
  id: string,
  capability: string,
  args: unknown,
  ref?: RecommendationReference
) {
  const row = (
    await getAdminDb()
      .doc(
        `aiSuiteRecommendationProposals/${proposalKey(uid, workspaceId, id)}`
      )
      .get()
  ).data();
  if (!row) {
    if (ref) throw new Error("Recommendation proposal is not registered");
    return null;
  }
  if (
    !ref ||
    row.uid !== uid ||
    row.capability !== capability ||
    row.argsHash !== digest(args) ||
    ref.recommendationId !== row.reference.recommendationId ||
    ref.evidenceId !== row.reference.evidenceId
  )
    throw new Error("Recommendation proposal mismatch");
  const mapping = await resolveAuthorizedBusinessProfileId(workspaceId);
  if (
    !mapping.authorized ||
    String(mapping.businessProfileId) !== row.reference.businessProfileId
  )
    throw new Error("Recommendation workspace changed");
  return row.reference as BoundRecommendation;
}
export interface ExecutionDelivery {
  reference: BoundRecommendation;
  executionId: string;
  attempt: number;
  actorUid: string;
}
/** Durable pre-execution record: a process crash leaves visible started/unknown,
 * never a fabricated success. The tool is never retried by delivery workers. */
export async function beginFeedback(
  reference: BoundRecommendation,
  executionId: string,
  actionType: string,
  rejected = false,
  actorUid = "unknown"
): Promise<ExecutionDelivery> {
  requireAgentOutcomeEnabled();
  const db = getAdminDb(),
    ref = db.doc(`aiSuiteFeedback/${executionId}`);
  let attempt = 0;
  await db.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data();
    if (
      old &&
      ([
        "recommendationId",
        "evidenceId",
        "businessProfileId",
        "workspaceId",
      ].some(
        (key) =>
          old.reference?.[key] !== reference[key as keyof BoundRecommendation]
      ) ||
        old.actorUid !== actorUid ||
        old.events?.[0]?.actionType !== actionType)
    )
      throw new Error("Execution identity mismatch");
    // A repeated cancellation acknowledges the same durable event, including
    // after a lost HTTP/cache acknowledgment; never reset its delivery cursor.
    if (old?.terminal === "rejected" && rejected) {
      attempt = old.attempt;
      return;
    }
    if (
      old &&
      (old.terminal !== "failed" || (!rejected && old.retryAllowed !== true))
    )
      throw new Error("Execution already started; reconcile before retry");
    if (old && ["held", "dead"].includes(old.deliveryState))
      throw new Error(
        "Feedback requires reconciliation before another decision"
      );
    attempt = (old?.attempt ?? 0) + 1;
    if (attempt > 100) throw new Error("Execution attempt limit reached");
    const now = new Date().toISOString();
    const events = [
      ...(old?.events ?? []),
      ...(old?.terminalEvent ? [{ ...old.terminalEvent, actionType }] : []),
      ...(rejected ? ["rejected"] : ["approved", "started"]).map((event) => ({
        receiptId: `${executionId}:${attempt}:${event}`,
        executionId,
        attempt,
        event,
        occurredAt: now,
        actionType,
        actorUid,
        recommendationId: reference.recommendationId,
        evidenceId: reference.evidenceId,
      })),
    ];
    tx.set(ref, {
      reference,
      executionId,
      actorUid,
      attempt,
      events,
      cursor: old?.cursor ?? 0,
      terminal: rejected ? "rejected" : "started",
      deliveryAttempts: 0,
      nextDeliveryAt: Date.now(),
      leaseUntil: 0,
      deliveryState: "pending",
    });
  });
  return { reference, executionId, attempt, actorUid };
}
export function feedbackExecutionId(
  uid: string,
  workspace: string,
  capability: string,
  confirmationId: string
) {
  return digest([uid, workspace, capability, confirmationId]);
}
export function appendFeedback(
  batch: FirebaseFirestore.WriteBatch,
  delivery: ExecutionDelivery,
  event: "succeeded" | "failed",
  payload: { artifactRef?: string; reason?: string; retryAllowed?: boolean }
) {
  // Delivery is an admission obtained by beginFeedback while ON. Always settle
  // that admitted action, even during shutdown; losing its result is unsafe.
  const ref = getAdminDb().doc(`aiSuiteFeedback/${delivery.executionId}`);
  // Deterministic terminal slot: batch.update avoids a read/append race with the
  // worker. Worker only changes cursor/lease fields, never this terminal payload.
  batch.update(ref, {
    terminal: event,
    retryAllowed: payload.retryAllowed === true,
    terminalEvent: {
      receiptId: `${delivery.executionId}:${delivery.attempt}:${event}`,
      executionId: delivery.executionId,
      attempt: delivery.attempt,
      event,
      occurredAt: new Date().toISOString(),
      actionType: "",
      actorUid: delivery.actorUid,
      recommendationId: delivery.reference.recommendationId,
      evidenceId: delivery.reference.evidenceId,
      ...(payload.artifactRef ? { artifactRef: payload.artifactRef } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
    },
    deliveryState: "pending",
    nextDeliveryAt: Date.now(),
  });
}
/** Bounded durable pump, invoked by the existing signed maintenance callback.
 * Each request sends at most one event per job; leases prevent concurrent pumps. */
export async function drainFeedback(limit = 3) {
  if (!agentOutcomeEnabled()) return false; // No query, claim, acknowledgment or deletion.
  const db = getAdminDb(),
    rows = await db
      .collection("aiSuiteFeedback")
      .where("deliveryState", "==", "pending")
      .limit(Math.min(limit, 10))
      .get();
  for (const row of rows.docs) {
    if (!agentOutcomeEnabled()) return false;
    const token = randomUUID();
    let item: FirebaseFirestore.DocumentData | undefined;
    await db.runTransaction(async (tx) => {
      const d = (await tx.get(row.ref)).data();
      if (
        !d ||
        d.deliveryState !== "pending" ||
        d.nextDeliveryAt > Date.now() ||
        d.leaseUntil > Date.now()
      )
        return;
      if (d.kind === "measurement") {
        const parent = (
          await tx.get(db.doc(`aiSuiteFeedback/${d.executionId}`))
        ).data();
        if (parent?.deliveryState !== "delivered") {
          if (!parent || ["dead", "held"].includes(parent.deliveryState))
            tx.update(row.ref, {
              deliveryState: "dead",
              lastDeliveryError: "execution_receipt_unavailable",
            });
          else tx.update(row.ref, { nextDeliveryAt: Date.now() + 60000 });
          return;
        }
      }
      if (
        d.terminal === "started" &&
        d.cursor >= d.events.length &&
        Date.now() - Date.parse(d.events[0].occurredAt) > 120000
      ) {
        tx.update(row.ref, {
          deliveryState: "held",
          lastDeliveryError: "execution_outcome_unknown_reconcile",
        });
        return;
      }
      if ((d.deliveryAttempts ?? 0) >= 5) {
        tx.update(row.ref, {
          deliveryState: "dead",
          lastDeliveryError: "retry_exhausted",
        });
        return;
      }
      tx.update(row.ref, {
        leaseUntil: Date.now() + 90000,
        leaseToken: token,
        deliveryAttempts: (d.deliveryAttempts ?? 0) + 1,
      });
      item = d;
    });
    if (!item) continue;
    const d = item,
      events = [
        ...d.events,
        ...(d.terminalEvent
          ? [{ ...d.terminalEvent, actionType: d.events[0].actionType }]
          : []),
      ];
    let ok = false,
      permanent = false,
      inactive = false;
    try {
      const mapping = await resolveAuthorizedBusinessProfileId(
        d.reference.workspaceId
      );
      if (
        !mapping.authorized ||
        String(mapping.businessProfileId) !== d.reference.businessProfileId
      )
        permanent = true;
      else if (d.cursor < events.length) {
        const client = createAscendIntelligenceClient();
        const r = await (d.kind === "measurement"
          ? client.measurementFeedback(
              d.reference.businessProfileId,
              d.reference.workspaceId,
              events[d.cursor]
            )
          : client.executionFeedback(
              d.reference.businessProfileId,
              d.reference.workspaceId,
              events[d.cursor]
            ));
        ok = r.ok;
        inactive = !r.ok && r.code === "agent_outcome_inactive";
        permanent =
          !r.ok &&
          [
            "conflict",
            "workspace_mismatch",
            "invalid_request",
            "unauthorized",
          ].includes(r.code);
      } else ok = true;
    } catch {
      /* durable bounded retry below */
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(row.ref)).data();
      if (!current || current.leaseToken !== token) return;
      const cursor = ok ? d.cursor + 1 : d.cursor,
        attempts = inactive ? (d.deliveryAttempts ?? 0) : ok ? 0 : (current.deliveryAttempts ?? 0);
      // Terminal could have arrived while sending an earlier event; use CURRENT.
      const total = current.events.length + (current.terminalEvent ? 1 : 0),
        done = cursor >= total && current.terminal !== "started";
      tx.update(row.ref, {
        cursor: Math.min(cursor, total),
        deliveryAttempts: attempts,
        deliveryState:
          permanent || attempts >= 5 ? "dead" : done ? "delivered" : "pending",
        lastDeliveryError: ok
          ? null
          : permanent
            ? "scope_or_contract_refused"
            : inactive ? "agent_outcome_inactive" : "bridge_unavailable",
        nextDeliveryAt:
          Date.now() + (ok ? 0 : Math.min(60000 * 2 ** attempts, 3600000)),
        leaseUntil: 0,
      });
    });
  }
  return !rows.empty;
}
