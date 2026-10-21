import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleCan } from "@/lib/google/capabilities";
import { accessTokenForConfig } from "@/lib/google/api";
import {
  CUSTOMER_CLIENT_QUERY,
  CUSTOMER_METADATA_QUERY,
  GOOGLE_ADS_API_VERSION,
  adsSearch,
  listAccessibleCustomers,
  readAccessibleCustomerIds,
  readAdsError,
} from "@/lib/google/ads";
import type { SubAccountDoc } from "@/types";

/**
 * Bind this workspace to one Google Ads account.
 *
 *   POST /api/sub-accounts/[id]/google/ads-customer   { customerId }
 *
 * THE CALLER PROPOSES, GOOGLE DECIDES. A customer id in a request body is a
 * claim, not authorization: ten digits someone typed prove access to nothing,
 * and an id belonging to another advertiser proves less than nothing. So the
 * proposed id is checked against the live accessible hierarchy for THIS
 * workspace's own stored connection, and nothing is written unless Google
 * itself places the account within reach of those credentials.
 *
 * Verification is deliberately end-to-end rather than membership-only. Finding
 * the id in `customer_client` proves it is in the tree; it does not prove we
 * can read it. So the last step queries the target's own `customer` record
 * through the login context that will be used for reporting, and the binding is
 * persisted only if that succeeds. Otherwise the first real report would be the
 * thing that discovers the account is unreadable.
 *
 * Read-only: every call here is a SELECT.
 */

/** Ads customer ids are ten digits. Rejected before any network call, so a
 *  malformed claim never reaches Google or a Firestore write. */
const CUSTOMER_ID = /^\d{10}$/;

