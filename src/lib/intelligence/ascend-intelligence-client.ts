import "server-only";

import { ascendIntelligenceBaseUrl, ascendIntelligenceConfigured, ascendIntelligenceSharedSecret } from "@/lib/intelligence/ascend-intelligence-config";
import { readIntelligenceCache, writeIntelligenceCache } from "@/lib/intelligence/intelligence-cache";
import { recordIntelligenceAuditEvent } from "@/lib/intelligence/intelligence-audit";
import { MAX_RETRIES, TIMEOUT_MS, backoffMs, normalizeFailure, shouldRetry } from "@/lib/intelligence/ascend-intelligence-retry";
import type {
  BusinessMemorySummary,
  CroAuditSummary,
  GrowthAssessment,
  GrowthTimelineEntry,
  IntelligenceReportSummary,
  WithMeta,
} from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 (hardened in Slice 10) — THE single
 * server-side client responsible for every Ascend Intelligence read. No
 * other file in this codebase should call `fetch()` against an Ascend
 * host directly — structurally enforced by
 * `scripts/verify-intelligence-slice9-structure.mts`.
 *
 * Slice 10 formalized the request/response contract in
 * `docs/architecture/INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md` — this
 * client implements the CALLER half of it (the `X-Intelligence-Business-
 * Profile-Id` header, envelope-aware parsing). The Ascend RECEIVER side
 * does not exist yet (blocked on an unresolved main/dev branch divergence
 * in the Ascend Intelligence repo — see the contract doc), so this client
 * cannot be verified against a real envelope response today. It therefore
 * handles TWO response shapes deliberately: the formal
 * `{ok, data, error}` envelope (once Ascend implements it) and a bare/
 * legacy shape (today's genuinely-unknown-until-verified state, unchanged
 * from Slice 9) — never assuming which one a real deployment will send.
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
        // Required per the service bridge contract (Slice 10) — the
        // secret proves this request came from Flow's backend; this
        // header states WHICH business profile's data is being asked
        // for. A valid secret is necessary, never sufficient, mirroring
        // the "representedUid required, never optional" discipline
        // already established for every other service-to-service caller
        // in this codebase (Slices 5-9).
        "X-Intelligence-Business-Profile-Id": businessProfileId,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, timedOut: false, body: null };
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

// ── Response envelope (Slice 10 contract) ───────────────────────────────

/** The formal shape from INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md. Not yet
 *  observed live — see the file header. */
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
 */
async function readAscendResource<T>(params: {
  resource: string;
  cacheKey: string;
  path: string;
  businessProfileId: string;
  fetchImpl: FetchImpl;
  parse: (body: unknown) => T | null;
}): Promise<WithMeta<T>> {
  const { resource, cacheKey, path, businessProfileId, fetchImpl, parse } = params;

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

  if (result.ok) {
    // Envelope-aware first (Slice 10 contract) — if the body matches the
    // formal {ok, data, error} shape, its `ok` field is authoritative,
    // even though the HTTP status was already 2xx (the contract doc's own
    // reasoning: a misconfigured proxy could rewrite a status code but not
    // the body). Falls back to the Slice 9 bare/legacy parse for anything
    // that doesn't match — the real shape has never been observed live.
    if (isBridgeEnvelope(result.body)) {
      if (!result.body.ok) {
        const code = result.body.error?.code && ENVELOPE_ERROR_CODES.has(result.body.error.code) ? result.body.error.code : "internal_error";
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
// Field names match the real schema/route findings documented in
// src/types/intelligence.ts's header comment. Response envelope shape
// (bare object vs. {data: ...}) has not been observed live (no working
// connection exists yet — see the auth-gap note) — parsers accept either,
// since that's the one thing that's genuinely unknown rather than unverified.

function unwrap(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object") return obj.data as Record<string, unknown>;
  return obj;
}

function parseCategoryScores(raw: unknown): { category: string; score: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      category: typeof c.category === "string" ? c.category : "",
      score: typeof c.score === "number" ? c.score : 0,
    }))
    .filter((c) => c.category);
}

function parseGrowthAssessment(body: unknown): GrowthAssessment | null {
  const obj = unwrap(body);
  if (!obj || typeof obj.id !== "string") return null;
  const scoreObj = obj.growthScore as Record<string, unknown> | undefined;
  return {
    id: obj.id,
    businessProfileId: typeof obj.businessProfileId === "string" ? obj.businessProfileId : "",
    status: (["pending", "in_progress", "complete", "failed"] as const).includes(obj.status as never)
      ? (obj.status as GrowthAssessment["status"])
      : "pending",
    growthScore:
      scoreObj && typeof scoreObj.overallScore === "number"
        ? {
            overallScore: scoreObj.overallScore,
            primaryConstraint: typeof scoreObj.primaryConstraint === "string" ? scoreObj.primaryConstraint : null,
            categoryScores: parseCategoryScores(scoreObj.categoryScores),
            scannedAt: typeof scoreObj.scannedAt === "string" ? scoreObj.scannedAt : new Date().toISOString(),
          }
        : null,
    recommendedFunnel: typeof obj.recommendedFunnel === "string" ? obj.recommendedFunnel : null,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
  };
}

function parseCroAudit(body: unknown): CroAuditSummary | null {
  const obj = unwrap(body);
  if (!obj || typeof obj.id !== "string") return null;
  const recs = Array.isArray(obj.recommendations) ? obj.recommendations : [];
  return {
    id: obj.id,
    businessProfileId: typeof obj.businessProfileId === "string" ? obj.businessProfileId : "",
    overallScore: typeof obj.overallScore === "number" ? obj.overallScore : null,
    quickWinCount: typeof obj.quickWinCount === "number" ? obj.quickWinCount : 0,
    recommendations: recs
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        id: typeof r.id === "string" ? r.id : "",
        title: typeof r.title === "string" ? r.title : "",
        impact: (["high", "medium", "low"] as const).includes(r.impact as never) ? (r.impact as "high" | "medium" | "low") : "medium",
        difficulty: (["high", "medium", "low"] as const).includes(r.difficulty as never) ? (r.difficulty as "high" | "medium" | "low") : "medium",
        category: typeof r.category === "string" ? r.category : "general",
        sourceAuditId: obj.id as string,
      }))
      .filter((r) => r.id),
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
  };
}

