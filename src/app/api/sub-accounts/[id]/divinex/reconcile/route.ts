import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { reconcileProfileFromAscend } from "@/lib/divinex/contract";
import { resolveAuthorizedBusinessProfileId, sameProfileId } from "@/lib/divinex/profile-authorization";

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

  // SAME BOUNDARY AS ONBOARDING. This route took `businessProfileId` from the
  // request body and pulled THAT profile out of Ascend, so workspace
  // membership was again enough to reach any business profile by id. It also
  // fell back to the stored snapshot's id, which can itself be foreign — the
  // live DivineX workspace is mapped to one profile and stores another, so
  // that fallback would have reconciled the wrong business on purpose.
  //
  // The id now comes from Flow's canonical mapping. A body-supplied id is
  // accepted only when it agrees.
  let bodyProfileId: number | null = null;
  try {
    const body = (await request.json()) as { businessProfileId?: number };
    if (Number.isInteger(body.businessProfileId)) bodyProfileId = body.businessProfileId!;
  } catch {
    // empty body is fine — the mapping supplies the id
  }

  const auth = await resolveAuthorizedBusinessProfileId(subAccountId);
  if (!auth.authorized) {
    return NextResponse.json({ error: "not_linked", message: auth.message }, { status: 409 });
  }
  if (bodyProfileId !== null && !sameProfileId(bodyProfileId, auth.businessProfileId)) {
    return NextResponse.json(
      { error: "forbidden_profile", message: "That business profile does not belong to this workspace." },
      { status: 403 },
    );
  }
  const businessProfileId = auth.businessProfileId;
  const result = await reconcileProfileFromAscend(businessProfileId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
