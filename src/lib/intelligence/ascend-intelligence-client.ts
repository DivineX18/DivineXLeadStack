import "server-only";

import { ascendIntelligenceBaseUrl, ascendIntelligenceConfigured, ascendIntelligenceSharedSecret } from "@/lib/intelligence/ascend-intelligence-config";
import { readIntelligenceCache, writeIntelligenceCache } from "@/lib/intelligence/intelligence-cache";
import { recordIntelligenceAuditEvent } from "@/lib/intelligence/intelligence-audit";
import { MAX_RETRIES, TIMEOUT_MS, backoffMs, normalizeFailure, shouldRetry } from "@/lib/intelligence/ascend-intelligence-retry";
import type {
  CroAudit,
  CroAuditCategoryScore,
  CroAuditRecommendation,
  DashboardAsset,
  DashboardSummary,
  DashboardTimelineEvent,
  GrowthTimeline,
  GrowthTimelineBusinessEvolution,
  GrowthTimelineCategoryDelta,
  GrowthTimelineRecommendationProgress,
  IntelligenceReportSummary,
  MemoryActionItem,
  WithMeta,
} from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 (hardened Slice 10, corrected Slice 10.5) —
 * THE single server-side client responsible for every Ascend Intelligence
 * read. No other file in this codebase should call `fetch()` against an
 * Ascend host directly — structurally enforced by
 * `scripts/verify-intelligence-slice9-structure.mts`.
 *
 * Slice 10 formalized the request/response contract in
 * `docs/architecture/INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md`. Slice 10.5
 * built the real Ascend-side receiver
 * (`routes/internalIntelligence.ts`, `/internal/intelligence/*`,
 * `requireServiceAuth`-gated) and this client is corrected to match it
 * exactly: real paths (NOT the Clerk-gated `/zeno/*` paths Slice 9
 * originally, wrongly, pointed at) and real response shapes (read directly
 * from `intelligenceQueries.ts` — see `types/intelligence.ts`'s header for
 * the full list of corrections). The bridge always wraps responses in the
 * formal `{ok, data, error}` envelope now that the receiver is real; the
 * bare/legacy parse path is kept only as a defensive fallback, never
 * assumed as primary.
 *
 * Every public method returns `WithMeta<T>` — never throws for an expected
 * failure (not-configured, timeout, upstream error, unparseable body,
 * envelope error). Fails closed to `{status: "unavailable"|"timeout",
 * data: null}` in every one of those cases so a caller can always render a
 * real UI state instead of crashing. Genuine bugs (a programming error in
 * this file) still throw — this contract is about the KNOWN failure modes
 * of a real external dependency, not about swallowing everything
 * unconditionally.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RawFetchResult {
  ok: boolean;
  status: number | null;
  timedOut: boolean;
  body: unknown;
}

/** Injectable so tests never make a real network call. Defaults to the
 *  global fetch. */
export type FetchImpl = typeof fetch;

async function rawFetch(fetchImpl: FetchImpl, url: string, secret: string, businessProfileId: string): Promise<RawFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        // Required per the service bridge contract (Slice 10, verified
        // live against the real `requireServiceAuth` middleware in Slice
        // 10.5) — the secret proves this request came from Flow's
        // backend; this header states WHICH business profile's data is
        // being asked for. A valid secret is necessary, never sufficient.
        "X-Intelligence-Business-Profile-Id": businessProfileId,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      // The bridge itself returns 401/404/500 WITH a JSON envelope body
      // (never a bare non-2xx with no body) — still parse it so the
      // envelope branch below can extract the real error code instead of
      // falling back to a generic "http_error".
      try {
        const body = await res.json();
        return { ok: false, status: res.status, timedOut: false, body };
      } catch {
        return { ok: false, status: res.status, timedOut: false, body: null };
      }
    }
    try {
      const body = await res.json();
      return { ok: true, status: res.status, timedOut: false, body };
    } catch {
      return { ok: false, status: res.status, timedOut: false, body: null };
    }
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { ok: false, status: null, timedOut, body: null };
  }
}

