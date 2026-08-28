import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  transitionLifecycleState,
  LifecycleTransitionError,
  type LifecycleDomain,
} from "@/lib/lifecycle/engine";

/**
 * Operator/API-driven lifecycle transition — the EVIDENCE entry point for
 * states no system event can prove on its own (webinar attended/missed,
 * lead qualified/lost). The transition engine validates graph legality, so
 * this route can never mint an impossible state; it records WHO supplied
 * the evidence. Auth: active sub-account member.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { domain?: string; entityId?: string; contactId?: string; to?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const domain = body.domain as LifecycleDomain;
  if (!["appointment", "webinar", "lead"].includes(domain)) {
    return NextResponse.json({ error: "domain must be appointment | webinar | lead" }, { status: 400 });
  }
  if (!body.entityId || !body.contactId || !body.to) {
    return NextResponse.json({ error: "entityId, contactId, and to are required" }, { status: 400 });
  }
  try {
    const result = await transitionLifecycleState({
      subAccountId,
      agencyId: access.agencyId ?? "",
      domain,
      entityId: String(body.entityId).slice(0, 100),
      contactId: String(body.contactId).slice(0, 100),
      to: String(body.to).slice(0, 40),
      reason: `operator:${String(body.reason ?? "manual").slice(0, 80)}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LifecycleTransitionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.code === "tenancy" ? 404 : 409 });
    }
    throw err;
  }
}
