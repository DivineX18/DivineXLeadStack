import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FunnelDoc } from "@/types/funnels";
import { evaluateFunnelCopy, hasFabricationRisk, type CopyQualityReport } from "./copy-quality";

/**
 * Funnel Copy Review (Conversion Engine, M6b — the live-path evaluate step).
 *
 * Runs the deterministic M4 Copy Quality Engine on a just-built funnel and
 * persists the result, mirroring scoreFunnelDesign() exactly: a review doc in
 * its own collection (funnelCopyReviews), keyed to the funnel. Where the design
 * score is an LLM critic of the VISUAL system, this is a zero-cost, no-LLM
 * scan of the COPY — flagging generic filler, likely fabrication (invented
 * proof/stats), vague CTAs, and name-swap-generic headlines for operator
 * review before publish. Detection only; it never rewrites (that's the later
 * LLM rewrite pass) — same stance as the gitpage content-audit.
 *
 * Best-effort: any failure returns null and never blocks funnel creation, like
 * every other lifecycle side-effect in this codebase.
 */

const COLLECTION = "funnelCopyReviews";

export interface FunnelCopyReview extends CopyQualityReport {
  id: string;
  funnelId: string;
  subAccountId: string;
  agencyId: string | null;
  /** True when a high-severity possible fabrication was found — the "do not
   *  share until reviewed" signal. */
  fabricationRisk: boolean;
  createdAt: unknown;
}

export async function reviewFunnelCopy(funnel: FunnelDoc): Promise<FunnelCopyReview | null> {
  try {
    const report = evaluateFunnelCopy(
      (funnel.sections ?? []).map((s) => ({
        type: s.type,
        config: s.config as unknown as Record<string, unknown>,
      })),
    );
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc();
    const doc: FunnelCopyReview = {
      id: ref.id,
      funnelId: funnel.id,
      subAccountId: funnel.subAccountId,
      agencyId: funnel.agencyId ?? null,
      score: report.score,
      issues: report.issues,
      weakSectionTypes: report.weakSectionTypes,
      fieldsChecked: report.fieldsChecked,
      fabricationRisk: hasFabricationRisk(report),
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(doc);
    return doc;
  } catch {
    // Swallowed — funnel creation must never fail because a review didn't run.
    return null;
  }
}