async function fetchWithRetry(fetchImpl: FetchImpl, url: string, secret: string, businessProfileId: string): Promise<RawFetchResult> {
  let attempt = 0;
  let last: RawFetchResult = { ok: false, status: null, timedOut: false, body: null };
  for (;;) {
    last = await rawFetch(fetchImpl, url, secret, businessProfileId);
    if (last.ok) return last;
    if (!shouldRetry({ attempt, status: last.status })) return last;
    await sleep(backoffMs(attempt));
    attempt++;
    if (attempt > MAX_RETRIES) return last;
  }
}

// ── Response envelope (Slice 10 contract, live since Slice 10.5) ────────

interface BridgeEnvelope {
  ok: boolean;
  data: unknown;
  error: { code: string; message: string } | null;
}

const ENVELOPE_ERROR_CODES = new Set(["unauthorized", "business_not_found", "workspace_mismatch", "not_found", "internal_error"]);

function isBridgeEnvelope(body: unknown): body is BridgeEnvelope {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.ok === "boolean" && "data" in obj && "error" in obj;
}

/**
 * Core generic read: cache → not-configured gate → fetch-with-retry →
 * parse → cache write. `resource` is a stable audit/cache-key label (e.g.
 * "growth-timeline"), never a value containing business/user data.
 *
 * `treatNotFoundAsEmpty`: the growth-timeline endpoint legitimately 404s
 * ("not_found") when fewer than 2 scans exist for a profile — that's a
 * real, expected "empty" state, not a failure, so it's surfaced as
 * `status: "empty"` rather than `"unavailable"` when this flag is set.
 */
async function readAscendResource<T>(params: {
  resource: string;
  cacheKey: string;
  path: string;
  businessProfileId: string;
  fetchImpl: FetchImpl;
  parse: (body: unknown) => T | null;
  treatNotFoundAsEmpty?: boolean;
}): Promise<WithMeta<T>> {
  const { resource, cacheKey, path, businessProfileId, fetchImpl, parse, treatNotFoundAsEmpty } = params;

  const cached = readIntelligenceCache<T>(cacheKey);
  if (cached.hit === "fresh") {
    recordIntelligenceAuditEvent({ kind: "cache_hit", resource, cacheState: "fresh" });
    return { meta: { status: "ok", fetchedAt: cached.fetchedAt, reasonCode: null }, data: cached.value };
  }

  if (!ascendIntelligenceConfigured()) {
    recordIntelligenceAuditEvent({ kind: "not_configured", resource });
    // A stale cache entry, if one exists, is still better than nothing —
    // but not-configured is itself never a reason to invent fresh data.
    if (cached.hit === "stale") {
      return { meta: { status: "stale", fetchedAt: cached.fetchedAt, reasonCode: "not_configured" }, data: cached.value };
    }
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "not_configured" }, data: null };
  }

  const baseUrl = ascendIntelligenceBaseUrl();
  const secret = ascendIntelligenceSharedSecret();
  if (!baseUrl || !secret) {
    // Structurally unreachable given the configured() check above, but
    // kept as an explicit fail-closed branch rather than a non-null
    // assertion, per this effort's own "fail closed, never assume" rule.
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "not_configured" }, data: null };
  }

  recordIntelligenceAuditEvent({ kind: "bridge_request_sent", resource });
  const start = Date.now();
  const result = await fetchWithRetry(fetchImpl, `${baseUrl}${path}`, secret, businessProfileId);
  const durationMs = Date.now() - start;

  if (isBridgeEnvelope(result.body)) {
    if (!result.body.ok) {
      const code = result.body.error?.code && ENVELOPE_ERROR_CODES.has(result.body.error.code) ? result.body.error.code : "internal_error";
      if (treatNotFoundAsEmpty && code === "not_found") {
        recordIntelligenceAuditEvent({ kind: "bridge_envelope_ok", resource, durationMs });
        return { meta: { status: "empty", fetchedAt: Date.now(), reasonCode: null }, data: null };
      }
      recordIntelligenceAuditEvent({ kind: "bridge_envelope_error", resource, errorCode: code, durationMs });
      if (cached.hit === "stale") {
        return { meta: { status: "stale", fetchedAt: cached.fetchedAt, reasonCode: code }, data: cached.value };
      }
      return { meta: { status: "unavailable", fetchedAt: null, reasonCode: code }, data: null };
    }
    const parsedEnvelope = parse(result.body.data);
    if (parsedEnvelope === null) {
      recordIntelligenceAuditEvent({ kind: "fetch_failure", resource, reasonCode: "unparseable_response", durationMs });
      if (cached.hit === "stale") {
        return { meta: { status: "stale", fetchedAt: cached.fetchedAt, reasonCode: "unparseable_response" }, data: cached.value };
      }
      return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "unparseable_response" }, data: null };
    }
    writeIntelligenceCache(cacheKey, parsedEnvelope);
    recordIntelligenceAuditEvent({ kind: "bridge_envelope_ok", resource, durationMs });
    return { meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null }, data: parsedEnvelope };
  }

  if (result.ok) {
    // Defensive fallback for a bare/legacy body that isn't the formal
    // envelope — kept only in case something between Flow and the real
    // bridge (a proxy, a CDN) ever strips the envelope. Never the expected
    // path against the real, live `/internal/intelligence/*` receiver.
    const parsed = parse(result.body);
    if (parsed === null) {
      recordIntelligenceAuditEvent({ kind: "fetch_failure", resource, reasonCode: "unparseable_response", durationMs });
      if (cached.hit === "stale") {
        return { meta: { status: "stale", fetchedAt: cached.fetchedAt, reasonCode: "unparseable_response" }, data: cached.value };
      }
      return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "unparseable_response" }, data: null };
    }
    writeIntelligenceCache(cacheKey, parsed);
    recordIntelligenceAuditEvent({ kind: "fetch_success", resource, durationMs });
    return { meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null }, data: parsed };
  }

  const reasonCode = normalizeFailure({ status: result.status, timedOut: result.timedOut });
  if (result.timedOut) {
    recordIntelligenceAuditEvent({ kind: "fetch_timeout", resource, durationMs });
  } else {
    recordIntelligenceAuditEvent({ kind: "fetch_failure", resource, reasonCode, durationMs });
  }

  if (cached.hit === "stale") {
    return { meta: { status: "stale", fetchedAt: cached.fetchedAt, reasonCode }, data: cached.value };
  }
  return {
    meta: { status: result.timedOut ? "timeout" : "unavailable", fetchedAt: null, reasonCode },
    data: null,
  };
}

