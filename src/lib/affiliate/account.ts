import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { generateUniqueAffiliateCode } from "./codes";
import type { Affiliate, AffiliateStatus } from "@/types/affiliate";

const DEFAULT_COMMISSION_PCT = 25;

function fromDoc(id: string, data: FirebaseFirestore.DocumentData): Affiliate {
  return {
    id,
    email: data.email,
    code: data.code,
    displayName: data.displayName ?? null,
    status: data.status ?? "active",
    commissionPct: data.commissionPct ?? DEFAULT_COMMISSION_PCT,
    payoutEmail: data.payoutEmail ?? null,
    referralCount: data.referralCount ?? 0,
    pendingCommissionCents: data.pendingCommissionCents ?? 0,
    paidCommissionCents: data.paidCommissionCents ?? 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/** Flow's affiliate program is run manually by the agency owner — there's
 *  no self-serve signup. The owner creates an affiliate record by hand
 *  (from a conversation, an application email, whatever) after agreeing
 *  terms out-of-band, then logs each referred sale as it comes in via
 *  logManualReferral(). */
export async function createAffiliate(input: {
  email: string;
  displayName?: string | null;
  commissionPct?: number;
  payoutEmail?: string | null;
}): Promise<Affiliate> {
  const email = input.email.trim().toLowerCase();
  const existing = await findAffiliateByEmail(email);
  if (existing) return existing;

  const db = getAdminDb();
  const code = await generateUniqueAffiliateCode();
  const ref = db.collection("affiliates").doc();
  await ref.set({
    email,
    code,
    displayName: input.displayName?.trim() || null,
    status: "active" satisfies AffiliateStatus,
    commissionPct: input.commissionPct ?? DEFAULT_COMMISSION_PCT,
    payoutEmail: input.payoutEmail?.trim() || null,
    referralCount: 0,
    pendingCommissionCents: 0,
    paidCommissionCents: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return fromDoc(ref.id, snap.data()!);
}

export async function updateAffiliate(
  id: string,
  input: {
    displayName?: string | null;
    commissionPct?: number;
    payoutEmail?: string | null;
    status?: AffiliateStatus;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.displayName !== undefined) patch.displayName = input.displayName?.trim() || null;
  if (input.commissionPct !== undefined) patch.commissionPct = input.commissionPct;
  if (input.payoutEmail !== undefined) patch.payoutEmail = input.payoutEmail?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  await getAdminDb().collection("affiliates").doc(id).update(patch);
}

export async function listAffiliates(): Promise<Affiliate[]> {
  const snap = await getAdminDb().collection("affiliates").orderBy("createdAt", "desc").limit(500).get();
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

export async function findAffiliateByCode(code: string): Promise<Affiliate | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const snap = await getAdminDb().collection("affiliates").where("code", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return fromDoc(doc.id, doc.data());
}

export async function findAffiliateByEmail(email: string): Promise<Affiliate | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const snap = await getAdminDb().collection("affiliates").where("email", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return fromDoc(doc.id, doc.data());
}

export async function findAffiliateById(id: string): Promise<Affiliate | null> {
  const snap = await getAdminDb().collection("affiliates").doc(id).get();
  if (!snap.exists) return null;
  return fromDoc(snap.id, snap.data()!);
}
