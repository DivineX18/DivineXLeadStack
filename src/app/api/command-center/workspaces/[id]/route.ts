import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getSubAccountDoc, getWorkspaceProvisioningReport } from "@/lib/server/command-center-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const { id } = await ctx.params;
  const sub = await getSubAccountDoc(id);
  if (!sub || sub.agencyId !== caller.agencyId) {
    // Same "don't reveal existence" discipline as the rest of this
    // codebase's tenancy checks — a foreign subAccountId gets the same 404
    // a truly-missing one does.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await getWorkspaceProvisioningReport(id);
  return NextResponse.json({ subAccount: sub, report });
}