// ── Parsers — defensive, never throw, return null on any shape mismatch ──
// Field names match the REAL schema/route shapes confirmed by direct
// source read of `intelligenceQueries.ts` this slice (Slice 10.5) — see
// src/types/intelligence.ts's header for the full correction record.

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function parseCategoryScore(raw: unknown): CroAuditCategoryScore | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.key !== "string" || typeof c.label !== "string") return null;
  return {
    key: c.key,
    label: c.label,
    score: num(c.score) ?? 0,
    color: (["green", "yellow", "red"] as const).includes(c.color as never) ? (c.color as "green" | "yellow" | "red") : "yellow",
    finding: str(c.finding) ?? "",
  };
}

function parseCategoryScoreArray(raw: unknown): CroAuditCategoryScore[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseCategoryScore).filter((c): c is CroAuditCategoryScore => c !== null);
}

function parseRecommendation(raw: unknown): CroAuditRecommendation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.fix !== "string") return null;
  return {
    categoryKey: str(r.categoryKey) ?? "",
    categoryLabel: str(r.categoryLabel) ?? "",
    impact: (["High", "Medium", "Low"] as const).includes(r.impact as never) ? (r.impact as "High" | "Medium" | "Low") : "Medium",
    difficulty: (["High", "Medium", "Low"] as const).includes(r.difficulty as never) ? (r.difficulty as "High" | "Medium" | "Low") : "Medium",
    fix: r.fix,
    fixWithZeno: str(r.fixWithZeno),
    fixContext: str(r.fixContext) ?? "",
  };
}

function parseRecommendationArray(raw: unknown): CroAuditRecommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseRecommendation).filter((r): r is CroAuditRecommendation => r !== null);
}

function parseDashboardAsset(raw: unknown): DashboardAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "number") return null;
  return {
    id: a.id,
    createdAt: str(a.createdAt) ?? new Date().toISOString(),
    assetType: str(a.assetType) ?? "",
    title: str(a.title) ?? "",
    version: num(a.version) ?? 1,
  };
}