interface ClientRow {
  id?: unknown;
  descriptiveName?: unknown;
  currencyCode?: unknown;
  timeZone?: unknown;
  manager?: unknown;
  testAccount?: unknown;
  status?: unknown;
  level?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: { customerId?: unknown };
  try {
    body = (await request.json()) as { customerId?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const proposed = typeof body.customerId === "string" ? body.customerId.replace(/-/g, "").trim() : "";
  if (!CUSTOMER_ID.test(proposed)) {
    return NextResponse.json(
      { error: "customerId must be the ten digits of a Google Ads customer id" },
      { status: 400 },
    );
  }

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  const config = (snap.data() as SubAccountDoc).googleConfig ?? null;

  if (!config?.connected) {
    return NextResponse.json({ error: "Google is not connected for this workspace" }, { status: 400 });
  }
  if (!googleCan(config, "ads")) {
    return NextResponse.json(
      { error: "This workspace has not granted Google Ads access. Reconnect and approve Ads." },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await accessTokenForConfig(config);
  } catch (err) {
    return NextResponse.json(
      { error: "token_refresh_failed", detail: err instanceof Error ? err.message : "unknown" },
      // 409, not 502: the fix is a reconnect, and a 5xx would be replaced by
      // the CDN's own error page before the operator ever saw which it was.
      { status: 409 },
    );
  }

  // Step 1. What can these credentials reach directly?
  const accessible = await listAccessibleCustomers(accessToken);
  if (!accessible.ok) {
    return NextResponse.json(
      { error: "ads_list_failed", googleError: readAdsError(accessible) },
      { status: 502 },
    );
  }
  const { ids: directIds } = readAccessibleCustomerIds(accessible.body);

  // Step 2. Locate the proposed account: directly shared, or beneath one of the
  // reachable managers. The login context differs between those two cases and
  // guessing it wrong produces USER_PERMISSION_DENIED, as the first live run
  // showed, so it is established here rather than assumed at report time.
  let loginCustomerId: string | null = null;
  let hierarchyRow: ClientRow | null = null;
  const searched: string[] = [];

  if (directIds.includes(proposed)) {
    loginCustomerId = null;
  } else {
    for (const manager of directIds) {
      searched.push(manager);
      const clients = await adsSearch(accessToken, manager, CUSTOMER_CLIENT_QUERY, {
        loginCustomerId: manager,
      });
      if (!clients.ok) continue;
      const rows = (clients.body as { results?: { customerClient?: ClientRow }[] } | null)?.results;
      const match = Array.isArray(rows)
        ? rows.map((r) => r.customerClient).find((c) => str(c?.id) === proposed)
        : undefined;
      if (match) {
        loginCustomerId = manager;
        hierarchyRow = match;
        break;
      }
    }
    if (!hierarchyRow) {
      // Not "forbidden" as a guess — Google was asked and did not place this
      // account within reach of this workspace's credentials.
      return NextResponse.json(
        {
          error: "not_authorized_for_this_workspace",
          detail:
            "Google does not list this customer as accessible to this workspace's connection, directly or beneath a reachable manager.",
          managersSearched: searched.length,
        },
        { status: 403 },
      );
    }
  }

  // Step 3. Read the target's OWN record through the login context reporting
  // will use. Membership in the tree is not readability.
  const metadata = await adsSearch(accessToken, proposed, CUSTOMER_METADATA_QUERY, { loginCustomerId });
  if (!metadata.ok) {
    return NextResponse.json(
      {
        error: "target_not_readable",
        detail: "The account is in the hierarchy but could not be read through the login context reporting would use.",
        loginCustomerIdUsed: loginCustomerId,
        googleError: readAdsError(metadata),
      },
      // 422, not 502. Google ANSWERED, with a specific reason such as
      // CUSTOMER_NOT_ENABLED; the request was well formed and the target
      // simply cannot be used. Returning 5xx here cost me the body: an origin
      // 5xx is swallowed by Cloudflare and replaced with a branded error
      // page, so the one thing the operator needs is the one thing they lose.
      { status: 422 },
    );
  }
  const customer = (metadata.body as { results?: { customer?: ClientRow }[] } | null)?.results?.[0]?.customer ?? null;
  if (!customer) {
    return NextResponse.json(
      { error: "target_metadata_empty", detail: "The metadata query returned no rows." },
      { status: 422 },
    );
  }

  // Step 4. Refuse the states that cannot produce a report, with the reason.
  // A manager holds no campaigns of its own, so binding one guarantees an empty
  // dashboard that looks like zero spend rather than a misconfiguration.
  if (customer.manager === true) {
    return NextResponse.json(
      { error: "target_is_a_manager", detail: "A manager account holds no campaigns. Bind one of its client accounts." },
      { status: 400 },
    );
  }
  const status = str(customer.status);
  if (status !== "ENABLED") {
    return NextResponse.json(
      { error: "target_not_enabled", detail: `The account reports status ${status ?? "unknown"}.` },
      { status: 400 },
    );
  }
  const currencyCode = str(customer.currencyCode);
  const timeZone = str(customer.timeZone);
  if (!currencyCode || !timeZone) {
    // Without these, money cannot be labelled and a window cannot be computed
    // in the account's own day. Defaulting either is how a report silently
    // misstates both.
    return NextResponse.json(
      { error: "target_missing_currency_or_timezone", detail: "Google returned no currency or timezone for this account." },
      { status: 502 },
    );
  }

  await getAdminDb().doc(`subAccounts/${id}`).set(
    {
      googleConfig: {
        adsCustomerId: proposed,
        adsLoginCustomerId: loginCustomerId,
        adsCustomerName: str(customer.descriptiveName),
        adsCurrencyCode: currencyCode,
        adsTimeZone: timeZone,
        adsBoundAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({
    bound: true,
    apiVersion: GOOGLE_ADS_API_VERSION,
    customerId: proposed,
    loginCustomerId,
    descriptiveName: str(customer.descriptiveName),
    currencyCode,
    timeZone,
    manager: customer.manager === true,
    testAccount: customer.testAccount === true,
    status,
    /** How the authorization was established, not merely that it was. */
    authorizedVia: loginCustomerId ? "manager_hierarchy" : "direct_access",
    hierarchyLevel: hierarchyRow ? str(hierarchyRow.level) : "0",
    verificationRequestIds: {
      listAccessibleCustomers: accessible.requestId,
      targetMetadata: metadata.requestId,
    },
  });
}
