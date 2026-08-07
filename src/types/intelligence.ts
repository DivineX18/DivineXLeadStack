/**
 * Ascend OS Phase 2, Slice 9 — canonical Intelligence types.
 * Corrected in Slice 10.5 against REAL Ascend response shapes, read
 * directly from the live route/query source
 * (`DivineX-Business-Intelligence/artifacts/api-server/src/lib/intelligenceQueries.ts`,
 * extracted this same slice from the pre-existing `/zeno/*` handlers) — not
 * guessed. The Slice 9 shapes below were wrong (invented nesting that
 * doesn't exist, an aggregate memory object where the real endpoint
 * returns a raw array, a timeline entry list where the real endpoint
 * returns a single comparison object). This file replaces them wholesale.
 *
 * Real bridge endpoints this client targets (Slice 10.5,
 * `routes/internalIntelligence.ts`, mounted at `/internal/intelligence/*`,
 * `requireServiceAuth`-gated — NOT the Clerk-gated `/zeno/*` paths Slice 9
 * originally pointed at):
 *   - `GET /internal/intelligence/business-profiles/:id/dashboard-summary` → DashboardSummary
 *   - `GET /internal/intelligence/cro-audits` → CroAudit[]
 *   - `GET /internal/intelligence/memory` → MemoryActionItem[]
 *   - `GET /internal/intelligence/growth-timeline/:businessProfileId` → GrowthTimeline | 404
 *   - `GET /internal/intelligence/reports` → IntelligenceReportSummary[]
 *
 * **Correction recorded**: Slice 9's header comment described `/zeno/memory`
 * as backed by a rich, governed `platform_memory` table. Direct source
 * read of the real route/query (this slice) shows it queries `zenoMemory`
 * instead — a simpler recommendation/status action-items list
 * (`{recommendation, status: pending|in_progress|completed|skipped}`), not
 * the richer governed store. `MemoryActionItem` below models what the
 * endpoint actually returns.
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

// ── Canonical models (Ascend-sourced, real shapes) ──────────────────────

/** From `businessTimelineEvents` — a raw event row, as returned inline
 *  inside dashboard-summary's `lastFiveTimeline`. */
export interface DashboardTimelineEvent {
  id: number;
  createdAt: string; // ISO
  businessProfileId: number;
  eventType: string; // 'onboarding' | 'growth_scan' | 'blueprint' | 'asset' | 'cro_audit' | 'calibration' | 'recommendation'
  title: string;
  summary: string | null;
  sourceType: string | null;
  sourceId: string | null;
  metadata: unknown;
}

/** From `generatedAssets` — a projected subset, as returned inline inside
 *  dashboard-summary's `lastFiveAssets`. */
export interface DashboardAsset {
  id: number;
  createdAt: string; // ISO
  assetType: string;
  title: string;
  version: number;
}

/** `GET /internal/intelligence/business-profiles/:id/dashboard-summary` —
 *  the real, flat shape computed by `getDashboardSummary()`. Replaces
 *  Slice 9's invented nested `GrowthAssessment.growthScore` object. */
export interface DashboardSummary {
  latestGrowthScore: number | null;
  scoreLabel: "Optimized" | "Ready to Scale" | "Growing" | "Needs Work" | null;
  primaryConstraint: string | null;
  recommendedFunnel: string | null;
  recommendedAction: string | null;
  latestBlueprintHeadline: string | null;
  assessmentId: number | null;
  blueprintId: number | null;
  latestBlueprintAssessmentId: number | null;
  hasScan: boolean;
  lastFiveAssets: DashboardAsset[];
  lastFiveTimeline: DashboardTimelineEvent[];
}

/** From `croAuditEngine.ts`'s real `CroAuditCategoryScore` — used for both
 *  `categoryScores` and the `strengths`/`weaknesses` subsets on a CRO audit row. */
export interface CroAuditCategoryScore {
  key: string;
  label: string;
  score: number;
  color: "green" | "yellow" | "red";
  finding: string;
}

/** From `croAuditEngine.ts`'s real `CroAuditRecommendation` — used for both
 *  `quickWins` and `recommendations` on a CRO audit row. Replaces Slice 9's
 *  invented `Recommendation{id,title,impact:lowercase,...}` shape: impact/
 *  difficulty are Title-cased in the real engine, there is no `id` field
 *  (a recommendation is identified by its position within an audit, not a
 *  standalone id), and the fix text lives in `fix`/`fixWithZeno`, not `title`. */
export interface CroAuditRecommendation {
  categoryKey: string;
  categoryLabel: string;
  impact: "High" | "Medium" | "Low";
  difficulty: "High" | "Medium" | "Low";
  fix: string;
  fixWithZeno: string | null;
  fixContext: string;
}

/** `GET /internal/intelligence/cro-audits` — a raw `croAudits` DB row (via
 *  `getCroAuditsForProfile()`), timestamps serialized to ISO. Replaces
 *  Slice 9's invented `CroAuditSummary{quickWinCount,...}` aggregate — the
 *  real endpoint returns full rows, not a summary. */
