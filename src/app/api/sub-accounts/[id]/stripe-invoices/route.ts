import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";

/**
 * Toggle Stripe Checkout ("Pay with card") on the public invoice page for
 * this sub-account. Deliberately simple — no OAuth, no Stripe Connect: the
 * checkout runs against the AGENCY'S OWN Stripe account, the same one
 * already configured via STRIPE_SECRET_KEY for CRM billing. There's
 * nothing to "connect" per sub-account, just an on/off switch (mirrors
 * the shape of the PayPal integration route, minus a username to store).
 *
 * POST body: { enabled: boolean }
 */

interface PostBody {
  enabled?: boolean;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "`enabled` must be a boolean." },
      { status: 400 },
    );
  }

  if (body.enabled && !billingStripeIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Online payments aren't set up on this deployment yet — contact your workspace admin.",
      },
      { status: 503 },
    );
  }

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        stripeInvoicesEnabled: body.enabled,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