function parseDashboardTimelineEvent(raw: unknown): DashboardTimelineEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "number") return null;
  return {
    id: t.id,
    createdAt: str(t.createdAt) ?? new Date().toISOString(),
    businessProfileId: num(t.businessProfileId) ?? 0,
    eventType: str(t.eventType) ?? "unknown",
    title: str(t.title) ?? "",
    summary: str(t.summary),
    sourceType: str(t.sourceType),
    sourceId: str(t.sourceId),
    metadata: t.metadata ?? null,
  };
}

function parseDashboardScoreSource(v: unknown): DashboardSummary["scoreSource"] {
  return v === "website_scan" || v === "business_assessment" ? v : null;
}

function parseLatestWebsiteScan(raw: unknown): DashboardSummary["latestWebsiteScan"] {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "number" ||
    typeof o.overallScore !== "number" ||
    typeof o.scoreLabel !== "string" ||
    typeof o.biggestBottleneck !== "string" ||
    typeof o.recommendedFunnelType !== "string" ||
    typeof o.shareToken !== "string" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: o.id,
    createdAt: o.createdAt,
    overallScore: o.overallScore,
    scoreLabel: o.scoreLabel,
    biggestBottleneck: o.biggestBottleneck,
    recommendedFunnelType: o.recommendedFunnelType,
    shareToken: o.shareToken,
  };
}

function parseDashboardSummary(body: unknown): DashboardSummary | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const scoreLabel = (["Optimized", "Ready to Scale", "Growing", "Needs Work"] as const).includes(obj.scoreLabel as never)
    ? (obj.scoreLabel as DashboardSummary["scoreLabel"])
    : null;
  return {
    latestGrowthScore: num(obj.latestGrowthScore),
    scoreLabel,
    scoreSource: parseDashboardScoreSource(obj.scoreSource),
    primaryConstraint: str(obj.primaryConstraint),
    recommendedFunnel: str(obj.recommendedFunnel),
    recommendedAction: str(obj.recommendedAction),
    latestBlueprintHeadline: str(obj.latestBlueprintHeadline),
    assessmentId: num(obj.assessmentId),
    blueprintId: num(obj.blueprintId),
    latestBlueprintAssessmentId: num(obj.latestBlueprintAssessmentId),
    hasScan: bool(obj.hasScan, false),
    latestWebsiteScan: parseLatestWebsiteScan(obj.latestWebsiteScan),
    lastFiveAssets: Array.isArray(obj.lastFiveAssets) ? obj.lastFiveAssets.map(parseDashboardAsset).filter((a): a is DashboardAsset => a !== null) : [],
    lastFiveTimeline: Array.isArray(obj.lastFiveTimeline)
      ? obj.lastFiveTimeline.map(parseDashboardTimelineEvent).filter((t): t is DashboardTimelineEvent => t !== null)
      : [],
  };
}

function parseCroAuditRow(raw: unknown): CroAudit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "number" || typeof o.url !== "string") return null;
  return {
    id: o.id,
    createdAt: str(o.createdAt) ?? new Date().toISOString(),
    businessProfileId: num(o.businessProfileId),
    url: o.url,
    notes: str(o.notes),
    overallScore: num(o.overallScore) ?? 0,
    categoryScores: parseCategoryScoreArray(o.categoryScores),
    strengths: parseCategoryScoreArray(o.strengths),
    weaknesses: parseCategoryScoreArray(o.weaknesses),
    quickWins: parseRecommendationArray(o.quickWins),
    recommendations: parseRecommendationArray(o.recommendations),
    aiMode: o.aiMode === "live" ? "live" : "mock",
    requiresHumanReview: bool(o.requiresHumanReview, false),
    reviewReason: str(o.reviewReason),
  };
}

function parseCroAudits(body: unknown): CroAudit[] | null {
  if (!Array.isArray(body)) return null;
  return body.map(parseCroAuditRow).filter((a): a is CroAudit => a !== null);
}

function parseMemoryItem(raw: unknown): MemoryActionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  if (typeof i.id !== "number" || typeof i.recommendation !== "string") return null;
  return {
    id: i.id,
    createdAt: str(i.createdAt) ?? new Date().toISOString(),
    updatedAt: str(i.updatedAt) ?? new Date().toISOString(),
    businessProfileId: num(i.businessProfileId) ?? 0,
    recommendation: i.recommendation,
    status: (["pending", "in_progress", "completed", "skipped"] as const).includes(i.status as never)
      ? (i.status as MemoryActionItem["status"])
      : "pending",
    sourceType: str(i.sourceType),
    sourceId: num(i.sourceId),
  };
}

