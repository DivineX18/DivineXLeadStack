import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getFunnelPerformance, listFunnelPerformance } from "@/lib/funnels/telemetry";

/**
 * GET — funnel performance for this workspace, or for one funnel via
 * `?funnelId=`.
 *
 * `funnelStats` is server-only at the rules layer (visitors write it through
 * the public beacon; nobody writes it from a client session), so this authed
 * route is the read path — the same shape used for funnelOrders and
 * voiceCampaigns.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const funnelId = new URL(request.url).searchParams.get("funnelId");
  if (funnelId) {
    const perf = await getFunnelPerformance(subAccountId, funnelId);
    // A funnel in another workspace is reported as not found, never as empty
    // data — absence must not confirm existence.
    if (!perf) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ performance: perf });
  }

  return NextResponse.json({ performance: await listFunnelPerformance(subAccountId) });
}
