import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveThreadBase } from "@/lib/ai-suite/thread-store";

export const dynamic = "force-dynamic";

/**
 * QA BUG-004 — "reopenable". Loads one past session's messages AND makes it
 * the active one, so continuing the conversation after reopening appends to
 * THIS session rather than silently forking a new one on the next autosave.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const url = new URL(request.url);
  const resolved = await resolveThreadBase(
    request,
    url.searchParams.get("level"),
    url.searchParams.get("subAccountId")
  );
  if (resolved instanceof NextResponse) return resolved;

  // The session path is scoped under THIS caller's own resolved basePath —
  // a foreign/other-user's session id simply doesn't exist at this path, so
  // it 404s like a missing one rather than needing a separate ownership
  // check.
  const ref = getAdminDb().doc(`${resolved.basePath}/sessions/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );

  await getAdminDb()
    .doc(resolved.basePath)
    .set(
      { activeSessionId: sessionId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

  return NextResponse.json({
    messages: snap.data()?.messages ?? [],
    sessionId,
  });
}
