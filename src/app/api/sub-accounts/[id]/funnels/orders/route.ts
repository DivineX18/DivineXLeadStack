import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type { FunnelOrderDoc } from "@/types/funnel-orders";

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

/** GET — list this sub-account's funnel orders, newest first.
 *  funnelOrders stays Admin-SDK-only at the rules layer; this authed
 *  route is the only read path (mirrors the pattern used for other
 *  server-only-write collections that still need a member-facing list). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection("funnelOrders")
    .where("subAccountId", "==", subAccountId)
    .get();

  const orders = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelOrderDoc, "id">) }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  return NextResponse.json({ orders });
}
