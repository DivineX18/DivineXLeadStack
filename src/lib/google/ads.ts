import "server-only";

/**
 * Google Ads API transport. READ ONLY, by construction: this module exposes no
 * function that can mutate, and the two HTTP verbs it uses are a GET and the
 * documented POST that `googleAds:search` requires for its query body.
 *
 * WHY THERE IS NO PARSER HERE YET. The shape of a Google Ads response is the
 * one thing in this integration that cannot be derived from documentation with
 * confidence, and getting it wrong in a way that passes its own tests is a
 * mistake this codebase has already made once: a website-facts reader looked
 * up a key that never existed, its fixture asserted the same key, and both
 * were wrong in the same direction, so every test passed and only a real run
 * exposed it. So the first version of this returns what Google actually sent,
 * unparsed, and the typed readers land once that has been read.
 *
 * NO DEVELOPER TOKEN. Google sunset developer tokens on 9 September 2026 and
 * moved API access onto the Cloud project that owns the OAuth credentials; the
 * header is "optional and ignored by the API servers". Sending one anyway
 * would imply a credential requirement that no longer exists.
 */

/**
 * Pinned in ONE place so a version move is one line. v26 released 14 October
 * 2026 with a projected sunset of November 2027, the longest runway available,
 * and it is the version Google's current docs use in their own examples, so
 * the field names verified against those docs belong to the version actually
 * being called. Releases moved to twice-monthly from v26, which is itself a
 * reason not to scatter the version through call sites.
 */
export const GOOGLE_ADS_API_VERSION = "v26";

const ADS_HOST = "https://googleads.googleapis.com";

/** Google's own correlation id, for quoting back in a support thread. */
function requestIdOf(res: Response): string | null {
  return res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? null;
}

export interface AdsCall {
  ok: boolean;
  httpStatus: number;
  requestId: string | null;
  apiVersion: string;
  /** Exactly what Google sent, parsed as JSON and otherwise untouched. */
  body: unknown;
}

/**
 * One request. `loginCustomerId` is attached ONLY when a caller passes it,
 * because the two cases genuinely differ and conflating them is the documented
 * trap: reaching a client account THROUGH a manager requires the header and
 * names the hierarchy the request is authorized under, while
 * `customers:listAccessibleCustomers` "ignores any supplied
 * login-customer-id" and derives its answer from the OAuth credentials alone.
 */
async function adsCall(
  path: string,
  accessToken: string,
  opts: { body?: unknown; loginCustomerId?: string | null } = {},
): Promise<AdsCall> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (opts.loginCustomerId) headers["login-customer-id"] = opts.loginCustomerId;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${ADS_HOST}/${GOOGLE_ADS_API_VERSION}/${path}`, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  // Errors come back as JSON too, and their structure is as unknown to us as
  // the success shape, so it is captured rather than flattened into a string.
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJsonBody: text.slice(0, 2000) };
  }
  return {
    ok: res.ok,
    httpStatus: res.status,
    requestId: requestIdOf(res),
    apiVersion: GOOGLE_ADS_API_VERSION,
    body,
  };
}

/**
 * Every customer the authorizing user can act on DIRECTLY. Not the whole
 * hierarchy: per Google's listing-accounts guide it covers only accounts the
 * user was explicitly added to, and it cannot distinguish a manager from a
 * client on its own.
 */
export function listAccessibleCustomers(accessToken: string): Promise<AdsCall> {
  return adsCall("customers:listAccessibleCustomers", accessToken);
}

/**
 * Run one GAQL query against one customer.
 *
 * `query` is never caller-supplied. Every query in this codebase is a
 * server-side constant, so there is no GAQL injection surface, and a public
 * route cannot be talked into selecting a resource nobody reviewed.
 */
export function adsSearch(
  accessToken: string,
  customerId: string,
  query: string,
  opts: { loginCustomerId?: string | null } = {},
): Promise<AdsCall> {
  // NO pageSize. The first real call sent one, from documentation habit, and
  // v26 refused it outright:
  //
  //   {"requestError":"PAGE_SIZE_NOT_SUPPORTED"}
  //   "Setting the page size is not supported. Search Responses will have
  //    fixed page size of '10000' rows."
  //
  // Worth stating plainly because it is the whole argument for calling before
  // fixturing: a fixture written alongside that request would have agreed with
  // it, and the tests would have passed while every query failed. Paging, when
  // it is ever needed, is `pageToken`, not a size.
  return adsCall(`customers/${encodeURIComponent(customerId)}/googleAds:search`, accessToken, {
    body: { query },
    loginCustomerId: opts.loginCustomerId ?? null,
  });
}

/* ─────────────────── the queries, as reviewed constants ─────────────────── */

/**
 * One accessible customer's own metadata. Currency and timezone are read from
 * here and never assumed: a USD default silently misreports every non-USD
 * account, and a UTC window misreports every account that is not on UTC.
 */
export const CUSTOMER_METADATA_QUERY = `
  SELECT customer.id,
         customer.descriptive_name,
         customer.currency_code,
         customer.time_zone,
         customer.manager,
         customer.test_account,
         customer.status
  FROM customer
