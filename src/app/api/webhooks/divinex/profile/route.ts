import { NextResponse } from "next/server";
import {
  verifyDivinexSignature,
  applyProfileSnapshot,
  type DivinexProfileSnapshot,
} from "@/lib/divinex/contract";

/**
 * divinex.profile receiver — signed push from Ascend (Unification Slice 1).
 * Public path; security is the HMAC signature + timestamp window. Stale/
 * duplicate versions return 200 with result "ignored_stale" so the sender
 * never retry-storms; only signature failures 401.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const ts = request.headers.get("x-divinex-timestamp") ?? "";
  const sig = request.headers.get("x-divinex-signature") ?? "";
  if (!verifyDivinexSignature(rawBody, ts, sig)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let payload: DivinexProfileSnapshot;
  try {
    payload = JSON.parse(rawBody) as DivinexProfileSnapshot;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const applied = await applyProfileSnapshot(payload);
  if (applied.result === "rejected") {
    return NextResponse.json({ error: applied.reason }, { status: 422 });
  }
  return NextResponse.json({ result: applied.result, reason: applied.reason ?? null });
}
