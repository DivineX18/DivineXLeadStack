import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import { createAffiliate, listAffiliates } from "@/lib/affiliate/account";

export const dynamic = "force-dynamic";

// GET /api/agency/affiliates — list all affiliates.
export async function GET(request: Request) {
  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  const affiliates = await listAffiliates();
  return NextResponse.json({ data: affiliates });
}

// POST /api/agency/affiliates — create a new affiliate (manual enrollment;
// the owner has already agreed terms with this person out-of-band).
export async function POST(request: Request) {
  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  let body: { email?: string; displayName?: string; commissionPct?: number; payoutEmail?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (body.commissionPct !== undefined && (typeof body.commissionPct !== "number" || body.commissionPct < 0 || body.commissionPct > 100)) {
    return NextResponse.json({ error: "commissionPct must be between 0 and 100" }, { status: 400 });
  }

  const affiliate = await createAffiliate({
    email,
    displayName: body.displayName ?? null,
    commissionPct: body.commissionPct,
    payoutEmail: body.payoutEmail ?? null,
  });

  return NextResponse.json({ data: affiliate }, { status: 201 });
}
