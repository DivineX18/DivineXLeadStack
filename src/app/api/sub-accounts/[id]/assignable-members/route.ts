import "server-only";

import { NextResponse } from "next/server";

import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listSubAccountMembersServerSide } from "@/lib/server/members-service";

/**
 * GET /api/sub-accounts/[id]/assignable-members
 *
 * Who a task in THIS workspace may be assigned to.
 *
 * A route rather than a client read, because `subAccountMembers` only lets a
 * collaborator read their OWN row: listing the roster client-side works for
 * an admin and returns one entry for everybody else, which would have made
 * the picker silently useless for exactly the people being assigned work.
 *
 * Scoped by membership of THIS sub-account, never by agency membership and
 * never by plan capacity. An agency user with no access to this client does
 * not appear here, and the Firestore rule enforces the same thing again at
 * write time so a forged uid cannot be assigned by skipping this route.
 *
 * Returns uid and display name only. The picker needs to name a person; it
 * does not need their email address, and every field returned is a field
 * disclosed.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  try {
    const rows = await listSubAccountMembersServerSide(id);
    const members = rows
      .filter((m) => m.status === "active")
      .map((m) => ({ uid: m.uid, name: m.who }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ members });
  } catch (err) {
    console.error("[assignable-members] list failed", err);
    return NextResponse.json({ error: "Couldn't load members." }, { status: 500 });
  }
}
