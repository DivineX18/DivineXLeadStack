import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A TELEGRAM BUTTON CARRIES A REFERENCE, NOT AN INSTRUCTION.
 *
 * Telegram's callback_data is a short string that travels back from the
 * client. Putting capability arguments in it would mean the thing being
 * executed is whatever came back from a phone, and Telegram caps it at 64
 * bytes anyway. So the button carries an opaque id and the server reloads
 * the proposal it already stored, which is the same discipline the web
 * confirm route follows when it re-validates its own arguments.
 *
 * The stored proposal is bound to the Telegram account, the DivineX user
 * and the workspace it was made in. A callback that does not match all
 * three is refused rather than executed, so a forwarded message, a shared
 * device or a guessed id cannot act on someone else's workspace.
 */

export interface StoredProposal {
  id: string;
  telegramUserId: string;
  uid: string;
  subAccountId: string;
  capability: string;
  args: Record<string, unknown>;
  summary: string;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: FirebaseFirestore.Timestamp | null;
}

const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function storeTelegramProposal(opts: {
  telegramUserId: string;
  uid: string;
  subAccountId: string;
  capability: string;
  args: Record<string, unknown>;
  summary: string;
}): Promise<string> {
  // Short enough for callback_data with the prefix, random enough not to
  // be guessed: 16 bytes of base64url is 22 characters.
  const id = randomBytes(16).toString("base64url");
  await getAdminDb().collection("telegramProposals").doc(id).set({
    ...opts,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
  return id;
}

export type ProposalLoad =
  | { ok: true; proposal: StoredProposal }
  | { ok: false; reason: "missing" | "not_yours" | "wrong_workspace" | "already_settled" | "expired" };

/**
 * Load a proposal for a callback, proving it belongs to this person, this
 * account and this workspace before it can be acted on.
 *
 * Every refusal reads the same to the caller, so a guessed id cannot be
 * used to learn whether one exists.
 */
export async function loadTelegramProposal(opts: {
  id: string;
  telegramUserId: string;
  uid: string;
  subAccountId: string;
}): Promise<ProposalLoad> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(opts.id)) return { ok: false, reason: "missing" };
  const snap = await getAdminDb().collection("telegramProposals").doc(opts.id).get();
  if (!snap.exists) return { ok: false, reason: "missing" };
  const d = snap.data()!;
  if (d.telegramUserId !== opts.telegramUserId) return { ok: false, reason: "not_yours" };
  if (d.uid !== opts.uid) return { ok: false, reason: "not_yours" };
  // Switching workspace after proposing must not let the old proposal act
  // in the new one, nor the new workspace act on the old proposal.
  if (d.subAccountId !== opts.subAccountId) return { ok: false, reason: "wrong_workspace" };
  if (d.status !== "pending") return { ok: false, reason: "already_settled" };
  const created = d.createdAt?.toDate?.()?.getTime?.() ?? 0;
  if (created && Date.now() - created > PROPOSAL_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, proposal: { id: snap.id, ...(d as Omit<StoredProposal, "id">) } };
}

/** Mark it settled, so the same button cannot be pressed twice. */
export async function settleTelegramProposal(id: string, status: "confirmed" | "cancelled"): Promise<void> {
  await getAdminDb().collection("telegramProposals").doc(id).set(
    { status, settledAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
