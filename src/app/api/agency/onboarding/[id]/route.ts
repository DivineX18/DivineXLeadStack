import "server-only";
import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  getOnboarding,
  listAccess,
  setOnboardingStatus,
} from "@/lib/server/client-onboarding-service";
import { listOnboardingAssets, signedAssetUrl } from "@/lib/onboarding/assets";
import { addInternalNote, notifyAccountOwner, staffSetAccessState } from "@/lib/onboarding/staff-service";
import { handoffToProduction, outstandingRequirements } from "@/lib/onboarding/handoff";
import { ONBOARDING_STATUSES, PLATFORM_ACCESS_STATES } from "@/types/client-onboarding";
import type { OnboardingStatus, PlatformAccessState } from "@/types/client-onboarding";

export const dynamic = "force-dynamic";

/** One onboarding, with everything staff need to act on it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;

  const onboarding = await getOnboarding(owner.agencyId, id);
  if (!onboarding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [access, assets] = await Promise.all([listAccess(id), listOnboardingAssets(id)]);
  const assetsWithUrls = await Promise.all(
    assets.map(async (a) => ({ ...a, url: await signedAssetUrl(a.storagePath) })),
  );
  const outstanding = outstandingRequirements(
    onboarding,
    [...new Set(assets.map((a) => a.key))],
    access,
  );

  return NextResponse.json({ onboarding, access, assets: assetsWithUrls, outstanding });
}

/**
 * Staff actions. One route, switched on `action`, because they all share the
 * same ownership check and the same record.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const onboarding = await getOnboarding(owner.agencyId, id);
  if (!onboarding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  switch (action) {
    case "set_status": {
      const status = String(body.status ?? "") as OnboardingStatus;
      if (!(ONBOARDING_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Unknown status." }, { status: 400 });
      }
      const ok = await setOnboardingStatus({
        agencyId: owner.agencyId,
        onboardingId: id,
        status,
        actor: owner.uid,
        blockedReason: typeof body.reason === "string" ? body.reason : null,
      });
      if (ok && status === "blocked") {
        await notifyAccountOwner({
          onboarding,
          kind: "blocked",
          detail: typeof body.reason === "string" ? body.reason : undefined,
        });
      }
      return NextResponse.json({ ok });
    }

    case "verify_access": {
      const state = String(body.state ?? "") as PlatformAccessState;
      if (!(PLATFORM_ACCESS_STATES as readonly string[]).includes(state)) {
        return NextResponse.json({ error: "Unknown access state." }, { status: 400 });
      }
      const res = await staffSetAccessState({
        agencyId: owner.agencyId,
        onboardingId: id,
        key: String(body.key ?? ""),
        state,
        note: typeof body.note === "string" ? body.note : undefined,
        actorUid: owner.uid,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

      // Tell the owner once everything required is actually confirmed, which
      // is the signal that work can start.
      const access = await listAccess(id);
      const required = access.filter((a) => a.required);
      if (required.length > 0 && required.every((a) => a.state === "verified")) {
        await notifyAccountOwner({ onboarding, kind: "access_all_verified" });
      }
      return NextResponse.json({ ok: true });
    }

    case "add_note": {
      const note = String(body.note ?? "").trim();
      if (!note) return NextResponse.json({ error: "A note is required." }, { status: 400 });
      const ok = await addInternalNote({
        agencyId: owner.agencyId,
        onboardingId: id,
        note,
        actorUid: owner.uid,
      });
      return NextResponse.json({ ok });
    }

    case "handoff": {
      const res = await handoffToProduction({
        agencyId: owner.agencyId,
        onboardingId: id,
        actorUid: owner.uid,
        actorEmail: owner.email,
        actorDisplayName: owner.email,
        force: body.force === true,
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: res.error, outstanding: res.outstanding ?? [] },
          { status: 409 },
        );
      }
      const fresh = await getOnboarding(owner.agencyId, id);
      if (fresh) await notifyAccountOwner({ onboarding: fresh, kind: "ready_for_production" });
      return NextResponse.json({
        ok: true,
        subAccountId: res.subAccountId,
        tasksCreated: res.tasksCreated,
      });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
