import "server-only";

import { NextResponse } from "next/server";
import { createPublicSignupCheckoutSession } from "@/lib/server/public-signup-service";
import { BillingError } from "@/lib/server/billing-service";
import { checkAndCount } from "@/lib/public-signup/rate-limit";

/**
 * Public — the pricing page's "Get started" button posts here with the
 * chosen plan id and gets back a Stripe Checkout URL to redirect to. No
 * sub-account exists yet; provisioning happens on `checkout.session.
 * completed` (see `public-signup-service.ts`).
 */

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkAndCount(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts — please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: { planId?: string };
  try {
    body = (await request.json()) as { planId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const planId = typeof body.planId === "string" ? body.planId.trim() : "";
  if (!planId) {
    return NextResponse.json({ error: "planId is required." }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  if (!base) {
    return NextResponse.json(
      { error: "This deployment isn't fully configured yet — try again shortly." },
      { status: 503 },
    );
  }

  try {
    const { url } = await createPublicSignupCheckoutSession({
      planId,
      successUrl: `${base}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/pricing?cancelled=1`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/public/checkout] failed", err);
    return NextResponse.json(
      { error: "Something went wrong starting checkout. Please try again." },
      { status: 500 },
    );
  }
}
