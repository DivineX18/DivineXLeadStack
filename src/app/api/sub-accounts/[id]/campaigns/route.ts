import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listCampaigns } from "@/lib/server/campaigns-service";

/**
 * GET — this workspace's campaign plans.
 *
 * `campaigns` is server-only at the rules layer (a step must not be markable
 * approved by writing Firestore directly), so this authed route is the read
 * path, same pattern as funnelOrders and voiceCampaigns.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const campaigns = await listCampaigns(subAccountId);
  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.plan.intent?.objective ?? null,
      approved: c.plan.approved ?? {},
      steps: c.plan.steps ?? [],
    })),
  });
}
