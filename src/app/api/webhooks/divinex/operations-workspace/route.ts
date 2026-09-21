import { NextResponse } from "next/server";
import { verifyDivinexSignature } from "@/lib/divinex/contract";
import {
  provisionAscendOperationsWorkspace,
  type AscendProvisionInput,
} from "@/lib/workspace/provision-ascend-operations";

/**
 * divinex.operations-workspace — the signed provisioning call Ascend makes
 * when a growth_system entitlement becomes active.
 *
 * Public path; security is the shared HMAC signature + timestamp window,
 * exactly as the divinex.profile receiver next door. There is deliberately
 * no session here: the caller is Ascend's server, not a human, and the
 * customer being provisioned has no Flow account yet by definition.
 *
 * The response carries the Firebase uid back so Ascend can store it on the
 * mapping. That is what retires the old JIT path: every later SSO crossing
 * arrives with a known uid and takes the returning-user branch.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const ts = request.headers.get("x-divinex-timestamp") ?? "";
  const sig = request.headers.get("x-divinex-signature") ?? "";
  if (!verifyDivinexSignature(rawBody, ts, sig)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: AscendProvisionInput;
  try {
    payload = JSON.parse(rawBody) as AscendProvisionInput;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const result = await provisionAscendOperationsWorkspace({
    clerkUserId: String(payload.clerkUserId ?? ""),
    email: String(payload.email ?? ""),
    emailVerified: payload.emailVerified === true,
    name: payload.name ?? null,
    businessName: payload.businessName ?? null,
    ascendBusinessProfileId:
      typeof payload.ascendBusinessProfileId === "number" ? payload.ascendBusinessProfileId : null,
  });

  if (!result.ok) {
    // 422, not 5xx: the request was understood and refused on its merits, so
    // Ascend should surface the reason rather than retry-storm.
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }

  return NextResponse.json({
    result: result.result,
    subAccountId: result.subAccountId,
    agencyId: result.agencyId,
    firebaseUid: result.firebaseUid,
    role: result.role,
  });
}
