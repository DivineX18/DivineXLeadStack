import "server-only";
import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ascend, ascendConfigured } from "@/lib/divinex/ascend-client";
import { assetPdfFilename, renderAssetPdfStream } from "@/lib/divinex/asset-pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BUG-010 — download a generated Asset Studio deliverable ("Lead Magnet
 * Full Draft", "Proposal", etc.) as a real PDF file. Before this, the only
 * action on a generated asset was "Copy" to the clipboard (see
 * ascend-assets-section.tsx) — not usable as a funnel's lead-magnet
 * delivery file, which needs an actual document.
 *
 * There's no per-id fetch on the Ascend side, only listAssets() for the
 * whole workspace — fine here: this route is low-traffic (an explicit
 * download click, not a hot path) and avoids a cross-repo API addition for
 * a single id lookup.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
): Promise<Response> {
  const { id: subAccountId, assetId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!ascendConfigured()) {
    return NextResponse.json(
      { error: "The DivineX intelligence engine isn't configured on this deployment yet." },
      { status: 503 },
    );
  }

  const res = await ascend.listAssets(subAccountId);
  if (!res.ok) {
    return NextResponse.json({ error: "Couldn't load your assets right now." }, { status: 502 });
  }
  const asset = res.data?.assets?.find((a) => String(a.id) === assetId);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const stream = await renderAssetPdfStream({
    title: asset.title,
    assetType: asset.assetType,
    content: asset.content,
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${assetPdfFilename(asset.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