function parseMemorySummary(body: unknown): BusinessMemorySummary | null {
  const obj = unwrap(body);
  if (!obj) return null;
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.recentItems) ? obj.recentItems : [];
  return {
    totalCount: typeof obj.totalCount === "number" ? obj.totalCount : items.length,
    approvedCount: typeof obj.approvedCount === "number" ? obj.approvedCount : 0,
    recentItems: items
      .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i: Record<string, unknown>) => ({
        id: typeof i.id === "string" ? i.id : "",
        memoryType: typeof i.memoryType === "string" ? i.memoryType : "unknown",
        summary: typeof i.summary === "string" ? i.summary : "",
        confidenceScore: typeof i.confidenceScore === "number" ? i.confidenceScore : null,
        status: (["pending", "approved", "rejected", "needs_revision"] as const).includes(i.status as never)
          ? (i.status as "pending" | "approved" | "rejected" | "needs_revision")
          : "pending",
        createdAt: typeof i.createdAt === "string" ? i.createdAt : new Date().toISOString(),
      }))
      .filter((i) => i.id),
  };
}

function parseTimeline(body: unknown): GrowthTimelineEntry[] | null {
  const obj = unwrap(body);
  if (!obj) return null;
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj) ? obj : null;
  if (!items) return null;
  return items
    .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i: Record<string, unknown>) => ({
      id: typeof i.id === "string" ? i.id : "",
      kind: typeof i.kind === "string" ? i.kind : "unknown",
      title: typeof i.title === "string" ? i.title : "",
      occurredAt: typeof i.occurredAt === "string" ? i.occurredAt : new Date().toISOString(),
      businessProfileId: typeof i.businessProfileId === "string" ? i.businessProfileId : "",
    }))
    .filter((i) => i.id);
}

function parseReports(body: unknown): IntelligenceReportSummary[] | null {
  const obj = unwrap(body);
  if (!obj) return null;
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj) ? obj : null;
  if (!items) return null;
  return items
    .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i: Record<string, unknown>) => ({
      id: typeof i.id === "string" ? i.id : "",
      kind: (["growth_scan", "cro_audit", "blueprint"] as const).includes(i.kind as never)
        ? (i.kind as "growth_scan" | "cro_audit" | "blueprint")
        : "growth_scan",
      title: typeof i.title === "string" ? i.title : "",
      score: typeof i.score === "number" ? i.score : null,
      createdAt: typeof i.createdAt === "string" ? i.createdAt : new Date().toISOString(),
      shareUrl: typeof i.shareUrl === "string" ? i.shareUrl : null,
    }))
    .filter((i) => i.id);
}

// ── Public client ─────────────────────────────────────────────────────────

export interface AscendIntelligenceClientOptions {
  fetchImpl?: FetchImpl;
}

export function createAscendIntelligenceClient(options: AscendIntelligenceClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async getLatestGrowthAssessment(businessProfileId: string): Promise<WithMeta<GrowthAssessment>> {
      return readAscendResource({
        resource: "growth-assessment",
        cacheKey: `growth-assessment:${businessProfileId}`,
        path: `/zeno/business-profiles/${encodeURIComponent(businessProfileId)}/dashboard-summary`,
        businessProfileId,
        fetchImpl,
        parse: parseGrowthAssessment,
      });
    },

    async getLatestCroAudit(businessProfileId: string): Promise<WithMeta<CroAuditSummary>> {
      return readAscendResource({
        resource: "cro-audit",
        cacheKey: `cro-audit:${businessProfileId}`,
        path: `/zeno/cro-audits?businessProfileId=${encodeURIComponent(businessProfileId)}&limit=1`,
        businessProfileId,
        fetchImpl,
        parse: parseCroAudit,
      });
    },

    async getBusinessMemorySummary(businessProfileId: string): Promise<WithMeta<BusinessMemorySummary>> {
      return readAscendResource({
        resource: "business-memory",
        cacheKey: `business-memory:${businessProfileId}`,
        path: `/zeno/memory?businessProfileId=${encodeURIComponent(businessProfileId)}`,
        businessProfileId,
        fetchImpl,
        parse: parseMemorySummary,
      });
    },

    async getGrowthTimeline(businessProfileId: string): Promise<WithMeta<GrowthTimelineEntry[]>> {
      return readAscendResource({
        resource: "growth-timeline",
        cacheKey: `growth-timeline:${businessProfileId}`,
        path: `/zeno/growth-timeline/${encodeURIComponent(businessProfileId)}`,
        businessProfileId,
        fetchImpl,
        parse: parseTimeline,
      });
    },

    async getReports(businessProfileId: string): Promise<WithMeta<IntelligenceReportSummary[]>> {
      return readAscendResource({
        resource: "reports",
        cacheKey: `reports:${businessProfileId}`,
        path: `/zeno/reports?businessProfileId=${encodeURIComponent(businessProfileId)}`,
        businessProfileId,
        fetchImpl,
        parse: parseReports,
      });
    },
  };
}

export type AscendIntelligenceClient = ReturnType<typeof createAscendIntelligenceClient>;
