import { NextResponse } from "next/server";
import { requireSubAccountMember, type SubAccountAccess } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getFunnel } from "@/lib/server/funnels-service";
import { finalizeDirectAudioAsset, mintAudioUploadUrl } from "@/lib/funnels/assets";
import { wireDeliveryIntoWorkflows } from "@/lib/funnels/delivery-wiring";
import { AUDIO_MIME_TYPES, MAX_AUDIO_DIRECT_BYTES } from "@/lib/funnels/asset-limits";

export const dynamic = "force-dynamic";

/**
 * DIRECT AUDIO UPLOAD, BECAUSE A MEDITATION DOES NOT FIT THROUGH A REQUEST.
 *
 * Every other asset is posted to this server and written with the Admin
 * SDK. That caps a file at roughly 4.5MB, where the platform rejects a
 * request body, and an ordinary ten-minute meditation is 15MB. Raising the
 * number cannot help: the limit is the request, not the storage.
 *
 * So the bytes skip this server. POST authorises the caller the ordinary
 * way and returns a short-lived signed URL for ONE exact object; the
 * browser PUTs straight to Cloud Storage; PATCH then confirms what actually
 * landed and registers it as a deliverable.
 *
 * THIS IS NOT THE CLIENT-DIRECT UPLOAD THIS PROJECT ABANDONED. That one
 * leaned on storage.rules evaluating a cross-service firestore.get() to
 * check membership, which proved unreliable here across two buckets in two
 * regions. A signed URL consults no rules at all: this route decides who
 * may upload, using the same requireSubAccountMember as everywhere else,
 * and the URL it mints can write one path, with one content type, for
 * fifteen minutes.
 *
 * THE CLIENT IS NOT BELIEVED ABOUT SIZE. A declared size only decides
 * whether to mint a URL, because a signed PUT cannot enforce a length.
 * PATCH reads the object's real size back from Storage and deletes it if it
 * is over the ceiling, so a rejected upload leaves nothing behind.
 */

type FunnelDocType = NonNullable<Awaited<ReturnType<typeof getFunnel>>>;
type Guard =
  | { error: NextResponse; access?: undefined; funnel?: undefined }
  | { error?: undefined; access: SubAccountAccess; funnel: FunnelDocType };

async function guard(request: Request, subAccountId: string, funnelId: string): Promise<Guard> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return { error: access } as const;
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (snap.data()?.funnelsEnabledByAgency !== true) {
    return {
      error: NextResponse.json(
        { error: "Funnels aren't enabled for this workspace. Ask your agency owner." },
        { status: 403 },
      ),
    };
  }
  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) {
    return { error: NextResponse.json({ error: "Funnel not found" }, { status: 404 }) };
  }
  return { access, funnel };
}

/** POST - authorise, then mint a signed URL for one object. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const g = await guard(request, subAccountId, funnelId);
  if (g.error) return g.error;

  let body: { contentType?: string; sizeBytes?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const contentType = String(body.contentType ?? "");
  if (!(AUDIO_MIME_TYPES as readonly string[]).includes(contentType)) {
    return NextResponse.json(
      { error: "Only MP3, M4A and WAV audio can be uploaded this way." },
      { status: 400 },
    );
  }
  const sizeBytes = Number(body.sizeBytes ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (sizeBytes > MAX_AUDIO_DIRECT_BYTES) {
    return NextResponse.json(
      {
        error:
          `That file is ${(sizeBytes / 1024 / 1024).toFixed(1)}MB. ` +
          `Keep it under ${Math.round(MAX_AUDIO_DIRECT_BYTES / 1024 / 1024)}MB.`,
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await mintAudioUploadUrl({ subAccountId, contentType }));
  } catch (err) {
    console.error("[funnel-assets/direct] mint failed", err);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }
}

/** PATCH - confirm what landed and register it as a deliverable. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const g = await guard(request, subAccountId, funnelId);
  if (g.error) return g.error;

  let body: { assetId?: string; filename?: string; title?: string; ctaLabel?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const assetId = String(body.assetId ?? "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(assetId)) {
    return NextResponse.json({ error: "Missing upload reference" }, { status: 400 });
  }

  let registered: { assetId: string; url: string };
  try {
    registered = await finalizeDirectAudioAsset({
      assetId,
      subAccountId,
      agencyId: g.funnel.agencyId,
      funnelId,
      createdByUid: g.access.uid,
      filename: body.filename ?? "audio.mp3",
      title: body.title ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "That upload could not be completed." },
      { status: 400 },
    );
  }

  const wired = await wireDeliveryIntoWorkflows({
    subAccountId,
    funnelId,
    funnel: g.funnel,
    assetId: registered.assetId,
    kind: "audio",
    filename: body.filename ?? "audio.mp3",
    ctaLabel: body.ctaLabel ?? null,
  });
  return NextResponse.json({
    assetId: registered.assetId,
    url: registered.url,
    kind: "audio",
    wiredWorkflows: wired.wiredWorkflows,
  });
}
