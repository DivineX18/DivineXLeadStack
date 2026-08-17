import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listPrinciples } from "@/lib/design-intelligence/principles";

export const dynamic = "force-dynamic";

/** Command Center → Design Intelligence: the full Knowledge Vault, newest
 *  first. Agency-owner-only, same gate as every other Command Center
 *  surface — this data shapes how Zeno designs every future funnel across
 *  the whole deployment, not just one workspace. */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const principles = await listPrinciples();
  return NextResponse.json({ principles });
}
