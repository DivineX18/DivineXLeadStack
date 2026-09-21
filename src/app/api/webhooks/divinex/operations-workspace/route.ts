import { NextResponse } from "next/server";
import { verifyDivinexSignature } from "@/lib/divinex/contract";
import {
  provisionAscendOperationsWorkspace,
  revokeAscendOperationsWorkspace,
  type AscendProvisionInput,
} from "@/lib/workspace/provision-ascend-operations";

/**
 * divinex.operations-workspace — the signed lifecycle channel for a
 * growth_system customer's Flow workspace.
 *
 * Public path; security is the shared HMAC signature + timestamp window,
 * exactly as the divinex.profile receiver next door. There is deliberately
 * no session here: the caller is Ascend's server, not a human, and on the
 * provision path the customer has no Flow account yet by definition.
 *
 * Two actions over ONE channel rather than a second integration:
 *   - provision (default) — create or safely resolve the workspace, and
 *     return the Firebase uid so Ascend can store it on the mapping. That
 *     is what puts every later SSO crossing on the returning-user branch.
 *   - revoke — withdraw the Ascend grant when the entitlement actually
 *     ends. Status only; the workspace and its data survive so a
 *     resubscribing customer returns to what they had.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const ts = request.headers.get("x-divinex-timestamp") ?? "";
  const sig = request.headers.get("x-divinex-signature") ?? "";
  if (!verifyDivinexSignature(rawBody, ts, sig)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: AscendProvisionInput & { action?: string };
  try {
    payload = JSON.parse(rawBody) as AscendProvisionInput & { action?: string };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // ── revoke ───────────────────────────────────────────────────────────────
  if (payload.action === "revoke") {
    const revoked = await revokeAscendOperationsWorkspace({
      clerkUserId: String(payload.clerkUserId ?? ""),
    });
    if (!revoked.ok) {
      return NextResponse.json({ error: revoked.reason }, { status: 422 });
    }
    return NextResponse.json({ result: revoked.result, subAccountId: revoked.subAccountId ?? null });
  }

  // ── provision (default) ──────────────────────────────────────────────────
  // The timestamp comes from the header the signature already covers, so it
  // cannot be tampered with independently of the body. It orders this call
  // against any prior revocation.
  const signedAtMs = Number(ts);
  const result = await provisionAscendOperationsWorkspace({
    clerkUserId: String(payload.clerkUserId ?? ""),
    email: String(payload.email ?? ""),
    emailVerified: payload.emailVerified === true,
    name: payload.name ?? null,
    businessName: payload.businessName ?? null,
    ascendBusinessProfileId:
      typeof payload.ascendBusinessProfileId === "number" ? payload.ascendBusinessProfileId : null,
    requestSignedAtMs: Number.isFinite(signedAtMs) ? signedAtMs : 0,
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
