import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES, storeFunnelAsset } from "@/lib/funnels/assets";

export const dynamic = "force-dynamic";

/**
 * SHARED WORKSPACE MEDIA.
 *
 * A customer must never have to go host an image somewhere else just to put it
 * on their own page. This is the one upload+list surface every Create surface
 * uses, so an image uploaded for a funnel is reusable later by social posts,
 * emails and anything else — one library, not per-feature silos.
 *
 * Storage is the EXISTING chunked funnelAssets store (lib/funnels/assets.ts)
 * and the existing /api/funnel-asset/[id] serve route. Nothing new was built
 * for persistence; this only widens who can reach it. `funnelId` on the stored
 * doc becomes provenance ("first used here") rather than an ownership fence —
 * tenancy is and always was subAccountId.
 */

const LIST_LIMIT = 60;

/** The workspace's uploaded media, newest first. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection("funnelAssets")
    .where("subAccountId", "==", subAccountId)
    .limit(200)
    .get();

  const items = snap.docs
    .map((d) => d.data() as { id: string; kind: string; filename: string; sizeBytes: number; contentType: string; createdAt?: { toMillis?: () => number } | Date })
    .map((a) => ({
      assetId: a.id,
      url: `/api/funnel-asset/${a.id}`,
      kind: a.kind,
      filename: a.filename,
      sizeBytes: a.sizeBytes,
      contentType: a.contentType,
      createdAt:
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : typeof a.createdAt?.toMillis === "function"
            ? a.createdAt.toMillis()
            : 0,
    }))
    .sort((x, y) => y.createdAt - x.createdAt)
    .slice(0, LIST_LIMIT);

  return NextResponse.json({ media: items });
}

/** Upload one file into the workspace library. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  // MIME and extension are checked together: a .png that declares itself
  // application/octet-stream, or an .exe declaring image/png, both fail.
  const kind = ALLOWED_ASSET_TYPES[file.type];
  const extOk = /\.(jpe?g|png|webp|pdf)$/i.test(file.name || "");
  if (!kind || !extOk) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WebP images and PDF files are supported." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json({ error: "That file is larger than 10MB." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const funnelId = typeof form.get("funnelId") === "string" ? String(form.get("funnelId")) : "";

  const stored = await storeFunnelAsset({
    subAccountId,
    agencyId: (subSnap.data()?.agencyId as string) ?? "",
    // Provenance only — the asset belongs to the workspace, not the funnel.
    funnelId: funnelId || "library",
    createdByUid: access.uid,
    contentType: file.type,
    filename: file.name || "upload",
    bytes: Buffer.from(await file.arrayBuffer()),
  });

  return NextResponse.json(
    { assetId: stored.assetId, url: stored.url, kind, filename: file.name || "upload" },
    { status: 201 },
  );
}
