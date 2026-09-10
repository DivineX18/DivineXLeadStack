import { NextResponse } from "next/server";
import { BillingError } from "@/lib/server/billing-service";
import { createPublicSignupCheckoutSession } from "@/lib/server/public-signup-service";
import {
  markTrialSignupCheckoutStarted,
  parseTrialSignup,
  recordTrialSignup,
} from "@/lib/server/trial-signup-service";

/**
 * Step 1 of the two-step trial: capture the lead, then hand off to the SAME
 * certified Stripe Checkout the pricing page uses.
 *
 * This route deliberately adds nothing to billing. It calls
 * `createPublicSignupCheckoutSession` with a plan id exactly as
 * `/api/public/checkout` does, so price, trial length, trial settings,
 * metadata, provisioning and success routing are all untouched — the customer
 * lands on the same Stripe page either way. The only difference is that we
 * wrote down who they are first.
 *
 * `/api/public/checkout` is left completely alone so the direct pricing-card
 * path keeps working unchanged.
 */

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Mirrors the checkout route's host resolution: return to whichever product
 *  surface the customer actually started from, and only ever to a host we own. */
function resolveReturnBase(request: Request): string {
  const fallback = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const host = request.headers.get("host")?.toLowerCase().replace(/^www\./, "") ?? null;
  const allowed = [
    hostnameOf(process.env.NEXT_PUBLIC_APP_URL),
    hostnameOf(process.env.NEXT_PUBLIC_ASCEND_APP_URL),
  ].filter(Boolean) as string[];
  if (host && allowed.includes(host.split(":")[0])) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return fallback;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseTrialSignup(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const base = resolveReturnBase(request);
  if (!base) {
    return NextResponse.json(
      { error: "This deployment isn't fully configured yet — try again shortly." },
      { status: 503 },
    );
  }

  // Recorded BEFORE checkout so an abandonment at the card is still a lead.
  // That is the entire point of splitting the step.
  const leadId = await recordTrialSignup(parsed.value);

  try {
    const { url } = await createPublicSignupCheckoutSession({
      planId: parsed.value.planId,
      successUrl: `${base}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/start?cancelled=1`,
    });
    await markTrialSignupCheckoutStarted(leadId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/public/trial-signup] failed", err);
    return NextResponse.json(
      { error: "Something went wrong starting your trial. Please try again." },
      { status: 500 },
    );
  }
}
