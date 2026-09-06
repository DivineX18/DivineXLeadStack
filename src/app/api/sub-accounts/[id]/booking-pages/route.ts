import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import {
  createBookingPageServerSide,
  BookingPageError,
} from "@/lib/server/booking-pages-service";
import type { BookingPage } from "@/types/booking";

/**
 * Booking-page CRUD per sub-account.
 *
 * GET  — list every booking page in the sub-account. Visible to any
 *        active member so collaborators can see/share public links.
 *        Reads also flow over the client SDK + Firestore rules — this
 *        route exists for server-side renderers and integration tests.
 * POST — create a new booking page. Sub-account admin only. Slug must
 *        be globally unique within the sub-account; the slug doubles as
 *        the Firestore doc id so collisions are detected by doc.create.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/bookingPages`)
    .get();
  const pages = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<BookingPage, "id">) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ ok: true, pages });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Creation lives in the service so the editor and Zeno build booking pages
  // through the same guards — see booking-pages-service.ts.
  try {
    const { slug } = await createBookingPageServerSide({
      subAccountId,
      createdByUid: access.uid,
      data: body,
    });
    return NextResponse.json({ ok: true, slug });
  } catch (err) {
    if (err instanceof BookingPageError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "conflict" ? 409 : 400 },
      );
    }
    throw err;
  }
}
