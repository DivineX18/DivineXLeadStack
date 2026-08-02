import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createFunnelServerSide,
  listFunnels,
} from "@/lib/server/funnels-service";
import type { FunnelGenre } from "@/types/funnels";

const GENRE_NAMES: Record<FunnelGenre, string> = {
  lead_magnet: "Lead Magnet",
  vsl: "VSL",
  challenge: "Challenge",
  application: "Application",
  tripwire: "Tripwire",
  webinar: "Webinar",
  lead_gen: "Lead Gen",
};

export const dynamic = "force-dynamic";

async function requireFunnelsGate(subAccountId: string): Promise<boolean> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return snap.data()?.funnelsEnabledByAgency === true;
}

/** GET — list this sub-account's funnels. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!(await requireFunnelsGate(subAccountId))) {
    return NextResponse.json(
      { error: "Funnels aren't enabled for this workspace. Ask your agency owner." },
      { status: 403 },
    );
  }

  const includeChainSteps = new URL(request.url).searchParams.get("all") === "1";
  const funnels = await listFunnels(subAccountId, { includeChainSteps });
  return NextResponse.json({ funnels });
}

/** POST — create a draft funnel, returns its id. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!(await requireFunnelsGate(subAccountId))) {
    return NextResponse.json(
      { error: "Funnels aren't enabled for this workspace. Ask your agency owner." },
      { status: 403 },
    );
  }

  let body: {
    name?: string;
    genre?: FunnelGenre;
    chainRole?: "upsell" | "downsell";
    parentFunnelId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const genre: FunnelGenre =
    body.genre && body.genre in GENRE_NAMES ? body.genre : "lead_magnet";
  const chainRole =
    body.chainRole === "upsell" || body.chainRole === "downsell"
      ? body.chainRole
      : undefined;
  const name =
    body.name ??
    (chainRole
      ? chainRole === "upsell"
        ? "Upsell step"
        : "Downsell step"
      : GENRE_NAMES[genre]);

  const funnelId = await createFunnelServerSide({
    subAccountId,
    createdByUid: access.uid,
    name,
    genre,
    chainRole,
    parentFunnelId: chainRole ? body.parentFunnelId : undefined,
  });
  return NextResponse.json({ id: funnelId });
}
