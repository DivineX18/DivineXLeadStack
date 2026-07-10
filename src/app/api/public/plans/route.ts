import "server-only";

import { NextResponse } from "next/server";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { billingStripeIsConfigured } from "@/lib/server/billing-service";

/**
 * Public — the marketing pricing page (`/pricing` + the homepage pricing
 * section) fetches from here. Only plans marked `publicSelfServeEnabled`
 * are ever returned; no auth, no tenancy params (single agency per
 * deployment, resolved server-side).
 */
export async function GET() {
  const { plans } = await getPublicPlans();
  return NextResponse.json({
    plans,
    configured: billingStripeIsConfigured(),
  });
}
