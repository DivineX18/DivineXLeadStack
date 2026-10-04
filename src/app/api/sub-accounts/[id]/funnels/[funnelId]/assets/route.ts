import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getFunnel } from "@/lib/server/funnels-service";
import {
  ALLOWED_ASSET_TYPES,
  ALLOWED_AUDIO_TYPES,
  MAX_ASSET_BYTES,
  MAX_AUDIO_BYTES,
  storeFunnelAsset,
  storeExternalAsset,
  storeAudioAsset,
} from "@/lib/funnels/assets";
import { wireDeliveryIntoWorkflows } from "@/lib/funnels/delivery-wiring";
import { kindForContentType } from "@/lib/funnels/delivery";

export const dynamic = "force-dynamic";

/**
 * Operator asset upload for a funnel (Multistep Journey pass): images for
 * section media, and the LEAD MAGNET PDF. A PDF upload additionally wires
 * DELIVERY: the download link is stored on the funnel
 * (`leadMagnetAsset`) and appended (idempotently) to the send_email nodes of
 * every workflow triggered by this funnel's capture form — so the file the
 * visitor signed up for actually arrives in the confirmation email.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });

  // A deliverable arrives one of two ways and is treated identically after
  // this point: a file we store, or a link to media that already exists.
  // Video and audio are referenced because uploads are capped at
  // MAX_ASSET_BYTES (measured), which is right for a document and nowhere
  // near a video. See lib/funnels/delivery.ts.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    let body: { kind?: string; url?: string; title?: string; ctaLabel?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }
    if (body.kind !== "video" && body.kind !== "audio") {
      return NextResponse.json(
        { error: "Only video and audio can be delivered by link. Upload a document instead." },
        { status: 400 },
      );
    }
    let registered: { assetId: string; url: string };
    try {
      registered = await storeExternalAsset({
        subAccountId,
        agencyId: funnel.agencyId,
        funnelId,
        createdByUid: access.uid,
        kind: body.kind,
        url: String(body.url ?? ""),
        title: body.title ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "That link could not be used" },
        { status: 400 },
      );
    }
    const wired = await wireDeliveryIntoWorkflows({
      subAccountId,
      funnelId,
      funnel,
      assetId: registered.assetId,
      kind: body.kind,
      filename: body.title?.slice(0, 200) || (body.kind === "video" ? "Video" : "Audio"),
      ctaLabel: body.ctaLabel ?? null,
    });
    return NextResponse.json({
      assetId: registered.assetId,
      url: registered.url,
      kind: body.kind,
      wiredWorkflows: wired.wiredWorkflows,
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  // AUDIO TAKES A DIFFERENT ROUTE THROUGH THE SAME DOOR. It is stored in
  // Firebase Storage rather than the Firestore chunk table, because audio is
  // read back in full on every play and needs Range support to seek. Same
  // upload for the customer, same asset identity afterwards.
  if (ALLOWED_AUDIO_TYPES[file.type]) {
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error:
            `That audio file is ${(file.size / 1024 / 1024).toFixed(1)}MB. ` +
            `Keep it under ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB, ` +
            `which is roughly 16 minutes at 64kbps or 8 minutes at 128kbps. ` +
            `Exporting spoken-word audio as mono at a lower bitrate is usually enough.`,
        },
        { status: 400 },
      );
    }
    let stored: { assetId: string; url: string };
    try {
      stored = await storeAudioAsset({
        subAccountId,
        agencyId: funnel.agencyId,
        funnelId,
        createdByUid: access.uid,
        contentType: file.type,
        filename: file.name || "audio.mp3",
        bytes: Buffer.from(await file.arrayBuffer()),
        title: (form.get("title") as string | null) ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "That audio file could not be stored" },
        { status: 400 },
      );
    }
    const wired = await wireDeliveryIntoWorkflows({
      subAccountId,
      funnelId,
      funnel,
      assetId: stored.assetId,
      kind: "audio",
      filename: file.name || "audio.mp3",
      ctaLabel: (form.get("ctaLabel") as string | null) ?? null,
    });
    return NextResponse.json({
      assetId: stored.assetId,
      url: stored.url,
      kind: "audio",
      wiredWorkflows: wired.wiredWorkflows,
    });
  }

  if (!ALLOWED_ASSET_TYPES[file.type]) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP images, PDF files and MP3 audio are supported" },
      { status: 400 },
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB limit` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeFunnelAsset({
    subAccountId,
    agencyId: funnel.agencyId,
    funnelId,
    createdByUid: access.uid,
    contentType: file.type,
    filename: file.name || "upload",
    bytes,
  });

  // A document is the lead magnet: record it and wire the follow-up email.
  if (file.type === "application/pdf") {
    await wireDeliveryIntoWorkflows({
      subAccountId,
      funnelId,
      funnel,
      assetId: stored.assetId,
      kind: kindForContentType(file.type),
      filename: file.name || "download.pdf",
    });
  }

  return NextResponse.json({ assetId: stored.assetId, url: stored.url, kind: ALLOWED_ASSET_TYPES[file.type] });
}
