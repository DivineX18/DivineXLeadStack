import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * DIVINEX PROFILE CONTRACT — Flow side (Unification Slice 1).
 *
 * Ascend Postgres is canonical; Flow holds READ-ONLY versioned snapshots at
 * divinexProfiles/{subAccountId}. Two independently-contracted event types
 * arrive on the same signed transport (per the approved amendment):
 *   divinex.profile     — workspace-scoped business/brand/offers/assets
 *   divinex.frameworks  — global intelligence library (replaces the manual
 *                         sync script's writes; the script remains an
 *                         operator fallback until this path is proven)
 *
 * Signature: HMAC-SHA256 over `${timestamp}.${rawBody}` with the existing
 * ASCEND_SSO_SHARED_SECRET; stale timestamps (>5 min) rejected. Profile
 * snapshots enforce VERSION MONOTONICITY — an older or duplicate version is
 * acknowledged (200, so Ascend never retry-storms) but ignored, which makes
 * out-of-order and replayed events harmless. Generation keeps working from
 * the last snapshot if Ascend is down; the reconcile pull recovers missed
 * events on demand.
 */

const SECRET = () => process.env.ASCEND_SSO_SHARED_SECRET ?? "";
const MAX_SKEW_MS = 5 * 60 * 1000;

export function divinexContractConfigured(): boolean {
  return !!SECRET();
}

export function verifyDivinexSignature(rawBody: string, timestamp: string, signature: string): boolean {
  if (!SECRET() || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;
  const expected = createHmac("sha256", SECRET()).update(`${timestamp}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export interface DivinexProfileSnapshot {
  contract: "divinex.profile";
  contractVersion: number;
  profileVersion: number;
  publishedAt: string;
  businessProfileId: number;
  flowSubAccountId: string;
  business: Record<string, unknown>;
  offers: { id: string; name: string; kind: string }[];
  brand: Record<string, unknown>;
  assets: { id: number; fileUrl: string; fileType: string; purpose: string | null }[];
  provenance: Record<string, unknown>;
}

/** Apply an incoming profile contract to the snapshot cache. Returns what
 *  happened (for the receiver's response + logs). */
export async function applyProfileSnapshot(
  payload: DivinexProfileSnapshot,
): Promise<{ result: "applied" | "ignored_stale" | "rejected"; reason?: string }> {
  if (payload.contract !== "divinex.profile" || !payload.flowSubAccountId) {
    return { result: "rejected", reason: "bad_contract" };
  }
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${payload.flowSubAccountId}`).get();
  if (!subSnap.exists) return { result: "rejected", reason: "unknown_sub_account" };

  const ref = db.doc(`divinexProfiles/${payload.flowSubAccountId}`);
  const existing = await ref.get();
  const currentVersion = existing.exists ? ((existing.data()!.profileVersion as number) ?? -1) : -1;
  if (payload.profileVersion <= currentVersion) {
    return { result: "ignored_stale", reason: `have v${currentVersion}, got v${payload.profileVersion}` };
  }
  await ref.set({
    ...payload,
    receivedAt: FieldValue.serverTimestamp(),
  });
  return { result: "applied" };
}

/** Read the snapshot for generation-side consumers (Slice 6). Null when the
 *  workspace has never been published — every consumer must degrade to
 *  current certified behavior. */
export async function getDivinexProfileSnapshot(
  subAccountId: string,
): Promise<DivinexProfileSnapshot | null> {
  const snap = await getAdminDb().doc(`divinexProfiles/${subAccountId}`).get();
  if (!snap.exists) return null;
  return snap.data() as DivinexProfileSnapshot;
}

/** Reconcile: PULL the current contract from Ascend (covers missed events;
 *  prevents silent permanent drift). Uses the deployment's existing Ascend
 *  URL + shared secret. */
export async function reconcileProfileFromAscend(
  businessProfileId: number,
): Promise<{ ok: boolean; result?: string; error?: string }> {
  // The Ascend API server is served at ascend.divinex.io (verified:
  // app.divinex.io hosts the unified /app shell and 307s API paths).
  // ASCEND_API_BASE_URL overrides for staging/local.
  const base = process.env.ASCEND_API_BASE_URL ?? "https://ascend.divinex.io";
  if (!divinexContractConfigured()) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${base}/api/divinex/profile/${businessProfileId}`, {
      headers: { Authorization: `Bearer ${SECRET()}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `ascend_${res.status}` };
    const payload = (await res.json()) as DivinexProfileSnapshot;
    const applied = await applyProfileSnapshot(payload);
    return { ok: applied.result !== "rejected", result: applied.result, error: applied.reason };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
