import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  recheckCustomDomain,
  removeCustomDomain,
} from "@/lib/server/custom-domains-service";

export const dynamic = "force-dynamic";

/** POST ?action=recheck — re-verify DNS status now, bypassing the poll cadence. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string; domain: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, domain } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const updated = await recheckCustomDomain(decodeURIComponent(domain));
  if (!updated || updated.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ domain: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string; domain: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, domain } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ok = await removeCustomDomain(subAccountId, decodeURIComponent(domain));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
