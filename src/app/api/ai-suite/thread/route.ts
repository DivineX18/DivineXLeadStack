import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteLevel } from "@/types/ai-suite";
import {
  MAX_MESSAGES,
  deriveSessionTitle,
  resolveThreadBase,
  sanitizeStoredMessage,
  type StoredMessage,
} from "@/lib/ai-suite/thread-store";

export const dynamic = "force-dynamic";

/**
 * Durable AI Suite chat threads — one SESSION per conversation, so a page
 * refresh doesn't lose the open one AND finishing a conversation doesn't
 * destroy it (see QA BUG-004 / lib/ai-suite/thread-store.ts for the full
 * history of why this isn't a single overwritten doc any more).
 *
 * GET resolves "the currently open session" via the pointer doc at
 * `basePath` and returns its messages + id. PUT upserts a session (creating
 * one on the first save of a brand-new conversation) and advances the
 * pointer to it. DELETE ("New chat") only clears the POINTER — the session
 * itself survives in `basePath/sessions/{id}` for history to find.
 *
 * The thread is pure chat HISTORY, never authority: confirming a restored
 * proposal still goes through the confirm route's full re-auth +
 * re-validation, so nothing stored here grants any power.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveThreadBase(
    request,
    url.searchParams.get("level"),
    url.searchParams.get("subAccountId")
  );
  if (resolved instanceof NextResponse) return resolved;

  const pointerSnap = await getAdminDb().doc(resolved.basePath).get();
  const activeSessionId = pointerSnap.exists
    ? (pointerSnap.data()?.activeSessionId as string | undefined)
    : undefined;
  if (!activeSessionId)
    return NextResponse.json({ messages: [], sessionId: null });

  const sessionSnap = await getAdminDb()
    .doc(`${resolved.basePath}/sessions/${activeSessionId}`)
    .get();
  if (!sessionSnap.exists)
    return NextResponse.json({ messages: [], sessionId: null });
  return NextResponse.json({
    messages: sessionSnap.data()?.messages ?? [],
    sessionId: activeSessionId,
  });
}

export async function PUT(request: Request) {
  let body: {
    level?: AiSuiteLevel;
    subAccountId?: string;
    messages?: unknown;
    sessionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const resolved = await resolveThreadBase(
    request,
    body.level ?? null,
    body.subAccountId ?? null
  );
  if (resolved instanceof NextResponse) return resolved;

  if (!Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "`messages` must be an array." },
      { status: 400 }
    );
  }
  const messages = body.messages
    .map(sanitizeStoredMessage)
    .filter((m): m is StoredMessage => m !== null)
    .slice(-MAX_MESSAGES);

  const db = getAdminDb();
  // A session id the caller doesn't actually own (stale tab, tampered body)
  // is treated as "start a new one" rather than trusted — sessions live
  // under this caller's own resolved basePath, so there's nothing to
  // overwrite outside it regardless, but failing closed here avoids
  // silently reviving an unrelated/garbage id.
  let sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
  if (sessionId) {
    const existing = await db
      .doc(`${resolved.basePath}/sessions/${sessionId}`)
      .get();
    if (!existing.exists) sessionId = null;
  }

  const sessionRef = sessionId
    ? db.doc(`${resolved.basePath}/sessions/${sessionId}`)
    : db.collection(`${resolved.basePath}/sessions`).doc();
  sessionId = sessionRef.id;

  await sessionRef.set(
    {
      messages,
      title: deriveSessionTitle(messages),
      updatedAt: FieldValue.serverTimestamp(),
      ...(body.sessionId === sessionId
        ? {}
        : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  await db
    .doc(resolved.basePath)
    .set({
      activeSessionId: sessionId,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json({ ok: true, sessionId });
}

/** "New chat" — clears which session is open. The session itself is kept,
 *  reachable afterward from the history list. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveThreadBase(
    request,
    url.searchParams.get("level"),
    url.searchParams.get("subAccountId")
  );
  if (resolved instanceof NextResponse) return resolved;

  await getAdminDb()
    .doc(resolved.basePath)
    .set(
      { activeSessionId: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  return NextResponse.json({ ok: true });
}
