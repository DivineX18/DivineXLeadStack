import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  emitContactDeleted,
  findContactBlockers,
  updateContactServerSide,
  type UpdateContactPatch,
} from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";
import type { MemberStatus, Role } from "@/types";

/**
 * Delete a contact — but ONLY when nothing else points at it.
 *
 * Auth model: caller must be a sub-account ADMIN of the contact's
 * sub-account (or the agency owner). Collaborators can edit but not
 * delete — matches the rule for `contacts/{id}` where delete requires
 * canAdminSub.
 *
 * Reference guard (no cascade): the delete is refused with 409 when the
 * contact is still linked to a deal, task, calendar event / booking, quote
 * / invoice, form submission, web-chat conversation, or voice call. The
 * 409 body carries a `blockers` list (type + count) so the UI can explain
 * what to clear first. A GET on this route runs the same check as a
 * read-only dry-run (200 with `deletable` + `blockers`, no writes) for the
 * confirm modal.
 *
 * When allowed, a recursive delete wipes the contact + its own
 * subcollections (notes / activities / messages) and fires contact.deleted.
 */

interface CallerClaims {
  status?: MemberStatus;
  agencyId?: string | null;
  agencyRole?: "owner" | "staff" | null;
  role?: Role;
}

async function readCaller(request: Request): Promise<
  | { uid: string; email: string; claims: CallerClaims }
  | NextResponse
> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const auth = getAdminAuth();
  const record = await auth.getUser(uid).catch(() => null);
  if (!record) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return { uid, email: record.email ?? "", claims };
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Update a contact's plain fields + emit `contact.updated`. Any active
 * member may edit (matches the old client-SDK write rule). Territory moves
 * are NOT handled here — the dashboard routes those through the dedicated
 * territory fan-out endpoint.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.doc(`contacts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const data = snap.data() as Omit<Contact, "id">;

  const access = await requireSubAccountMember(request, data.subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: UpdateContactPatch = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.email === "string") patch.email = str(body.email);
  if (typeof body.phone === "string") patch.phone = str(body.phone);
  if (typeof body.company === "string") patch.company = str(body.company);
  if (typeof body.address === "string") patch.address = str(body.address);
  if (typeof body.source === "string") patch.source = str(body.source);
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if (body.pipelineStage === null || typeof body.pipelineStage === "string") {
    patch.pipelineStage =
      typeof body.pipelineStage === "string" ? body.pipelineStage : null;
  }

  const result = await updateContactServerSide({
    contactId: id,
    patch,
    mode: (data as { mode?: "live" | "test" }).mode ?? "live",
  });
  if (!result) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  return NextResponse.json({ contact: result.contact });
}

/**
 * Shared authorisation for the deletability check + the delete itself: the
 * caller must be the agency owner of the contact's agency OR an admin of its
 * sub-account. Returns a 403 NextResponse when not allowed, else null.
 */
async function ensureContactAdmin(
  db: FirebaseFirestore.Firestore,
  caller: { uid: string; claims: CallerClaims },
  agencyId: string,
  subAccountId: string,
): Promise<NextResponse | null> {
  const isAgencyOwner =
    caller.claims.agencyRole === "owner" && caller.claims.agencyId === agencyId;
  if (isAgencyOwner) return null;

  const memberSnap = await db
    .doc(`subAccounts/${subAccountId}/subAccountMembers/${caller.uid}`)
    .get();
  const member = memberSnap.data();
  const isSubAccountAdmin =
    memberSnap.exists &&
    member?.status === "active" &&
    member?.role === "admin";
  if (isSubAccountAdmin) return null;

  return NextResponse.json(
    { error: "Only sub-account admins can delete contacts." },
    { status: 403 },
  );
}

/**
 * Read-only deletability check for the confirm modal. The client calls this
 * (GET) before showing the confirm/blocked state: it reports whether the
 * contact can be deleted and, if not, what's still linked to it. No writes.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;

  const db = getAdminDb();
  const snap = await db.doc(`contacts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const { agencyId, subAccountId } = snap.data() as Omit<Contact, "id">;

  const denied = await ensureContactAdmin(db, caller, agencyId, subAccountId);
  if (denied) return denied;

  const blockers = await findContactBlockers(db, subAccountId, id);
  return NextResponse.json({ deletable: blockers.length === 0, blockers });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;

  const db = getAdminDb();
  const contactRef = db.doc(`contacts/${id}`);
  const snap = await contactRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const contact = snap.data() as Omit<Contact, "id">;
  const { agencyId, subAccountId } = contact;

  const denied = await ensureContactAdmin(db, caller, agencyId, subAccountId);
  if (denied) return denied;

  // Refuse deletion while the contact is still linked to other records.
  // We do NOT cascade — the operator must clear/reassign the links first.
  const blockers = await findContactBlockers(db, subAccountId, id);
  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error:
          "This contact is linked to other records and can't be deleted. Remove or reassign them first.",
        blockers,
      },
      { status: 409 },
    );
  }

  // Nothing references the contact — safe to delete it and its own
  // subcollections (notes, activities, messages).
  await db.recursiveDelete(contactRef);

  // Fire contact.deleted from the pre-delete snapshot — by the time
  // subscribers react the doc is gone, so we serialize what we just read.
  emitContactDeleted({ subAccountId, agencyId, contactId: id, data: contact });

  return NextResponse.json({ ok: true, contactId: id });
}

/* findContactBlockers now lives in lib/server/contacts-service.ts so the
   bulk-delete route runs the SAME guard. This app deliberately does not
   cascade; a second, weaker copy of this check would silently orphan deals,
   quotes and bookings at scale. */
