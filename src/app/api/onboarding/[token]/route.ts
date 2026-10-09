import "server-only";
import { NextResponse } from "next/server";
import {
  buildPortalView,
  clientSetAccessState,
  resolvePortalToken,
  savePortalSection,
  submitPortalIntake,
} from "@/lib/onboarding/portal-service";
import { finalizeOnboardingAsset, mintOnboardingUploadUrl } from "@/lib/onboarding/assets";
import { notifyAccountOwner } from "@/lib/onboarding/staff-service";
import { getOnboarding } from "@/lib/server/client-onboarding-service";

export const dynamic = "force-dynamic";

/**
 * THE CLIENT PORTAL API. Public path: the invite token is the credential.
 *
 * Same trust model as /q/[token] and /pay/[token]. Every handler resolves the
 * token first and works only from the record it returns, so there is no path
 * where a caller-supplied id selects the record. An invalid, rotated or
 * expired token is a 404 with no detail: it must not reveal whether an
 * onboarding exists.
 */

const notFound = () => NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const res = await resolvePortalToken(token);
  if (!res.ok) {
    if (res.reason === "expired") {
      return NextResponse.json(
        { error: "This link has expired. Ask your account manager for a fresh one." },
        { status: 410 },
      );
    }
    return notFound();
  }
  return NextResponse.json({ view: await buildPortalView(res.onboarding) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const resolved = await resolvePortalToken(token);
  if (!resolved.ok) return notFound();
  const onboarding = resolved.onboarding;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action ?? "");

  switch (action) {
    case "save_section": {
      const res = await savePortalSection({
        onboarding,
        section: String(body.section ?? ""),
        answers: body.answers,
        markComplete: body.markComplete === true,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      const fresh = await getOnboarding(onboarding.agencyId, onboarding.id);
      return NextResponse.json({ view: await buildPortalView(fresh ?? onboarding) });
    }

    case "submit": {
      const res = await submitPortalIntake(onboarding);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await notifyAccountOwner({ onboarding, kind: "intake_submitted" });
      const fresh = await getOnboarding(onboarding.agencyId, onboarding.id);
      return NextResponse.json({ view: await buildPortalView(fresh ?? onboarding) });
    }

    case "mint_upload": {
      const res = await mintOnboardingUploadUrl({
        onboardingId: onboarding.id,
        contentType: String(body.contentType ?? ""),
        sizeBytes: Number(body.sizeBytes ?? 0),
      });
      if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json(res);
    }

    case "finalize_upload": {
      const res = await finalizeOnboardingAsset({
        onboarding,
        assetId: String(body.assetId ?? ""),
        key: String(body.key ?? "other"),
        filename: String(body.filename ?? ""),
        uploadedBy: "client",
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await notifyAccountOwner({
        onboarding,
        kind: "assets_received",
        detail: `${res.asset.filename} (${res.asset.key})`,
      });
      const fresh = await getOnboarding(onboarding.agencyId, onboarding.id);
      return NextResponse.json({ view: await buildPortalView(fresh ?? onboarding) });
    }

    case "set_access": {
      const res = await clientSetAccessState({
        onboarding,
        key: String(body.key ?? ""),
        state: String(body.state ?? ""),
        note: typeof body.note === "string" ? body.note : undefined,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      if (String(body.state) === "invited_by_client") {
        await notifyAccountOwner({
          onboarding,
          kind: "access_ready_to_verify",
          detail: `${String(body.key)} invitation sent, needs verifying.`,
        });
      }
      const fresh = await getOnboarding(onboarding.agencyId, onboarding.id);
      return NextResponse.json({ view: await buildPortalView(fresh ?? onboarding) });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