export interface CroAudit {
  id: number;
  createdAt: string; // ISO
  businessProfileId: number | null;
  url: string;
  notes: string | null;
  overallScore: number;
  categoryScores: CroAuditCategoryScore[];
  strengths: CroAuditCategoryScore[];
  weaknesses: CroAuditCategoryScore[];
  quickWins: CroAuditRecommendation[];
  recommendations: CroAuditRecommendation[];
  aiMode: "live" | "mock";
  requiresHumanReview: boolean;
  reviewReason: string | null;
}

/** `GET /internal/intelligence/memory` — a raw `zenoMemory` DB row (via
 *  `getMemoryForProfile()`), timestamps serialized to ISO. This is a
 *  recommendation/status action-items list, not the richer governed
 *  `platform_memory` concept Slice 9 assumed — see the correction note in
 *  the file header. Replaces Slice 9's invented `BusinessMemorySummary`
 *  aggregate; the real endpoint returns a raw array of these. */
export interface MemoryActionItem {
  id: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  businessProfileId: number;
  recommendation: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  sourceType: string | null; // 'assessment' | 'strategy' | 'audit'
  sourceId: number | null;
}

export interface GrowthTimelineCategoryDelta {
  key: string;
  label: string;
  previousScore: number;
  currentScore: number;
  difference: number;
  direction: "improved" | "declined" | "no_change" | "new_finding" | "resolved";
  reason: string;
}

export interface GrowthTimelineRecommendationProgress {
  recommendation: string;
  status: "completed" | "improved" | "no_change" | "regressed" | "outstanding" | "new_opportunity";
  previousScore?: number;
  currentScore?: number;
  relatedCategory?: string;
}

export interface GrowthTimelineBusinessEvolution {
  previousOverallScore: number;
  currentOverallScore: number;
  difference: number;
  direction: "improved" | "declined" | "no_change";
  summary: string;
  topImprovements: string[];
  outstandingIssues: string[];
  highestPriorityOpportunity: string;
}

/** `GET /internal/intelligence/growth-timeline/:businessProfileId` — a
 *  SINGLE `growthTimelines` row: one scan-to-scan comparison, not a list of
 *  timeline events (that's `DashboardTimelineEvent[]`, a different, unrelated
 *  concept nested inside dashboard-summary). Replaces Slice 9's invented
 *  `GrowthTimelineEntry[]` shape. 404s (returned as `null` by this client)
 *  when fewer than 2 scans exist for the profile. */
export interface GrowthTimeline {
  id: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  businessProfileId: number;
  currentScanId: number | null;
  previousScanId: number | null;
  scanCount: number;
  businessEvolution: GrowthTimelineBusinessEvolution;
  categoryDeltas: GrowthTimelineCategoryDelta[];
  recommendationProgress: GrowthTimelineRecommendationProgress[];
}

/** `GET /internal/intelligence/reports` — real field names from
 *  `getReportsForProfile()`: `reportType` (not `kind`), no `shareUrl` (only
 *  a raw `shareToken`, null for business_architect reports), plus the
 *  underlying growth-scan/blueprint linkage ids. Replaces Slice 9's
 *  invented `{kind, shareUrl}` shape. */
export interface IntelligenceReportSummary {
  id: string; // "gs_<id>" | "bp_<id>"
  reportType: "growth_scan" | "business_architect";
  title: string;
  businessType: string | null;
  websiteUrl: string | null;
  score: number | null;
  scoreLabel: string | null;
  status: string | null;
  createdAt: string; // ISO
  shareToken: string | null;
  scanId: number | null;
  blueprintId: number | null;
  assessmentId: number | null;
  businessProfileId: number | null;
}

/** One composed snapshot of everything Ascend knows about a business
 *  profile, at the granularity Home/Identify actually render. This is the
 *  return shape of `resolveIntelligenceSnapshot()` — every field is
 *  independently meta-tagged so a partial outage never blanks the whole
 *  snapshot. */
export interface IntelligenceSnapshot {
  businessProfileId: string | null;
  dashboardSummary: WithMeta<DashboardSummary>;
  croAudits: WithMeta<CroAudit[]>;
  /** Convenience projection of the newest CRO audit's `recommendations`
   *  array — derived client-side, not a separate fetch. */
  recommendations: WithMeta<CroAuditRecommendation[]>;
  growthTimeline: WithMeta<GrowthTimeline>;
  memory: WithMeta<MemoryActionItem[]>;
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
   *  endpoint. Sourced from the latest CRO audit's `recommendations`
   *  array. Null when nothing qualifies (no data, or everything nominal). */
  recommendedNextAction: CroAuditRecommendation | null;
}

export interface IdentifyDashboardData {
  workspaceId: string;
  intelligence: IntelligenceSnapshot;
}
