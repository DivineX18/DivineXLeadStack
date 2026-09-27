import { NextResponse } from "next/server";
import { requireUid } from "@/lib/comms/route-auth";
import { createTelegramLinkToken, getTelegramLink, revokeTelegramLink } from "@/lib/telegram/identity";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Connecting and disconnecting Telegram, from an authenticated session.
 *
 * This is the only place a link can begin. Telegram cannot start one:
 * the deep link carries a token minted HERE, for the person who is already
 * signed in, which is what stops a Telegram account from attaching itself
 * to a workspace on its own say-so.
 */

export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  const botName = process.env.TELEGRAM_BOT_USERNAME;
  if (!botName || !process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "Telegram isn't set up on this deployment yet." },
      { status: 503 },
    );
  }

  const { token, expiresAt } = await createTelegramLinkToken(auth.uid);
  return NextResponse.json({
    // The token is the whole credential and is single use, so it is shown
    // once and never stored anywhere the customer can re-read it.
    deepLink: `https://t.me/${botName}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function GET(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;
  // Scoped to this person's own links, by uid, not by anything supplied.
  const snap = await getAdminDb().collection("telegramLinks").where("uid", "==", auth.uid).get();
  const active = snap.docs.filter((d) => d.data().status === "active");
  return NextResponse.json({
    connected: active.length > 0,
    // A display name only. Never used to decide anything.
    username: active[0]?.data().telegramUsername ?? null,
  });
}

export async function DELETE(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;
  const removed = await revokeTelegramLink({ uid: auth.uid });
  void getTelegramLink;
  return NextResponse.json({ ok: true, removed });
}
