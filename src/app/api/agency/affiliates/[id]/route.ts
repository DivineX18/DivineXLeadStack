import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import { findAffiliateById, updateAffiliate } from "@/lib/affiliate/account";
import { listReferralsForAffiliate } from "@/lib/affiliate/referrals";
import type { AffiliateStatus } from "@/types/affiliate";

export const dynamic = "force-dynamic";

// GET /api/agency/affiliates/[id] — detail + their referral history.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  const affiliate = await findAffiliateById(id);
  if (!affiliate) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

  const referrals = await listReferralsForAffiliate(id);
  return NextResponse.json({ data: { affiliate, referrals } });
}

// PATCH /api/agency/affiliates/[id] — edit display name, commission rate,
// or payout email. Status changes stay on the dedicated /status route.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  const existing = await findAffiliateById(id);
  if (!existing) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

  let body: { displayName?: string; commissionPct?: number; payoutEmail?: string; status?: AffiliateStatus };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.commissionPct !== undefined && (typeof body.commissionPct !== "number" || body.commissionPct < 0 || body.commissionPct > 100)) {
    return NextResponse.json({ error: "commissionPct must be between 0 and 100" }, { status: 400 });
  }

  await updateAffiliate(id, {
    displayName: body.displayName,
    commissionPct: body.commissionPct,
    payoutEmail: body.payoutEmail,
    status: body.status,
  });

  return NextResponse.json({ ok: true });
}
