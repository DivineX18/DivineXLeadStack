import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { encryptSecret, tenantSecretsConfigured } from "@/lib/crypto/secrets";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import type { SubAccountStripeConfig } from "@/types/tenancy";

/**
 * Connect (or reconnect/rotate) a sub-account's OWN Stripe account for
 * Funnel Checkout. Pasting a new key while one is already stored replaces
 * it — that IS the supported rotation path (see the "Key rotation"
 * section of the plan), no separate rotate UI needed.
 *
 * POST body: { secretKey: string }
 */

interface PostBody {
  secretKey?: string;
}

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  if (subSnap.data()?.funnelCheckoutEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Funnel checkout isn't enabled for this workspace. Ask your agency owner.",
      },
      { status: 403 },
    );
  }

  if (!tenantSecretsConfigured()) {
    return NextResponse.json(
      { error: "Funnel checkout isn't set up on this deployment yet." },
      { status: 503 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const secretKey = body.secretKey?.trim();
  if (!secretKey || !/^sk_(live|test)_/.test(secretKey)) {
    return NextResponse.json(
      { error: "That doesn't look like a Stripe secret key (starts with sk_live_ or sk_test_)." },
      { status: 400 },
    );
  }
  const mode: SubAccountStripeConfig["mode"] = secretKey.startsWith("sk_live_")
    ? "live"
    : "test";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const tenantStripe = new Stripe(secretKey);

  // Validate the key is live/usable before persisting anything.
  try {
    await tenantStripe.balance.retrieve();
  } catch {
    return NextResponse.json(
      { error: "That key doesn't look valid — Stripe rejected it." },
      { status: 400 },
    );
  }

  // If a key is already connected, best-effort tear down its webhook
  // endpoint before creating the new one — reconnecting IS the rotate path.
  const existing = await getStripeForTenant(subAccountId);
  if (existing?.config.stripeWebhookEndpointId) {
    try {
      await existing.stripe.webhookEndpoints.del(
        existing.config.stripeWebhookEndpointId,
      );
    } catch {
      // Best-effort — the old key/endpoint may already be dead.
    }
  }

  let endpoint: Stripe.WebhookEndpoint;
  try {
    endpoint = await tenantStripe.webhookEndpoints.create({
      url: `${appUrl}/api/webhooks/stripe/tenant/${subAccountId}`,
      enabled_events: WEBHOOK_EVENTS,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Stripe.errors.StripeError
            ? `Couldn't create the Stripe webhook: ${err.message}`
            : "Couldn't create the Stripe webhook.",
      },
      { status: 502 },
    );
  }
  if (!endpoint.secret) {
    // Shouldn't happen on a fresh create, but the secret is only ever
    // returned once — if it's missing there's nothing safe to store.
    try {
      await tenantStripe.webhookEndpoints.del(endpoint.id);
    } catch {
      // best-effort cleanup
    }
    return NextResponse.json(
      { error: "Stripe didn't return a webhook signing secret. Try again." },
      { status: 502 },
    );
  }

  const stripeConfig: SubAccountStripeConfig = {
    mode,
    secretKeyEncrypted: encryptSecret(secretKey),
    secretKeyLast4: secretKey.slice(-4),
    webhookSecretEncrypted: encryptSecret(endpoint.secret),
    stripeWebhookEndpointId: endpoint.id,
    connectedAt: new Date(),
    connectedByUid: access.uid,
    status: "connected",
    lastValidatedAt: new Date(),
  };

  await subRef.update({
    stripeConfig,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    mode,
    secretKeyLast4: stripeConfig.secretKeyLast4,
    status: stripeConfig.status,
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);

  const existing = await getStripeForTenant(subAccountId);
  if (existing?.config.stripeWebhookEndpointId) {
    try {
      await existing.stripe.webhookEndpoints.del(
        existing.config.stripeWebhookEndpointId,
      );
    } catch {
      // Best-effort — the key may already be revoked on Stripe's side.
    }
  }

  await subRef.update({
    stripeConfig: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
