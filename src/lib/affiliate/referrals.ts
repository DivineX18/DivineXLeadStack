import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findAffiliateById } from "./account";

export type LogManualReferralResult =
  | { ok: true; referralId: string; commissionCents: number }
  | { ok: false; reason: "affiliate_not_found" | "affiliate_not_active" | "self_referral" };

/** Admin-only, manual: logs one commission-earning sale against an
 *  affiliate. There's no automated checkout hook for Flow — the owner
 *  becomes aware of a referred sale out-of-band and records it here. Same
 *  Referral shape Ascend's automated system writes, so the payout UI and
 *  the (already-real) mark-paid route work identically for both. */
export async function logManualReferral(input: {
  affiliateId: string;
  buyerEmail: string;
  amountPaidCents: number;
  note?: string | null;
}): Promise<LogManualReferralResult> {
  const affiliate = await findAffiliateById(input.affiliateId);
  if (!affiliate) return { ok: false, reason: "affiliate_not_found" };
  if (affiliate.status !== "active") return { ok: false, reason: "affiliate_not_active" };

  const buyerEmail = input.buyerEmail.trim().toLowerCase();
  if (buyerEmail === affiliate.email) return { ok: false, reason: "self_referral" };

  const commissionCents = Math.round(input.amountPaidCents * (affiliate.commissionPct / 100));

  const db = getAdminDb();
  const referralRef = db.collection("referrals").doc();
  await referralRef.set({
    affiliateId: affiliate.id,
    affiliateCode: affiliate.code,
    stripeCustomerId: `manual:${referralRef.id}`,
    stripePaymentReference: `manual:${referralRef.id}`,
    isRecurringCharge: false,
    buyerEmail,
    amountPaidCents: input.amountPaidCents,
    commissionCents,
    status: "pending",
    paidOutAt: null,
    paidOutNote: input.note?.trim().slice(0, 500) || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db
    .collection("affiliates")
    .doc(affiliate.id)
    .update({
      referralCount: FieldValue.increment(1),
      pendingCommissionCents: FieldValue.increment(commissionCents),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return { ok: true, referralId: referralRef.id, commissionCents };
}

export async function listReferralsForAffiliate(affiliateId: string) {
  const snap = await getAdminDb()
    .collection("referrals")
    .where("affiliateId", "==", affiliateId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
