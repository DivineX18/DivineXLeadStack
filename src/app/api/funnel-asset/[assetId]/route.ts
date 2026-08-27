import { NextResponse } from "next/server";
import { readFunnelAsset } from "@/lib/funnels/assets";

export const dynamic = "force-dynamic";

/**
 * Public asset delivery (Multistep Journey pass): serves operator-uploaded
 * funnel images and lead-magnet PDFs. The unguessable Firestore auto-id IS
 * the capability token (standard lead-magnet delivery model — the link is
 * what the subscriber receives by email). Long immutable cache: assets are
 * write-once (a replacement upload mints a new id/URL).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<NextResponse> {
  const { assetId } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(assetId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await readFunnelAsset(assetId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.meta.contentType,
      "Content-Length": String(asset.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ...(asset.meta.kind === "pdf"
        ? { "Content-Disposition": `inline; filename="${asset.meta.filename.replace(/[^\w.\- ]/g, "")}"` }
        : {}),
    },
  });
}
