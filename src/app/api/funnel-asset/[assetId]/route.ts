import { NextResponse } from "next/server";
import { readFunnelAsset, signedAudioUrl } from "@/lib/funnels/assets";

export const dynamic = "force-dynamic";

/**
 * Public asset delivery (Multistep Journey pass): serves operator-uploaded
 * funnel images and lead-magnet PDFs. The unguessable Firestore auto-id IS
 * the capability token (standard lead-magnet delivery model — the link is
 * what the subscriber receives by email). Long immutable cache: assets are
 * write-once (a replacement upload mints a new id/URL).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<NextResponse> {
  const { assetId } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(assetId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await readFunnelAsset(assetId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // UPLOADED audio lives in Storage, so this is where its bytes are fetched
  // from. The redirect to a short-lived signed URL is deliberate: Cloud
  // Storage answers Range requests natively, which is what lets an <audio>
  // element seek, and it keeps a multi-megabyte buffer out of this process
  // entirely. The customer-facing URL stays this branded one; the signed
  // target is an implementation detail that expires.
  if (asset.meta.kind === "audio" && asset.meta.storagePath) {
    const signed = await signedAudioUrl(asset.meta);
    if (!signed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(signed, 302);
  }

  // REFERENCED video/audio is not stored here at all. Serving or redirecting
  // to the provider would put its address in front of the recipient, so an
  // old or hand-typed link lands on the branded player instead.
  if (asset.meta.kind === "video" || asset.meta.kind === "audio") {
    return NextResponse.redirect(new URL(`/d/${assetId}`, request.url), 302);
  }

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
