import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listFeatureFlags, setFeatureFlag } from "@/lib/flags/manage-flags";
import { FEATURE_FLAG_IDS } from "@/types/feature-flags";

export const dynamic = "force-dynamic";

// Agency-owner-gated for now — Flow has no separate "platform staff" role
// (see the comment in lib/flags/evaluate-flag.ts). Reusing the existing
// highest-privilege check rather than inventing a new one as a prerequisite.

export async function GET(request: Request): Promise<NextResponse> {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const flags = await listFeatureFlags();
  return NextResponse.json({ flags });
}

export async function POST(request: Request): Promise<NextResponse> {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const rolloutStage = body?.rolloutStage;

  if (typeof id !== "string" || !FEATURE_FLAG_IDS.includes(id as never)) {
    return NextResponse.json({ error: "Unknown flag id" }, { status: 400 });
  }
  const validStages = ["off", "internal_admin", "internal_qa", "single_workspace", "beta", "ga"];
  if (typeof rolloutStage !== "string" || !validStages.includes(rolloutStage)) {
    return NextResponse.json({ error: "Invalid rolloutStage" }, { status: 400 });
  }

  await setFeatureFlag({
    id: id as (typeof FEATURE_FLAG_IDS)[number],
    rolloutStage: rolloutStage as never,
    allowedWorkspaceIds: Array.isArray(body?.allowedWorkspaceIds)
      ? body.allowedWorkspaceIds.filter((v: unknown) => typeof v === "string")
      : undefined,
    allowedUids: Array.isArray(body?.allowedUids)
      ? body.allowedUids.filter((v: unknown) => typeof v === "string")
      : undefined,
    description: typeof body?.description === "string" ? body.description : undefined,
    updatedByUid: caller.uid,
  });

  return NextResponse.json({ ok: true });
}
