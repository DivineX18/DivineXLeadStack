import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A TELEGRAM ACCOUNT IS NOT AN AUTHORIZATION.
 *
 * Anyone can message a bot. A Telegram user id proves only which Telegram
 * account is typing, which is why linking begins inside an authenticated
 * DivineX session and never inside Telegram. The deep link carries a
 * short-lived, single-use token and nothing else: no workspace id, no uid,
 * no secret, because a deep link is pasteable, forwardable, and logged by
 * the client that opens it.
 *
 * WHAT IS STORED is a mapping from the immutable Telegram user id to a
 * DivineX uid. Usernames change and are not identity. The mapping is a
 * pointer, not a grant: it says who this is, never what they may do.
 * Permission is re-derived from the workspace's own membership on every
 * request, so someone removed from a workspace loses Telegram at the same
 * moment they lose the web, with nothing needing to be revoked here.
 */

const TOKEN_TTL_MS = 10 * 60 * 1000;

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

/** Constant-time, so a token cannot be guessed a byte at a time. */
function sameDigest(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface TelegramLinkToken {
  token: string;
  expiresAt: Date;
}

/**
 * Mint a linking token for an ALREADY authenticated person. Only the hash
 * is stored, so a Firestore dump cannot be used to bind an attacker's
 * Telegram account to someone else's DivineX identity.
 */
export async function createTelegramLinkToken(uid: string): Promise<TelegramLinkToken> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await getAdminDb().collection("telegramLinkTokens").doc(sha256(token)).set({
    uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    usedAt: null,
  });
  return { token, expiresAt };
}

export type LinkResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "unknown" | "expired" | "already_used" | "already_linked_elsewhere" };

/**
 * Redeem a token from /start and bind the Telegram account.
 *
 * A transaction, so a token forwarded to two people is spent by exactly
 * one. A Telegram account already bound to a DIFFERENT DivineX user is
 * refused rather than silently re-pointed: quietly moving an external
 * identity between accounts is how one person ends up reading another's
 * workspace.
 */
export async function redeemTelegramLinkToken(opts: {
  token: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  chatId: string;
}): Promise<LinkResult> {
  const db = getAdminDb();
  const digest = sha256(opts.token);
  const tokenRef = db.collection("telegramLinkTokens").doc(digest);
  const linkRef = db.collection("telegramLinks").doc(opts.telegramUserId);

  return db.runTransaction(async (tx): Promise<LinkResult> => {
    const [tokenSnap, linkSnap] = await Promise.all([tx.get(tokenRef), tx.get(linkRef)]);
    if (!tokenSnap.exists) return { ok: false, reason: "unknown" };
    const t = tokenSnap.data()!;
    if (!sameDigest(tokenSnap.id, digest)) return { ok: false, reason: "unknown" };
    if (t.usedAt) return { ok: false, reason: "already_used" };
    const expires = t.expiresAt?.toDate?.() ?? new Date(0);
    if (expires.getTime() < Date.now()) return { ok: false, reason: "expired" };

    if (linkSnap.exists && linkSnap.data()!.status === "active" && linkSnap.data()!.uid !== t.uid) {
      return { ok: false, reason: "already_linked_elsewhere" };
    }

    tx.set(tokenRef, { usedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(linkRef, {
      telegramUserId: opts.telegramUserId,
      // Display only. It can change and is never identity.
      telegramUsername: opts.telegramUsername ?? null,
      chatId: opts.chatId,
      uid: t.uid,
      status: "active",
      // Which workspace this chat is pointed at: a preference, re-checked
      // against live membership every time it is used.
      activeSubAccountId: null,
      linkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, uid: t.uid as string };
  });
}

export interface TelegramLink {
  telegramUserId: string;
  uid: string;
  chatId: string;
  activeSubAccountId: string | null;
  telegramUsername: string | null;
}

export async function getTelegramLink(telegramUserId: string): Promise<TelegramLink | null> {
  const snap = await getAdminDb().collection("telegramLinks").doc(telegramUserId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  if (d.status !== "active") return null;
  return {
    telegramUserId,
    uid: String(d.uid),
    chatId: String(d.chatId ?? ""),
    activeSubAccountId: (d.activeSubAccountId as string) ?? null,
    telegramUsername: (d.telegramUsername as string) ?? null,
  };
}

/** Remembering which workspace a chat is on is a preference, not a grant. */
export async function setTelegramActiveWorkspace(telegramUserId: string, subAccountId: string | null): Promise<void> {
  await getAdminDb().collection("telegramLinks").doc(telegramUserId).set(
    { activeSubAccountId: subAccountId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Disconnect. Marked revoked rather than deleted, so a later message is
 * answered as an unlinked account instead of silently creating a fresh
 * link, and the record of the connection survives.
 */
export async function revokeTelegramLink(opts: { uid: string; telegramUserId?: string }): Promise<number> {
  const db = getAdminDb();
  const snap = opts.telegramUserId
    ? await db.collection("telegramLinks").where("telegramUserId", "==", opts.telegramUserId).get()
    : await db.collection("telegramLinks").where("uid", "==", opts.uid).get();
  let n = 0;
  for (const d of snap.docs) {
    // Only ever this person's own links.
    if (d.data().uid !== opts.uid) continue;
    await d.ref.set({ status: "revoked", revokedAt: FieldValue.serverTimestamp() }, { merge: true });
    n++;
  }
  // Any token they minted and never used dies with the connection.
  const tokens = await db
    .collection("telegramLinkTokens")
    .where("uid", "==", opts.uid)
    .where("usedAt", "==", null)
    .get();
  for (const t of tokens.docs) {
    await t.ref.set({ usedAt: FieldValue.serverTimestamp(), invalidated: true }, { merge: true });
  }
  return n;
}