function parseMemory(body: unknown): MemoryActionItem[] | null {
  if (!Array.isArray(body)) return null;
  return body.map(parseMemoryItem).filter((i): i is MemoryActionItem => i !== null);
}

function parseCategoryDelta(raw: unknown): GrowthTimelineCategoryDelta | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.key !== "string") return null;
  return {
    key: c.key,
    label: str(c.label) ?? "",
    previousScore: num(c.previousScore) ?? 0,
    currentScore: num(c.currentScore) ?? 0,
    difference: num(c.difference) ?? 0,
    direction: (["improved", "declined", "no_change", "new_finding", "resolved"] as const).includes(c.direction as never)
      ? (c.direction as GrowthTimelineCategoryDelta["direction"])
      : "no_change",
    reason: str(c.reason) ?? "",
  };
}

function parseRecommendationProgress(raw: unknown): GrowthTimelineRecommendationProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.recommendation !== "string") return null;
  const status = (["completed", "improved", "no_change", "regressed", "outstanding", "new_opportunity"] as const).includes(r.status as never)
    ? (r.status as GrowthTimelineRecommendationProgress["status"])
    : "outstanding";
  return {
    recommendation: r.recommendation,
    status,
    ...(typeof r.previousScore === "number" ? { previousScore: r.previousScore } : {}),
    ...(typeof r.currentScore === "number" ? { currentScore: r.currentScore } : {}),
    ...(typeof r.relatedCategory === "string" ? { relatedCategory: r.relatedCategory } : {}),
  };
}

function parseBusinessEvolution(raw: unknown): GrowthTimelineBusinessEvolution {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    previousOverallScore: num(o.previousOverallScore) ?? 0,
    currentOverallScore: num(o.currentOverallScore) ?? 0,
    difference: num(o.difference) ?? 0,
    direction: (["improved", "declined", "no_change"] as const).includes(o.direction as never)
      ? (o.direction as GrowthTimelineBusinessEvolution["direction"])
      : "no_change",
    summary: str(o.summary) ?? "",
    topImprovements: Array.isArray(o.topImprovements) ? o.topImprovements.filter((s): s is string => typeof s === "string") : [],
    outstandingIssues: Array.isArray(o.outstandingIssues) ? o.outstandingIssues.filter((s): s is string => typeof s === "string") : [],
    highestPriorityOpportunity: str(o.highestPriorityOpportunity) ?? "",
  };
}

function parseGrowthTimeline(body: unknown): GrowthTimeline | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id !== "number") return null;
  return {
    id: o.id,
    createdAt: str(o.createdAt) ?? new Date().toISOString(),
    updatedAt: str(o.updatedAt) ?? new Date().toISOString(),
    businessProfileId: num(o.businessProfileId) ?? 0,
    currentScanId: num(o.currentScanId),
    previousScanId: num(o.previousScanId),
    scanCount: num(o.scanCount) ?? 0,
    businessEvolution: parseBusinessEvolution(o.businessEvolution),
    categoryDeltas: Array.isArray(o.categoryDeltas) ? o.categoryDeltas.map(parseCategoryDelta).filter((c): c is GrowthTimelineCategoryDelta => c !== null) : [],
    recommendationProgress: Array.isArray(o.recommendationProgress)
      ? o.recommendationProgress.map(parseRecommendationProgress).filter((r): r is GrowthTimelineRecommendationProgress => r !== null)
      : [],
  };
}

function parseReportItem(raw: unknown): IntelligenceReportSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  if (typeof i.id !== "string") return null;
  return {
    id: i.id,
    reportType: i.reportType === "business_architect" ? "business_architect" : "growth_scan",
    title: str(i.title) ?? "",
    businessType: str(i.businessType),
    websiteUrl: str(i.websiteUrl),
    score: num(i.score),
    scoreLabel: str(i.scoreLabel),
    status: str(i.status),
    createdAt: str(i.createdAt) ?? new Date().toISOString(),
    shareToken: str(i.shareToken),
    scanId: num(i.scanId),
    blueprintId: num(i.blueprintId),
    assessmentId: num(i.assessmentId),
    businessProfileId: num(i.businessProfileId),
  };
}