`.trim();

/**
 * The accounts beneath a manager. This is the documented way to tell a manager
 * from a client and to find the real reporting target, which
 * listAccessibleCustomers cannot do.
 */
export const CUSTOMER_CLIENT_QUERY = `
  SELECT customer_client.client_customer,
         customer_client.id,
         customer_client.descriptive_name,
         customer_client.currency_code,
         customer_client.time_zone,
         customer_client.manager,
         customer_client.test_account,
         customer_client.level,
         customer_client.status
  FROM customer_client
`.trim();

/** "customers/1234567890" -> "1234567890". Returns null for anything else, so
 *  an unexpected resource-name format is reported rather than half-parsed. */
export function customerIdFromResourceName(resourceName: unknown): string | null {
  if (typeof resourceName !== "string") return null;
  const m = /^customers\/(\d{1,20})$/.exec(resourceName.trim());
  return m ? m[1] : null;
}

/* ───────────── readers, written against observed responses ───────────── */

/**
 * The accessible-customer list. Confirmed shape, from the first real call:
 *
 *   {"resourceNames":["customers/3606916397", ...]}
 *
 * Anything that does not match the resource-name format is returned in
 * `unparsed` rather than dropped. A silently skipped entry would read as "that
 * account does not exist", which is the wrong answer to give an operator
 * hunting for an account they can see in the Ads UI.
 */
export function readAccessibleCustomerIds(body: unknown): {
  ids: string[];
  unparsed: unknown[];
} {
  const raw = (body as { resourceNames?: unknown } | null)?.resourceNames;
  if (!Array.isArray(raw)) return { ids: [], unparsed: raw === undefined ? [] : [raw] };
  const ids: string[] = [];
  const unparsed: unknown[] = [];
  for (const entry of raw) {
    const id = customerIdFromResourceName(entry);
    if (id) ids.push(id);
    else unparsed.push(entry);
  }
  return { ids, unparsed };
}

export interface AdsErrorDetail {
  /** e.g. "authorizationError", "requestError" — the key Google nests the code under. */
  category: string;
  /** e.g. "CUSTOMER_NOT_ENABLED", "PAGE_SIZE_NOT_SUPPORTED". */
  code: string;
  message: string;
}

export interface AdsErrorSummary {
  httpStatus: number;
  /** Google's top-level status, e.g. "PERMISSION_DENIED", "INVALID_ARGUMENT". */
  status: string | null;
  requestId: string | null;
  details: AdsErrorDetail[];
}

/**
 * Flatten a failure into something an operator and a log can both read.
 *
 * Observed envelope, from real 400 and 403 responses:
 *
 *   error.code / error.message / error.status
 *   error.details[] -> "@type": ".../v26.errors.GoogleAdsFailure"
 *                      errors[] -> errorCode: { <category>: "CODE" }, message
 *                      requestId
 *
 * The specific code is the part that matters and the part a generic HTTP error
 * throws away: CUSTOMER_NOT_ENABLED means the account is deactivated and no
 * retry will help, USER_PERMISSION_DENIED means it is not reachable under this
 * login context, and PAGE_SIZE_NOT_SUPPORTED means we sent a bad request. One
 * "403 Forbidden" for the first two would hide the difference that decides
 * what to do next.
 */
export function readAdsError(call: AdsCall): AdsErrorSummary | null {
  if (call.ok) return null;
  const err = (call.body as { error?: Record<string, unknown> } | null)?.error ?? null;
  const details: AdsErrorDetail[] = [];
  const rawDetails = Array.isArray(err?.details) ? (err!.details as unknown[]) : [];
  for (const det of rawDetails) {
    const errors = (det as { errors?: unknown })?.errors;
    if (!Array.isArray(errors)) continue;
    for (const e of errors) {
      const codeObj = (e as { errorCode?: Record<string, unknown> })?.errorCode;
      const message = typeof (e as { message?: unknown })?.message === "string"
        ? ((e as { message: string }).message)
        : "";
      if (codeObj && typeof codeObj === "object") {
        for (const [category, code] of Object.entries(codeObj)) {
          details.push({ category, code: String(code), message });
        }
      } else {
        // An error with no code still has to surface. Dropping it would report
        // a failed call as having no reason.
        details.push({ category: "unknown", code: "unknown", message });
      }
    }
  }
  return {
    httpStatus: call.httpStatus,
    status: typeof err?.status === "string" ? err.status : null,
    requestId: call.requestId,
    details,
  };
}

/**
 * True when a failure says this account cannot be reached at all, as opposed
 * to our request being malformed. Kept as an explicit code list rather than
 * inferred from the HTTP status, because 403 covers both "the account is
 * deactivated" and "wrong login context" and the operator action differs.
 */
const UNREACHABLE_CODES = new Set([
  "CUSTOMER_NOT_ENABLED",
  "USER_PERMISSION_DENIED",
  "NOT_ADS_USER",
  "CUSTOMER_NOT_FOUND",
]);

export function isAccountUnreachable(call: AdsCall): boolean {
  const summary = readAdsError(call);
  return !!summary?.details.some((d) => UNREACHABLE_CODES.has(d.code));
}

/* ──────────────── campaign queries + the window they need ──────────────── */

/**
 * Do any campaigns exist at all, and what state are they in?
 *
 * No date filter and no metrics, because the campaign resource does not need
 * one without them, and because "this account has no campaigns" and "this
 * account had no delivery in the window I picked" are different answers that a
 * single metrics query would collapse into the same empty result.
 */
export const CAMPAIGN_EXISTENCE_QUERY = `
  SELECT campaign.id,
         campaign.name,
         campaign.status,
         campaign.advertising_channel_type
  FROM campaign
