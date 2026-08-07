/**
 * Ascend OS Phase 2, Slice 9 — canonical Intelligence types.
 *
 * Repository-truth audit (this slice, cross-checked against direct source
 * reads of `DivineX-Business-Intelligence/artifacts/api-server/src` done
 * earlier in this effort — not re-derived from the product's marketing
 * description):
 *
 *   - Real, confirmed, `requireAuth`-gated (Clerk) route groups this slice's
 *     client targets: `GET /zeno/business-profiles/:id/dashboard-summary`,
 *     `GET /zeno/assessments`, `GET /zeno/growth-scans`, `GET /zeno/cro-audits`,
 *     `GET /zeno/memory`, `GET /zeno/growth-timeline/:businessProfileId`,
 *     `GET /zeno/reports`. Every path above was seen mounted in
 *     `routes/index.ts`/`routes/zeno.ts`/`routes/growthScan.ts` directly.
 *   - **Contradiction recorded, not silently resolved**: this slice's own
 *     instructions list "Recommendations" as a first-class Ascend read
 *     surface alongside Growth Scan/Assessments/Business Memory. No
 *     standalone `/recommendations` (or similar) endpoint exists anywhere in
 *     Ascend's route mounts. Recommendations are real, but they live NESTED
 *     inside a CRO audit response's `recommendations` field (rendered by
 *     Ascend's own `CroAuditor.tsx` as `RecommendationCard`s) — there is no
 *     endpoint to page/list/filter them independently. `Recommendation`
 *     below models the nested shape; there is deliberately no
 *     `listRecommendations()` client method, because that would be an
 *     invented endpoint.
 *   - **Contradiction recorded**: "Zeno read APIs" is listed as a distinct
 *     surface. Zeno's OWN endpoint (`POST /zeno/chat`) is action/chat, not a
 *     read API. The closest genuine read-only Zeno-adjacent surfaces are
 *     `/zeno/memory` (Business Memory — real, structured, see
 *     BusinessMemorySummary) and `/zeno/timeline` / `/zeno/growth-timeline/:id`
 *     (Growth Timeline). This slice's client exposes those, not a fictional
 *     "Zeno read" endpoint.
 *   - **Auth gap recorded, not worked around**: every route above requires a
 *     live Clerk session token. `docs/architecture/ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md`
 *     Section 6 ("API Contract Strategy") explicitly states the
 *     service-to-service contract for Flow calling these routes on a
 *     workspace's behalf is "Not implemented by this document — this is the
 *     Phase 1 checklist, pending product-owner approval." No service-account/
 *     API-key mechanism exists on Ascend's side today (confirmed: Ascend's
 *     own dev-only Clerk-bypass header is explicitly disabled in
 *     production). This means `AscendIntelligenceApiConfigured()` (the
 *     client, Slice 9) will return false in every environment until that
 *     contract is actually specified and the resulting env vars are set —
 *     this is the CURRENT, HONEST state of the system, not a placeholder.
 *     Every card built this slice has a real, first-class "unavailable"
 *     state for exactly this reason.
 *
 * All types below are pure data — no fetch/Firestore/Postgres/Express
 * import anywhere in this file.
 */

// ── Shared primitives ───────────────────────────────────────────────────

/** Every intelligence-derived field on the dashboard carries this, so the
 *  UI can render "unavailable"/"stale" honestly instead of pretending a
 *  zero or empty array is the same thing as "we don't know." */
export type IntelligenceFieldStatus = "ok" | "cached" | "stale" | "unavailable" | "timeout" | "empty";

export interface IntelligenceFetchMeta {
  status: IntelligenceFieldStatus;
  /** ms since epoch this value was fetched (fresh) or cached (stale/cached). Null when status is "unavailable"/"timeout"/"empty" and nothing was ever fetched. */
  fetchedAt: number | null;
  /** Present only for "unavailable"/"timeout" — a short, non-sensitive reason code, never a raw error message or stack trace. */
  reasonCode: string | null;
}

export interface WithMeta<T> {
  meta: IntelligenceFetchMeta;
  data: T | null;
}

// ── Canonical models (Ascend-sourced) ───────────────────────────────────

/** From `growthScans` (via `/zeno/business-profiles/:id/dashboard-summary`
 *  and `/zeno/growth-scans`) — `growthScanEngine.ts`'s real output shape:
 *  overall 0-100 score + weighted category breakdown + a primary
 *  constraint. Field names below are the STABLE subset this slice commits
 *  to; the full engine output has more fields not needed for Home/Identify. */
export interface GrowthScore {
  overallScore: number; // 0-100
  primaryConstraint: string | null;
  categoryScores: { category: string; score: number }[];
  scannedAt: string; // ISO
}

