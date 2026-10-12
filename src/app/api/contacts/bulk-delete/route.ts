import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  deleteContactServerSide,
  type DeleteContactOutcome,
} from "@/lib/server/contacts-service";

/**
 * Delete many contacts in one action.
 *
 *   POST /api/contacts/bulk-delete  { subAccountId, contactIds: [...] }
 *
 * Sub-account ADMIN only, matching single-contact delete — collaborators can
 * edit contacts but not delete them.
 *
 * This does NOT cascade, and that is the point. Each contact goes through the
 * exact same reference guard the single delete uses: a contact still linked to
 * a deal, task, booking, quote, form submission, web-chat conversation or
 * voice call is SKIPPED and reported, never deleted. A bulk path that
 * bypassed the guard would orphan those records at scale, which is precisely
 * the damage the guard exists to prevent — and at a hundred rows a click,
 * nobody would notice until the pipeline was already wrong.
 *
 * So this is "delete everything that is safe to delete, and tell me what was
 * not", rather than "delete everything". The response is per-contact so the UI
 * can say exactly which rows survived and why.
 */

/** One request's ceiling. Each contact costs seven count() aggregations plus a
 *  recursive delete, so an unbounded list would run past the platform's
 *  request timeout and report nothing at all — the client chunks instead, and
 *  a chunk that fails leaves the earlier chunks already done. */
const MAX_PER_REQUEST = 100;

export async function POST(request: Request) {
  let body: { subAccountId?: unknown; contactIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subAccountId = typeof body.subAccountId === "string" ? body.subAccountId.trim() : "";
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId is required." }, { status: 400 });
  }

  // Authorize ONCE against the named workspace. Every id is then checked to
  // actually belong to it inside deleteContactServerSide, so a request mixing
  // in another tenant's ids cannot delete across the boundary.
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ids = Array.isArray(body.contactIds)
    ? [...new Set(body.contactIds.filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one contact." }, { status: 400 });
  }
  if (ids.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `Delete up to ${MAX_PER_REQUEST} contacts at a time.`, max: MAX_PER_REQUEST },
      { status: 400 },
    );
  }

  // Bounded concurrency. Serial would be slow enough to risk the request
  // timeout on a full selection; unbounded would fire 700 aggregation queries
  // at once and get throttled, turning a deletable batch into spurious errors.
  const CONCURRENCY = 5;
  const results: DeleteContactOutcome[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      slice.map(async (contactId) => {
        try {
          return await deleteContactServerSide({ contactId, expectedSubAccountId: subAccountId });
        } catch (err) {
          // One bad row must not abandon the rest of the batch, and must not
          // be reported as deleted when it was not.
          console.error("[contacts/bulk-delete] failed", { subAccountId, contactId, err });
          return { contactId, status: "blocked" as const, blockers: [{ type: "error", label: "unexpected error", count: 1 }] };
        }
      }),
    );
    results.push(...settled);
  }

  const deleted = results.filter((r) => r.status === "deleted").length;
  const blocked = results.filter((r) => r.status === "blocked");
  const notFound = results.filter((r) => r.status === "not_found").length;
  const wrongWorkspace = results.filter((r) => r.status === "wrong_workspace").length;

  return NextResponse.json({
    ok: true,
    requested: ids.length,
    deleted,
    blockedCount: blocked.length,
    notFound,
    // Non-zero here means the client sent ids outside the workspace it
    // authorized against. Surfaced rather than silently folded into
    // "not found", because the two mean very different things.
    wrongWorkspace,
    results,
  });
}
