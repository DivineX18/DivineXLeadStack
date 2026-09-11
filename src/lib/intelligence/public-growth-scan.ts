import "server-only";

/**
 * The public Growth Scan, proxied.
 *
 * The scan endpoint on the Ascend Business Intelligence service is already
 * public and unauthenticated — it exists to capture leads — so this adds no
 * capability that wasn't already reachable. What it adds is a same-origin
 * path for it, which matters for three reasons:
 *
 *   1. A cold visitor stays on app.divinex.io. The approved architecture is
 *      explicit that we do not bounce people to the ascend.divinex.io host.
 *   2. No cross-origin call from the browser, so no CORS negotiation and no
 *      dependency on the BI service's origin policy.
 *   3. The BI base URL stays server-side. It is not a secret, but there is no
 *      reason to publish our internal service topology to every visitor.
 *
 * Deliberately NARROW. It forwards exactly two operations, start and read,
 * and nothing else. It must never grow into a general passthrough to the
 * intelligence service: every authenticated workspace endpoint over there
 * stays unreachable from here.
 */

/** The BI service base. Already includes the `/api` prefix (see render.yaml). */
function baseUrl(): string | null {
  const raw = process.env.ASCEND_INTELLIGENCE_API_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function publicGrowthScanConfigured(): boolean {
  return !!baseUrl();
}

export interface ScanStartInput {
  name: string;
  email: string;
  businessType: string;
  websiteUrl?: string | null;
}

export type ScanStartResult =
  | { ok: true; shareToken: string }
  | { ok: false; status: number; error: string };

/**
 * Start a scan. The endpoint answers 202 with a share token and processes in
 * the background, so this returns the token to poll rather than a report.
 */
export async function startPublicGrowthScan(input: ScanStartInput): Promise<ScanStartResult> {
  const base = baseUrl();
  if (!base) return { ok: false, status: 503, error: "The Growth Scan isn't configured on this deployment yet." };

  let res: Response;
  try {
    res = await fetch(`${base}/zeno/growth-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        businessType: input.businessType,
        ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return { ok: false, status: 504, error: "We couldn't reach the scanner just now. Please try again in a moment." };
  }

  type Accepted = { shareToken?: string; error?: string };
  const text = await res.text();
  let body: Accepted | null;
  try {
    body = JSON.parse(text) as Accepted;
  } catch {
    body = null;
  }

  if (!res.ok || !body?.shareToken) {
    // Never surface the upstream body verbatim: it can carry validation
    // internals, and on a proxy error it can be an HTML page.
    return {
      ok: false,
      status: res.status === 429 ? 429 : 502,
      error:
        res.status === 429
          ? "We're running a lot of scans right now. Please try again in a few minutes."
          : "We couldn't start the scan. Please check the website address and try again.",
    };
  }
  return { ok: true, shareToken: body.shareToken };
}

export type ScanPollResult =
  | { state: "running" }
  | { state: "ready"; report: Record<string, unknown> }
  | { state: "failed"; error: string };

/**
 * Read a scan by its share token.
 *
 * "Ready" is decided by the report actually carrying a score, not by a status
 * string: the row exists from the moment the scan is accepted, so presence is
 * not completion. `overallScore`/`categoryScores` are the fields every
 * existing consumer already reads, and they only appear once the engine has
 * finished.
 */
export async function pollPublicGrowthScan(shareToken: string): Promise<ScanPollResult> {
  const base = baseUrl();
  if (!base) return { state: "failed", error: "The Growth Scan isn't configured on this deployment yet." };

  let res: Response;
  try {
    res = await fetch(`${base}/zeno/growth-scan/${encodeURIComponent(shareToken)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { state: "running" }; // a blip mid-scan is not a failure
  }

  if (res.status === 404) return { state: "failed", error: "That scan link has expired or doesn't exist." };
  if (!res.ok) return { state: "running" };

  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { state: "running" };
  }

  const report = ((body.scan ?? body.result ?? body.payload ?? body) ?? {}) as Record<string, unknown>;
  if (report.scanStatus === "failed") {
    return { state: "failed", error: "The scan couldn't be completed for that website." };
  }
  if (report.overallScore !== undefined || report.categoryScores !== undefined) {
    return { state: "ready", report };
  }
  return { state: "running" };
}

// ─── The shape the results UI reads ──────────────────────────────────────────

export interface GrowthScanReport {
  overallScore: number | null;
  scoreLabel: string | null;
  /** The PERSISTED field name is `biggestBottleneck`; only the in-memory
   *  payload calls it `primaryConstraint`. Both are accepted so this cannot
   *  break if a caller hands over either shape. */
  primaryConstraint: string | null;
  categories: { key: string; label: string; score: number; finding: string | null }[];
  topOpportunities: { title: string; detail: string | null }[];
  recommendedLeadMagnet: string | null;
  websiteUrl: string | null;
}

/** Narrow the real payload defensively. Anything absent renders as absent —
 *  the results view never invents a label the report did not supply. */
export function normalizeReport(raw: Record<string, unknown>): GrowthScanReport {
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const cats = Array.isArray(raw.categoryScores) ? (raw.categoryScores as Record<string, unknown>[]) : [];
  const opps = Array.isArray(raw.topOpportunities) ? (raw.topOpportunities as unknown[]) : [];

  return {
    overallScore: num(raw.overallScore),
    scoreLabel: str(raw.scoreLabel),
    primaryConstraint: str(raw.biggestBottleneck) ?? str(raw.primaryConstraint),
    categories: cats
      .map((c) => ({
        key: str(c.key) ?? "",
        label: str(c.label) ?? str(c.key) ?? "",
        score: num(c.score) ?? 0,
        finding: str(c.finding),
      }))
      .filter((c) => c.label),
    topOpportunities: opps
      .map((o) => {
        if (typeof o === "string") return { title: o, detail: null };
        const r = (o ?? {}) as Record<string, unknown>;
        return {
          title: str(r.title) ?? str(r.issue) ?? str(r.recommendation) ?? "",
          detail: str(r.recommendation) ?? str(r.impact) ?? str(r.detail),
        };
      })
      .filter((o) => o.title),
    recommendedLeadMagnet: str(raw.recommendedLeadMagnet),
    websiteUrl: str(raw.websiteUrl),
  };
}