function parseReports(body: unknown): IntelligenceReportSummary[] | null {
  if (!Array.isArray(body)) return null;
  return body.map(parseReportItem).filter((i): i is IntelligenceReportSummary => i !== null);
}

// ── Growth Scan trigger + poll (write + status, not a cached read) ──────
//
// Deliberately NOT built on readAscendResource: that helper is GET-only,
// caches responses, and (via fetchWithRetry) automatically retries on
// failure — all correct for an idempotent read, all wrong for a scan
// trigger (retrying a failed POST could start a second scan) and
// unnecessary for a status poll (the caller re-polls on its own cadence
// already). Single-attempt fetch, no cache, same 8s TIMEOUT_MS as reads
// — the trigger route itself responds fast (fast validation only, the
// actual scan runs on Ascend's own background continuation), so this
// never needs a long timeout even though a scan takes 30-90+ seconds.

export type GrowthScanTriggerOutcome = { ok: true; jobId: number } | { ok: false; code: string; message: string };

export interface GrowthScanJobResult {
  id: number;
  overallScore: number;
  scoreLabel: string;
  biggestBottleneck: string;
  recommendedFunnelType: string;
  shareToken: string;
  createdAt: string;
}

export type GrowthScanJobStatusOutcome =
  | { ok: true; status: "processing" }
  | { ok: true; status: "completed"; scan: GrowthScanJobResult }
  | { ok: true; status: "failed"; errorMessage: string | null }
  | { ok: false; code: string; message: string };

