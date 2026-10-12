import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { syncGoogleMetricsForSubAccount } from "@/lib/google/sync";

/**
 * Sync this workspace's Google data now.
 *
 *   POST /api/sub-accounts/[id]/google/sync
 *
 * Admin only. The same function the daily QStash job runs, so "Sync now" and
 * the nightly run cannot drift — and so an operator who has just picked a
 * property sees data immediately instead of waiting until tomorrow to find
 * out whether the setup worked.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const outcome = await syncGoogleMetricsForSubAccount(id);
  // A skip or failure is a real answer, not a server error — the body carries
  // which it was so the UI can say why.
  return NextResponse.json(outcome, { status: 200 });
}
