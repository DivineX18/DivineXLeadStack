import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  MAX_SESSIONS_LISTED,
  resolveThreadBase,
} from "@/lib/ai-suite/thread-store";

export const dynamic = "force-dynamic";

/** QA BUG-004 — the history list. Newest first, title + last-updated date,
 *  capped so one chatty workspace can't make this an unbounded read. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveThreadBase(
    request,
    url.searchParams.get("level"),
    url.searchParams.get("subAccountId")
  );
  if (resolved instanceof NextResponse) return resolved;

  const [pointerSnap, sessionsSnap] = await Promise.all([
    getAdminDb().doc(resolved.basePath).get(),
    getAdminDb()
      .collection(`${resolved.basePath}/sessions`)
      .orderBy("updatedAt", "desc")
      .limit(MAX_SESSIONS_LISTED)
      .get(),
  ]);
  const activeSessionId = pointerSnap.exists
    ? ((pointerSnap.data()?.activeSessionId as string | undefined) ?? null)
    : null;

  const sessions = sessionsSnap.docs.map((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt?.toDate?.() ?? null;
    return {
      id: d.id,
      title: typeof data.title === "string" ? data.title : "New conversation",
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      active: d.id === activeSessionId,
    };
  });
  return NextResponse.json({ sessions });
}