async function serviceFetch(params: {
  resource: string;
  method: "POST" | "GET";
  path: string;
  businessProfileId: string;
  fetchImpl: FetchImpl;
  body?: unknown;
}): Promise<{ ok: true; data: unknown } | { ok: false; code: string; message: string }> {
  if (!ascendIntelligenceConfigured()) {
    recordIntelligenceAuditEvent({ kind: "not_configured", resource: params.resource });
    return { ok: false, code: "not_configured", message: "Ascend Intelligence bridge is not configured on this deployment." };
  }
  const base = ascendIntelligenceBaseUrl()!;
  const secret = ascendIntelligenceSharedSecret()!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  recordIntelligenceAuditEvent({ kind: "bridge_request_sent", resource: params.resource });
  try {
    const res = await params.fetchImpl(`${base}${params.path}`, {
      method: params.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Intelligence-Business-Profile-Id": params.businessProfileId,
        Accept: "application/json",
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // fall through — isBridgeEnvelope(null) is false, handled below
    }

    if (!isBridgeEnvelope(body)) {
      recordIntelligenceAuditEvent({ kind: "fetch_failure", resource: params.resource, reasonCode: "malformed_response", durationMs });
      return { ok: false, code: "malformed_response", message: "Unexpected response from the intelligence bridge." };
    }
    if (!body.ok) {
      const code = body.error?.code ?? "internal_error";
      recordIntelligenceAuditEvent({ kind: "bridge_envelope_error", resource: params.resource, errorCode: code, durationMs });
      return { ok: false, code, message: body.error?.message ?? "Request failed." };
    }
    recordIntelligenceAuditEvent({ kind: "bridge_envelope_ok", resource: params.resource, durationMs });
    return { ok: true, data: body.data };
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === "AbortError";
    recordIntelligenceAuditEvent(
      timedOut
        ? { kind: "fetch_timeout", resource: params.resource, durationMs }
        : { kind: "fetch_failure", resource: params.resource, reasonCode: "network_error", durationMs },
    );
    return {
      ok: false,
      code: timedOut ? "timeout" : "network_error",
      message: timedOut ? "Request to the intelligence bridge timed out." : "Could not reach the intelligence bridge.",
    };
  }
}

// ── Public client ─────────────────────────────────────────────────────────

export interface AscendIntelligenceClientOptions {
  fetchImpl?: FetchImpl;
}

export function createAscendIntelligenceClient(options: AscendIntelligenceClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async getDashboardSummary(businessProfileId: string): Promise<WithMeta<DashboardSummary>> {
      return readAscendResource({
        resource: "dashboard-summary",
        cacheKey: `dashboard-summary:${businessProfileId}`,
        path: `/internal/intelligence/business-profiles/${encodeURIComponent(businessProfileId)}/dashboard-summary`,
        businessProfileId,
        fetchImpl,
        parse: parseDashboardSummary,
      });
    },

    async getCroAudits(businessProfileId: string): Promise<WithMeta<CroAudit[]>> {
      return readAscendResource({
        resource: "cro-audits",
        cacheKey: `cro-audits:${businessProfileId}`,
        path: `/internal/intelligence/cro-audits`,
        businessProfileId,
        fetchImpl,
        parse: parseCroAudits,
      });
    },

    async getMemory(businessProfileId: string): Promise<WithMeta<MemoryActionItem[]>> {
      return readAscendResource({
        resource: "memory",
        cacheKey: `memory:${businessProfileId}`,
        path: `/internal/intelligence/memory`,
        businessProfileId,
        fetchImpl,
        parse: parseMemory,
      });
    },

    async getGrowthTimeline(businessProfileId: string): Promise<WithMeta<GrowthTimeline>> {
      return readAscendResource({
        resource: "growth-timeline",
        cacheKey: `growth-timeline:${businessProfileId}`,
        path: `/internal/intelligence/growth-timeline/${encodeURIComponent(businessProfileId)}`,
        businessProfileId,
        fetchImpl,
        parse: parseGrowthTimeline,
        treatNotFoundAsEmpty: true,
      });
    },

    async getReports(businessProfileId: string): Promise<WithMeta<IntelligenceReportSummary[]>> {
      return readAscendResource({
        resource: "reports",
        cacheKey: `reports:${businessProfileId}`,
        path: `/internal/intelligence/reports`,
        businessProfileId,
        fetchImpl,
        parse: parseReports,
      });
    },

    async triggerGrowthScan(businessProfileId: string, websiteUrl?: string): Promise<GrowthScanTriggerOutcome> {
      const result = await serviceFetch({
        resource: "growth-scan-trigger",
        method: "POST",
        path: `/internal/intelligence/business-profiles/${encodeURIComponent(businessProfileId)}/growth-scan`,
        businessProfileId,
        fetchImpl,
        body: websiteUrl ? { websiteUrl } : {},
      });
      if (!result.ok) return { ok: false, code: result.code, message: result.message };
      const data = result.data as { jobId?: unknown } | null;
      const jobId = typeof data?.jobId === "number" ? data.jobId : null;
      if (jobId === null) return { ok: false, code: "malformed_response", message: "Bridge did not return a job id." };
      return { ok: true, jobId };
    },

    async getGrowthScanJobStatus(businessProfileId: string, jobId: number): Promise<GrowthScanJobStatusOutcome> {
      const result = await serviceFetch({
        resource: "growth-scan-status",
        method: "GET",
        path: `/internal/intelligence/business-profiles/${encodeURIComponent(businessProfileId)}/growth-scan/jobs/${jobId}`,
        businessProfileId,
        fetchImpl,
      });
      if (!result.ok) return { ok: false, code: result.code, message: result.message };
      const data = result.data as { status?: unknown; errorMessage?: unknown; scan?: unknown } | null;
      const status = data?.status;
      if (status === "processing") return { ok: true, status: "processing" };
      if (status === "failed") return { ok: true, status: "failed", errorMessage: typeof data?.errorMessage === "string" ? data.errorMessage : null };
      if (status === "completed") {
        const scan = parseGrowthScanJobResult(data?.scan);
        if (!scan) return { ok: false, code: "malformed_response", message: "Bridge reported completion without a scan result." };
        return { ok: true, status: "completed", scan };
      }
      return { ok: false, code: "malformed_response", message: "Unexpected job status from the intelligence bridge." };
    },
  };
}

function parseGrowthScanJobResult(raw: unknown): GrowthScanJobResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "number" ||
    typeof o.overallScore !== "number" ||
    typeof o.scoreLabel !== "string" ||
    typeof o.biggestBottleneck !== "string" ||
    typeof o.recommendedFunnelType !== "string" ||
    typeof o.shareToken !== "string" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: o.id,
    overallScore: o.overallScore,
    scoreLabel: o.scoreLabel,
    biggestBottleneck: o.biggestBottleneck,
    recommendedFunnelType: o.recommendedFunnelType,
    shareToken: o.shareToken,
    createdAt: o.createdAt,
  };
}

export type AscendIntelligenceClient = ReturnType<typeof createAscendIntelligenceClient>;