`.trim();

/**
 * Campaign performance over one explicit, closed date range.
 *
 * `segments.date` is deliberately NOT selected. Selecting it returns one row
 * per campaign per day, and this query wants the window total per campaign.
 *
 * Units differ between these metrics and it matters: `cost_micros` is an int64
 * in millionths of the account currency, arriving as a JSON STRING, while
 * `conversions_value` is already a decimal amount in the account currency and
 * `conversions` can be fractional. Treating them alike would misstate every
 * cost-per-conversion and every return on spend.
 */
export function campaignPerformanceQuery(startDate: string, endDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    // A malformed date would be interpolated into GAQL. Every caller passes a
    // value from ymdInTimeZone/shiftYmd, so this is a guard against a future
    // caller rather than present input, which is exactly when it is worth having.
    throw new Error(`campaignPerformanceQuery: dates must be YYYY-MM-DD, got ${startDate}..${endDate}`);
  }
  return `
  SELECT campaign.id,
         campaign.name,
         campaign.status,
         metrics.impressions,
         metrics.clicks,
         metrics.cost_micros,
         metrics.conversions,
         metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
`.trim();
}

/**
 * Today's calendar date in a given IANA zone, as YYYY-MM-DD.
 *
 * WHY THIS LIVES HERE AND IS NOT A DUPLICATE of Ascend's window primitives.
 * Ascend owns window SAFETY: whether a window is complete, comparable to a
 * baseline, and non-overlapping. That stays there and is not reimplemented.
 * What Flow needs is narrower and unavoidable: a date string to interpolate
 * into a GAQL request, which cannot be computed anywhere else because only the
 * caller of the API knows the request it is about to make. The window Flow
 * used travels with the evidence so Ascend can validate it rather than trust
 * it.
 *
 * en-CA because it formats as YYYY-MM-DD, which is what GAQL wants.
 */
export function ymdInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Shift a YYYY-MM-DD by whole calendar days.
 *
 * Done on the date STRING rather than on a Date in some zone. Shifting a
 * timestamp and reformatting it in the target zone is off by one whenever the
 * shift crosses midnight there, which is the bug that makes a report quietly
 * include an incomplete day.
 */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(
    t.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * The last `days` COMPLETE days in the account's own timezone.
 *
 * Ends yesterday, never today. Today is partial everywhere until midnight in
 * that zone, and including it makes every metric look collapsed for reasons
 * that have nothing to do with the campaigns.
 */
export function completedWindow(
  timeZone: string,
  days: number,
  now: Date = new Date(),
): { startDate: string; endDate: string; days: number; timeZone: string } {
  const endDate = shiftYmd(ymdInTimeZone(timeZone, now), -1);
  return { startDate: shiftYmd(endDate, -(days - 1)), endDate, days, timeZone };
}
