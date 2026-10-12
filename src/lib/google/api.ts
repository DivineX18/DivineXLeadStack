import "server-only";

import { refreshAccessToken } from "@/lib/google/oauth";
import { decryptSecret } from "@/lib/crypto/secrets";
import type { GoogleConfig } from "@/types/tenancy";

/**
 * Read-only Google reporting clients: GA4 and Search Console.
 *
 * Only reporting queries are ever issued. That is a promise the privacy policy
 * makes out loud for Ads, where Google offers no read-only scope, so it has to
 * be true of the code rather than merely intended.
 *
 * Access tokens are minted per call-site from the stored refresh token and
 * never persisted — they last an hour, so storing one would mean keeping a
 * second credential that is wrong most of the time.
 */

export class GoogleApiError extends Error {
  constructor(
    readonly service: "ga4" | "searchConsole",
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** Mint a short-lived access token for a workspace's stored connection. */
export async function accessTokenForConfig(config: GoogleConfig): Promise<string> {
  const refresh = decryptSecret(config.refreshTokenEncrypted);
  const tokens = await refreshAccessToken(refresh);
  return tokens.accessToken;
}

async function getJson<T>(
  service: "ga4" | "searchConsole",
  url: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { status?: string; message?: string } | undefined;
    throw new GoogleApiError(
      service,
      err?.status ?? `http_${res.status}`,
      err?.message ?? `${service} request failed (${res.status})`,
    );
  }
  return json as T;
}

/* ─────────────────────────── pickers ─────────────────────────── */

export interface Ga4Property {
  propertyId: string;
  displayName: string;
  account: string;
}

/** GA4 properties the connected account can read, for the settings picker. */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  type Resp = {
    accountSummaries?: {
      displayName?: string;
      propertySummaries?: { property?: string; displayName?: string }[];
    }[];
  };
  const data = await getJson<Resp>(
    "ga4",
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    accessToken,
  );
  const out: Ga4Property[] = [];
  for (const acc of data.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      // "properties/123456" -> "123456"
      const id = (p.property ?? "").split("/")[1];
      if (id) out.push({ propertyId: id, displayName: p.displayName ?? id, account: acc.displayName ?? "" });
    }
  }
  return out;
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

/** Search Console properties the account can read. */
export async function listSearchConsoleSites(accessToken: string): Promise<GscSite[]> {
  type Resp = { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] };
  const data = await getJson<Resp>(
    "searchConsole",
    "https://searchconsole.googleapis.com/webmasters/v3/sites",
    accessToken,
  );
  return (data.siteEntry ?? [])
    .filter((s) => !!s.siteUrl)
    // siteUnverifiedUser can list a site but cannot query it; offering it would
    // produce a connection that looks fine and returns nothing.
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ siteUrl: s.siteUrl as string, permissionLevel: s.permissionLevel ?? "" }));
}

/* ─────────────────────────── reporting ─────────────────────────── */

export interface DailyPoint {
  date: string;
  a: number;
  b: number;
}

export interface Ga4Report {
  propertyId: string;
  sessions: number;
  activeUsers: number;
  newUsers: number;
  conversions: number;
  /** a = sessions, b = activeUsers */
  days: DailyPoint[];
}

/** One runReport call covering the headline numbers and the daily series. */
export async function fetchGa4Report(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4Report> {
  type Row = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };
  type Resp = { rows?: Row[] };
  const data = await getJson<Resp>(
    "ga4",
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    accessToken,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "conversions" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 400,
    },
  );

  const days: DailyPoint[] = [];
  let sessions = 0, activeUsers = 0, newUsers = 0, conversions = 0;
  for (const row of data.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    const n = (i: number) => Number(row.metricValues?.[i]?.value ?? 0) || 0;
    sessions += n(0);
    activeUsers += n(1);
    newUsers += n(2);
    conversions += n(3);
    // GA4 returns YYYYMMDD; normalise so the UI never has to parse two formats.
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    days.push({ date, a: n(0), b: n(1) });
  }
  return { propertyId, sessions, activeUsers, newUsers, conversions, days };
}

export interface GscReport {
  siteUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** a = clicks, b = impressions */
  days: DailyPoint[];
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

export async function fetchSearchConsoleReport(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscReport> {
  type Row = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
  type Resp = { rows?: Row[] };
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const [byDate, byQuery] = await Promise.all([
    getJson<Resp>("searchConsole", base, accessToken, {
      startDate, endDate, dimensions: ["date"], rowLimit: 400,
    }),
    getJson<Resp>("searchConsole", base, accessToken, {
      startDate, endDate, dimensions: ["query"], rowLimit: 10,
    }),
  ]);

  let clicks = 0, impressions = 0, positionWeighted = 0;
  const days: DailyPoint[] = [];
  for (const r of byDate.rows ?? []) {
    const c = r.clicks ?? 0, i = r.impressions ?? 0;
    clicks += c;
    impressions += i;
    // Average position must be weighted by impressions; a flat mean would let
    // a day with three impressions move the number as much as a day with
    // thirty thousand.
    positionWeighted += (r.position ?? 0) * i;
    days.push({ date: r.keys?.[0] ?? "", a: c, b: i });
  }

  return {
    siteUrl,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeighted / impressions : 0,
    days,
    topQueries: (byQuery.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    })),
  };
}
