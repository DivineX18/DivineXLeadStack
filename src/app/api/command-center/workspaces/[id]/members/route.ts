import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getSubAccountDoc, listMembersForWorkspace } from "@/lib/server/command-center-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const { id } = await ctx.params;
  const sub = await getSubAccountDoc(id);
  if (!sub || sub.agencyId !== caller.agencyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await listMembersForWorkspace(id);
  return NextResponse.json(result);
}
