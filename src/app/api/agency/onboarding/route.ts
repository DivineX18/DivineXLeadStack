import "server-only";
import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  enrollClient,
  listOnboardings,
  listPackages,
  reissueInvite,
} from "@/lib/server/client-onboarding-service";
import { notifyAccountOwner } from "@/lib/onboarding/staff-service";
import { resolveCrmWorkspaceId } from "@/lib/onboarding/home-workspace";

export const dynamic = "force-dynamic";

/**
 * Client onboarding, staff side.
 *
 * Owner-gated on every method. The Command Center page also checks, but the
 * page check is not the gate: this is. A route that trusted the UI would be
 * one bookmark away from being public.
 */

export async function GET(request: Request): Promise<NextResponse> {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;
  const [onboardings, packages] = await Promise.all([
    listOnboardings(owner.agencyId),
    listPackages(owner.agencyId),
  ]);
  return NextResponse.json({ onboardings, packages });
}

/**
 * MANUAL ENROLLMENT, which is the canonical path.
 *
 * Stripe enrollment (a later phase) calls `enrollClient()` too, with
 * `source: "stripe"`. There is deliberately no second orchestration here for
 * it to drift away from.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  // Resolved from the agency, not asked for. An operator should never have to
  // know a workspace id to enroll a client; the override is for testing.
  const crmSubAccountId = await resolveCrmWorkspaceId({
    agencyId: owner.agencyId,
    override: str("crmSubAccountId") || null,
  });
  if (!crmSubAccountId) {
    return NextResponse.json(
      { error: "This agency has no workspace yet, so there is nowhere to put the client's contact." },
      { status: 409 },
    );
  }

  const result = await enrollClient({
    agencyId: owner.agencyId,
    crmSubAccountId,
    packageId: str("packageId"),
    businessName: str("businessName"),
    contactEmail: str("contactEmail"),
    contactName: str("contactName"),
    websiteUrl: str("websiteUrl") || null,
    notes: str("notes") || null,
    accountOwnerUid: str("accountOwnerUid") || owner.uid,
    createdByUid: owner.uid,
    source: "manual",
  });

  if (!result.ok) {
    const status = result.reason === "duplicate" ? 409 : 400;
    const message =
      result.reason === "package_missing"
        ? "That package doesn't exist in this agency."
        : result.detail ?? "That enrollment isn't valid.";
    return NextResponse.json({ error: message }, { status });
  }

  await notifyAccountOwner({ onboarding: result.onboarding, kind: "enrolled" });

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return NextResponse.json({
    onboarding: result.onboarding,
    // Shown ONCE. Only the hash is stored, so this cannot be re-read later;
    // re-sending mints a new link and kills this one.
    inviteUrl: `${base}/onboarding/${result.inviteToken}`,
  });
}

/** Rotate the invite link. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;
  let body: { onboardingId?: string };
  try {
    body = (await request.json()) as { onboardingId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.onboardingId) return NextResponse.json({ error: "onboardingId is required." }, { status: 400 });

  const token = await reissueInvite({
    agencyId: owner.agencyId,
    onboardingId: body.onboardingId,
    actor: owner.uid,
  });
  if (!token) return NextResponse.json({ error: "That onboarding no longer exists." }, { status: 404 });

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return NextResponse.json({ inviteUrl: `${base}/onboarding/${token}` });
}
