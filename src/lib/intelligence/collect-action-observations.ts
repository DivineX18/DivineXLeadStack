import "server-only";
import { agentOutcomeEnabled } from "@/lib/ai-suite/outcome-activation";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
/** Persist measured aggregates alongside explicit successful executions.
 * Association is scoped/temporal, NEVER a claim that the action caused lift.
 * Call only with actual successful source reads and their true measured window. */
export async function collectActionObservations(
  workspaceId: string,
  source: "flow_crm" | "ga4" | "gsc" | "shopify",
  sourceEntity: string,
  window: { start: string; end: string },
  metrics: Record<string, { value: number; unit: string }>,
  evidenceReference: string
) {
  if (!agentOutcomeEnabled()) return;
  const db = getAdminDb();
  const rows = await db
    .collection("aiSuiteFeedback")
    .where("reference.workspaceId", "==", workspaceId)
    .limit(100)
    .get();
  for (const row of rows.docs) {
    const d = row.data();
    if (
      d.kind === "measurement" ||
      d.terminal !== "succeeded" ||
      !d.terminalEvent?.occurredAt ||
      window.start <= d.terminalEvent.occurredAt.slice(0, 10)
    )
      continue;
    for (const [metric, m] of Object.entries(metrics)) {
      const plan = d.reference.measurement;
      if (
        !Number.isFinite(m.value) ||
        !plan ||
        plan.source !== source ||
        plan.sourceEntity !== sourceEntity ||
        plan.metric !== metric
      )
        continue;
      const receiptId = createHash("sha256")
        .update(
          JSON.stringify([d.executionId, source, sourceEntity, metric, window])
        )
        .digest("hex");
      const measurement = {
        receiptId,
        executionId: d.executionId,
        recommendationId: d.reference.recommendationId,
        evidenceId: d.reference.evidenceId,
        source,
        sourceEntity,
        metric,
        value: m.value,
        unit: m.unit,
        windowStart: window.start,
        windowEnd: window.end,
        evidence: {
          reference: evidenceReference,
          observedAt: new Date().toISOString(),
        },
      };
      const ref = db.doc(`aiSuiteFeedback/measurement_${receiptId}`);
      // Existing period observations are immutable. A subsequent changed source
      // snapshot has a different evidence reference but never inflates one window.
      await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return;
        tx.set(ref, {
          kind: "measurement",
          reference: d.reference,
          executionId: d.executionId,
          events: [measurement],
          cursor: 0,
          terminal: "measurement",
          deliveryAttempts: 0,
          nextDeliveryAt: Date.now(),
          leaseUntil: 0,
          deliveryState: "pending",
        });
      });
    }
  }
}
