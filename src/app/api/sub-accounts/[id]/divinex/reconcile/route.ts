import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { reconcileProfileFromAscend, getDivinexProfileSnapshot } from "@/lib/divinex/contract";

/**
 * Operator-invoked reconcile: pull the CURRENT canonical profile from
 * Ascend into this workspace's snapshot (recovers missed publish events —
 * the no-silent-permanent-drift guarantee). The businessProfileId comes
 * from the existing snapshot, or the request body for a first-time pull.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let bodyProfileId: number | null = null;
  try {
    const body = (await request.json()) as { businessProfileId?: number };
    if (Number.isInteger(body.businessProfileId)) bodyProfileId = body.businessProfileId!;
  } catch {
    // empty body is fine — use the stored snapshot's id
  }
  const existing = await getDivinexProfileSnapshot(subAccountId);
  const businessProfileId = bodyProfileId ?? existing?.businessProfileId ?? null;
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "No snapshot yet — pass businessProfileId for the first pull." },
      { status: 400 },
    );
  }
  const result = await reconcileProfileFromAscend(businessProfileId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
