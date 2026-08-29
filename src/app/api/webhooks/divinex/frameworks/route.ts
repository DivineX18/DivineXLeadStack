import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyDivinexSignature } from "@/lib/divinex/contract";

/**
 * divinex.frameworks receiver — the event-driven replacement for the manual
 * sync script (which remains an operator fallback until this path is proven
 * in production; parity is byte-level with the script's writes). Global
 * intelligence scope — deliberately a SEPARATE contract from profile
 * publishing, sharing only the signed transport.
 */
interface FrameworksPayload {
  contract: "divinex.frameworks";
  frameworks: {
    slug: string;
    name: string;
    description: string;
    category: string;
    content: string;
    active: boolean;
    sortOrder: number;
    ascendId: number;
  }[];
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const ts = request.headers.get("x-divinex-timestamp") ?? "";
  const sig = request.headers.get("x-divinex-signature") ?? "";
  if (!verifyDivinexSignature(rawBody, ts, sig)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let payload: FrameworksPayload;
  try {
    payload = JSON.parse(rawBody) as FrameworksPayload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (payload.contract !== "divinex.frameworks" || !Array.isArray(payload.frameworks)) {
    return NextResponse.json({ error: "bad_contract" }, { status: 422 });
  }
  const db = getAdminDb();
  const col = db.collection("intelligenceFrameworks");
  const seen = new Set<string>();
  for (const f of payload.frameworks) {
    if (!f.slug || typeof f.slug !== "string") continue;
    seen.add(f.slug);
    await col.doc(f.slug.slice(0, 100)).set(
      {
        name: f.name ?? f.slug,
        description: f.description ?? "",
        category: f.category ?? "strategy",
        content: f.content ?? "",
        active: f.active === true,
        sortOrder: f.sortOrder ?? 0,
        ascendId: f.ascendId ?? null,
        syncedAt: new Date(),
        syncSource: "frameworks.published",
      },
      { merge: true },
    );
  }
  // Deactivate frameworks removed on the Ascend side (script parity).
  const existing = await col.get();
  for (const d of existing.docs) {
    if (!seen.has(d.id) && d.data().active) {
      await d.ref.update({ active: false, syncedAt: new Date(), syncSource: "frameworks.published" });
    }
  }
  return NextResponse.json({ result: "applied", count: seen.size });
}
