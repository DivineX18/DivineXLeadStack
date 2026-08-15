import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import { logManualReferral } from "@/lib/affiliate/referrals";

export const dynamic = "force-dynamic";

// POST /api/agency/affiliates/[id]/referrals — manually log a sale this
// affiliate referred. No automated checkout hook on Flow — the owner
// becomes aware of the referred sale out-of-band and records it here.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  let body: { buyerEmail?: string; amountPaidCents?: number; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buyerEmail = body.buyerEmail?.trim();
  if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return NextResponse.json({ error: "A valid buyer email is required" }, { status: 400 });
  }
  if (typeof body.amountPaidCents !== "number" || body.amountPaidCents <= 0) {
    return NextResponse.json({ error: "amountPaidCents must be a positive number" }, { status: 400 });
  }

  const result = await logManualReferral({
    affiliateId: id,
    buyerEmail,
    amountPaidCents: Math.round(body.amountPaidCents),
    note: body.note,
  });

  if (!result.ok) {
    const status = result.reason === "affiliate_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, referralId: result.referralId, commissionCents: result.commissionCents }, { status: 201 });
}