export interface GrowthAssessment {
  id: string;
  businessProfileId: string;
  status: "pending" | "in_progress" | "complete" | "failed";
  growthScore: GrowthScore | null;
  recommendedFunnel: string | null;
  createdAt: string;
}

/** Nested inside a CRO audit response — see the contradiction note above.
 *  Modeled here because Home/Identify need to render it; there is no
 *  standalone endpoint that returns a list of these on its own. */
export interface Recommendation {
  id: string;
  title: string;
  impact: "high" | "medium" | "low";
  difficulty: "high" | "medium" | "low";
  category: string;
  sourceAuditId: string;
}

export interface CroAuditSummary {
  id: string;
  businessProfileId: string;
  overallScore: number | null;
  quickWinCount: number;
  recommendations: Recommendation[];
  createdAt: string;
}

/** From `/zeno/growth-timeline/:businessProfileId` or `/zeno/timeline`. One
 *  entry per notable event Ascend recorded for a business — scans, audits,
 *  blueprint generations, memory writes. Kept intentionally generic
 *  (`kind` is a string, not a closed union) since this slice did not
 *  enumerate every real event kind the backend emits — narrowing that is a
 *  follow-up once live connectivity exists to observe real payloads. */
export interface GrowthTimelineEntry {
  id: string;
  kind: string;
  title: string;
  occurredAt: string;
  businessProfileId: string;
}

/** From `/zeno/memory` — backed by Ascend's real `platform_memory` table
 *  (governed, scoped, system-written — the LLM reads it, never writes it
 *  directly, per the schema's own doc comment). This summary is a thin,
 *  UI-shaped projection, not the full memory record (which also carries
 *  provenance/review fields Home/Identify don't render). */
export interface BusinessMemoryItem {
  id: string;
  memoryType: string;
  summary: string;
  confidenceScore: number | null;
  status: "pending" | "approved" | "rejected" | "needs_revision";
  createdAt: string;
}

export interface BusinessMemorySummary {
  totalCount: number;
  approvedCount: number;
  recentItems: BusinessMemoryItem[];
}

export interface IntelligenceReportSummary {
  id: string;
  kind: "growth_scan" | "cro_audit" | "blueprint";
  title: string;
  score: number | null;
  createdAt: string;
  shareUrl: string | null;
}

/** One composed snapshot of everything Ascend knows about a business
 *  profile, at the granularity Home/Identify actually render. This is the
 *  return shape of `resolveIntelligenceSnapshot()` — every field is
 *  independently meta-tagged so a partial outage never blanks the whole
 *  snapshot. */
export interface IntelligenceSnapshot {
  businessProfileId: string | null;
  growthScore: WithMeta<GrowthScore>;
  latestAssessment: WithMeta<GrowthAssessment>;
  latestCroAudit: WithMeta<CroAuditSummary>;
  recommendations: WithMeta<Recommendation[]>;
  timeline: WithMeta<GrowthTimelineEntry[]>;
  memory: WithMeta<BusinessMemorySummary>;
  reports: WithMeta<IntelligenceReportSummary[]>;
}

// ── Canonical models (Flow-sourced, operational) ────────────────────────

/** Revenue/pipeline/leads/tasks/appointments — real Flow data, computed
 *  server-side against the SAME collections (contacts/deals/tasks/events)
 *  the existing client-side dashboard subscribes to (CLAUDE.md: contacts,
 *  deals with stageId/value, tasks with dueAt/completed, events with
 *  startAt). No equivalent reusable SERVER-side function existed before
 *  this slice (the existing dashboard reads client-side via onSnapshot) —
 *  this is new, necessary composition code, not a duplicate of anything. */
export interface BusinessHealthSummary {
  revenueThisMonthCents: number;
  wonDealsThisMonth: number;
  openPipelineValueCents: number;
  openPipelineCount: number;
  newLeadsThisWeek: number;
  overdueTaskCount: number;
  dueTodayTaskCount: number;
  upcomingAppointmentCount: number;
}

// ── Composed dashboard payloads (Task 4/6 output shapes) ────────────────

export interface HomeDashboardData {
  workspaceId: string;
  businessHealth: WithMeta<BusinessHealthSummary>;
  intelligence: IntelligenceSnapshot;
  /** A single, pre-ranked "what to do next" — derived, not a separate
   *  endpoint (there isn't one — see the Recommendations contradiction
   *  above). Null when nothing qualifies (no data, or everything nominal). */
  recommendedNextAction: Recommendation | null;
}

export interface IdentifyDashboardData {
  workspaceId: string;
  intelligence: IntelligenceSnapshot;
}
