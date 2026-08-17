import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getFunnel } from "@/lib/server/funnels-service";
import { getLatestReviewForFunnel, scoreFunnelDesign } from "@/lib/design-intelligence/scoring";
import { aiIsConfigured } from "@/lib/comms/ai/openrouter";

export const dynamic = "force-dynamic";

/** Latest stored design review for this funnel, if any. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const review = await getLatestReviewForFunnel(funnelId);
  return NextResponse.json({ review });
}

/** Manually (re-)run the 12-criteria design review — the same scorer
 *  create_funnel triggers automatically on generation, exposed here so an
 *  operator can re-score after editing a funnel by hand. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "AI Agents isn't configured on this deployment — set OPENROUTER_API_KEY to enable design reviews." },
      { status: 503 },
    );
  }

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const review = await scoreFunnelDesign(funnel);
    return NextResponse.json({ review });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Design review failed." },
      { status: 502 },
    );
  }
}
