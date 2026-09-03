import "server-only";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ascend, ascendConfigured, ASCEND_ASSET_TYPES } from "@/lib/divinex/ascend-client";

export const dynamic = "force-dynamic";

/**
 * UNIFIED CREATE — Asset Studio proxy.
 *
 * Flow is a TRANSPORT here, not a generator: this route authenticates the
 * caller against THIS workspace, then hands off to Ascend's existing Asset
 * Studio. No prompts, no asset taxonomy and no generation logic live in Flow.
 *
 * Two auth boundaries stack deliberately. Flow proves the human may act in
 * this sub-account; Ascend independently proves the sub-account is linked to
 * the business profile it will generate against, and fails closed if not. A
 * bug in either one alone cannot leak another tenant's business context.
 */

/** The workspace's generated-asset library. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!ascendConfigured()) {
    return NextResponse.json({ assets: [], unavailable: "not_configured" });
  }
  const res = await ascend.listAssets(subAccountId);
  if (!res.ok) {
    // Not-linked is a legitimate state for a workspace that hasn't onboarded,
    // not an error worth showing as a failure.
    if (res.error === "ascend_403") {
      return NextResponse.json({ assets: [], unavailable: "workspace_not_linked" });
    }
    return NextResponse.json({ error: "Couldn't load your assets right now." }, { status: 502 });
  }
  return NextResponse.json({ assets: res.data?.assets ?? [] });
}

/** Generate a new deliverable through Ascend's Asset Studio. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { assetType?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const assetType = typeof body.assetType === "string" ? body.assetType.trim() : "";
  if (!(ASCEND_ASSET_TYPES as readonly string[]).includes(assetType)) {
    return NextResponse.json({ error: "Unknown asset type." }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";

  if (!ascendConfigured()) {
    return NextResponse.json(
      { error: "The DivineX intelligence engine isn't configured on this deployment yet." },
      { status: 503 },
    );
  }

  const res = await ascend.generateAsset({
    flowSubAccountId: subAccountId,
    assetType,
    ...(prompt ? { prompt } : {}),
  });

  if (!res.ok || !res.data?.asset) {
    if (res.error === "ascend_403") {
      return NextResponse.json(
        {
          error:
            "This workspace isn't linked to a DivineX business profile yet, so there's no business or brand context to write from. Finish onboarding first.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Couldn't generate that just now. Try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({ asset: res.data.asset }, { status: 201 });
}
