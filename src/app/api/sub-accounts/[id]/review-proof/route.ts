import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { parseReviewProofInput } from "@/lib/funnels/review-proof";

/**
 * The ONE way verified review proof enters the system.
 *
 * A landing page may publish a star rating above the fold, and that rating has
 * to be a fact about the outside world rather than something an assistant
 * relayed. So it is typed by a workspace admin here, validated server-side, and
 * stored on the sub-account beside the other per-tenant business truths
 * (Twilio, Meta, Stripe, PayPal). Generation only ever reads it.
 *
 * PUT    — set / update. Body: { rating, reviewCount, reviewSource, reviewUrl? }
 * DELETE — clear it, after which pages render no rating at all.
 *
 * Admin-only, like every other route that writes a business fact: a rating is
 * a commercial claim the workspace owner is accountable for.
 *
 * No provider call is made to verify the numbers. V1 deliberately does not
 * integrate the Google Reviews API — the operator asserts their own rating,
 * exactly as they assert their own phone number, and the optional public link
 * is what makes the claim checkable by the visitor.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseReviewProofInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await getAdminDb()
    .doc(`subAccounts/${id}`)
    .update({
      reviewProof: {
        ...parsed.value,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: access.uid,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json({ ok: true, reviewProof: parsed.value });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${id}`)
    .update({ reviewProof: null, updatedAt: FieldValue.serverTimestamp() });

  return NextResponse.json({ ok: true });
}
