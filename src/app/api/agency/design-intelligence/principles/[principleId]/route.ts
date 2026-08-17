import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { setPrincipleActive } from "@/lib/design-intelligence/principles";

export const dynamic = "force-dynamic";

/** Activate/deactivate a vault principle — the Command Center's "this
 *  principle is wrong, stop applying it" control. Never deletes: a
 *  deactivated principle stays as a record of what was tried, matching
 *  the locked spec's "never overwrite previous knowledge — merge
 *  intelligently" instruction. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ principleId: string }> },
): Promise<NextResponse> {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const { principleId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) is required." }, { status: 400 });
  }

  await setPrincipleActive(principleId, body.active);
  return NextResponse.json({ ok: true });
}
