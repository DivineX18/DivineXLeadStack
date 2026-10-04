import "server-only";

import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";

/**
 * Funnel asset storage (Multistep Journey pass, increment 1) — operator-
 * uploaded images and lead-magnet PDFs, stored CHUNKED IN FIRESTORE and
 * served through a public route.
 *
 * Why Firestore and not Firebase Storage: the same reasoning as the PWA
 * app-icon feature (see CLAUDE.md) — this is a white-label product and a
 * storage bucket + storage rules would be a brand-new setup surface for every
 * buyer's deployment. Chunked Firestore docs (~700KB of base64 per chunk,
 * 10MB total cap) need zero new configuration and work on every deployment
 * out of the box. Firebase Storage remains the later upgrade path if asset
 * volume ever demands it.
 *
 * Data model:
 *   funnelAssets/{assetId}            — metadata + tenancy (server-only)
 *   funnelAssets/{assetId}/chunks/{n} — { data: base64 }
 *
 * The assetId is a Firestore auto-id (20 chars, unguessable) — the public
 * serve URL is effectively a capability token, the standard lead-magnet
 * delivery model.
 */

const CHUNK_BYTES = 700_000; // base64 of this stays under the 1MB doc limit

/**
 * 5MB, and it is a MEASURED limit, not a chosen one.
 *
 * This was 10MB, which the platform in front of this app does not accept. A
 * PDF upload was reproduced against the real deployment at increasing sizes:
 * 8MB succeeded (in 18.6s), 8.4MB came back 502 with an HTML error page, 9MB
 * had the connection terminated mid-body, 10MB came back 502 HTML. The body
 * is rejected before the route ever runs, so nothing in this file could have
 * caught it and returned a real error.
 *
 * That HTML is what the operator actually saw: the builder posted the file,
 * got `<!DOCTYPE html>` back, called response.json() on it, and surfaced
 * "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" as the upload
 * error message.
 *
 * 5MB sits well clear of the ~8.4MB cliff and uploads in about 11s server
 * side, leaving room for a slow connection. Raising it again means measuring
 * again, not editing this number. See scripts/verify-funnel-runtime.mts.
 */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/**
 * Kinds an asset document can describe.
 *
 * "image" and "pdf" hold their bytes in the chunks subcollection. "video"
 * and "audio" hold a URL instead: uploads are capped at MAX_ASSET_BYTES
 * (measured, see above) which is fine for a PDF and nowhere near a video, so
 * a media deliverable records where it already lives and is played on a
 * branded page rather than being hosted here. Both are the same kind of
 * thing to everything downstream, a funnelAssets id, which is what lets an
 * automation keep working when storage or deployment changes.
 */
export type FunnelAssetKind = "image" | "pdf" | "video" | "audio";

/**
 * Audio uploads go to Firebase Storage, NOT the chunk table above.
 *
 * Chunking a meditation into Firestore would be wrong twice. The bytes are
 * read back in full on every single play, so a 6MB file is ~9MB of base64
 * across a dozen documents buffered into server memory per listener, and
 * that route answers with the whole body: no Range support, which is what
 * an <audio> element needs to seek. Storage serves a signed URL with
 * ranges natively, costs no request memory, and is already the proven path
 * for digital-product files on this deployment.
 */
const AUDIO_PREFIX = "funnelAudio";

/** MP3 is the format this exists for. The others ride along only because
 *  they cost nothing extra: the bytes are opaque to us either way. */
export const ALLOWED_AUDIO_TYPES: Record<string, true> = {
  "audio/mpeg": true,
  "audio/mp3": true,
  "audio/mp4": true,
  "audio/x-m4a": true,
  "audio/wav": true,
  "audio/x-wav": true,
};

/**
 * 8MB, and like MAX_ASSET_BYTES it is the PLATFORM's number rather than a
 * preference. The file is proxied through this server in one request (see
 * the products upload route for why client-direct was abandoned on this
 * project), so the serverless body ceiling caps it. The measured cliff on
 * this deployment is ~8.4MB.
 *
 * What that buys, for spoken-word audio: about 16 minutes at 64kbps mono,
 * 11 at 96kbps, 8 at 128kbps stereo. A 30-minute file at a high bitrate
 * does NOT fit and cannot, without client-direct upload.
 */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export const ALLOWED_ASSET_TYPES: Record<string, "image" | "pdf"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
};

export interface FunnelAssetMeta {
  id: string;
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  kind: FunnelAssetKind;
  contentType: string;
  /** Set only for referenced media. Never shown to a recipient. */
  externalUrl?: string | null;
  /** Set only for UPLOADED audio: the object in Firebase Storage. Never
   *  shown to a recipient; a signed URL is minted per request. */
  storagePath?: string | null;
  /** What the operator called it, shown on the branded player. */
  title?: string | null;
  filename: string;
  sizeBytes: number;
  chunkCount: number;
  createdByUid: string;
  createdAt: unknown;
}

export async function storeFunnelAsset(opts: {
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  createdByUid: string;
  contentType: string;
  filename: string;
  bytes: Buffer;
}): Promise<{ assetId: string; url: string }> {
  const kind = ALLOWED_ASSET_TYPES[opts.contentType];
  if (!kind) throw new Error(`Unsupported type: ${opts.contentType}`);
  if (opts.bytes.length > MAX_ASSET_BYTES) throw new Error("File exceeds the 10MB limit");
  if (opts.bytes.length === 0) throw new Error("Empty file");

  const db = getAdminDb();
  const ref = db.collection("funnelAssets").doc();
  const chunkCount = Math.ceil(opts.bytes.length / CHUNK_BYTES);

  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    funnelId: opts.funnelId,
    kind,
    contentType: opts.contentType,
    filename: opts.filename.slice(0, 200),
    sizeBytes: opts.bytes.length,
    chunkCount,
    createdByUid: opts.createdByUid,
    createdAt: new Date(),
  });
  for (let i = 0; i < chunkCount; i++) {
    batch.set(ref.collection("chunks").doc(String(i)), {
      data: opts.bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).toString("base64"),
    });
  }
  await batch.commit();
  return { assetId: ref.id, url: `/api/funnel-asset/${ref.id}` };
}

export async function readFunnelAsset(
  assetId: string,
): Promise<{ meta: FunnelAssetMeta; bytes: Buffer } | null> {
  const db = getAdminDb();
  const snap = await db.doc(`funnelAssets/${assetId}`).get();
  if (!snap.exists) return null;
  const meta = snap.data() as FunnelAssetMeta;
  // Storage-backed and referenced assets keep no chunks; reading the empty
  // subcollection would be a wasted round trip on every play.
  if (meta.storagePath || meta.externalUrl) return { meta, bytes: Buffer.alloc(0) };
  const chunks = await db.collection(`funnelAssets/${assetId}/chunks`).get();
  const ordered = chunks.docs
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((d) => Buffer.from((d.data() as { data: string }).data, "base64"));
  const bytes = Buffer.concat(ordered);
  if (bytes.length !== meta.sizeBytes) return null; // partial/corrupt write
  return { meta, bytes };
}

export async function deleteFunnelAsset(subAccountId: string, assetId: string): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.doc(`funnelAssets/${assetId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return false;
  const chunks = await ref.collection("chunks").get();
  const batch = db.batch();
  for (const d of chunks.docs) batch.delete(d.ref);
  batch.delete(ref);
  await batch.commit();
  return true;
}


/**
 * Records a video or audio deliverable that already lives somewhere else.
 *
 * No bytes are copied. The point is to give a referenced deliverable the
 * SAME identity an uploaded one has, an unguessable funnelAssets id, so the
 * email, the player and every integrity check treat the two alike and the
 * provider's URL stays server-side.
 */
export async function storeExternalAsset(opts: {
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  createdByUid: string;
  kind: "video" | "audio";
  url: string;
  title?: string | null;
}): Promise<{ assetId: string; url: string }> {
  const url = opts.url.trim();
  // Only https, and nothing that could become script or a local probe. This
  // value is rendered into a player, so it is an injection surface.
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) {
    throw new Error("A video or audio link must be a full https:// URL");
  }
  const db = getAdminDb();
  const ref = db.collection("funnelAssets").doc();
  await ref.set({
    id: ref.id,
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    funnelId: opts.funnelId,
    kind: opts.kind,
    contentType: opts.kind === "video" ? "video/*" : "audio/*",
    filename: (opts.title ?? "").slice(0, 200) || (opts.kind === "video" ? "Video" : "Audio"),
    title: (opts.title ?? "").slice(0, 200) || null,
    externalUrl: url,
    sizeBytes: 0,
    chunkCount: 0,
    createdByUid: opts.createdByUid,
    createdAt: new Date(),
  });
  return { assetId: ref.id, url: `/d/${ref.id}` };
}

/** Metadata only, with no chunk reads. Used by the branded player. */
export async function readFunnelAssetMeta(assetId: string): Promise<FunnelAssetMeta | null> {
  const snap = await getAdminDb().doc(`funnelAssets/${assetId}`).get();
  return snap.exists ? (snap.data() as FunnelAssetMeta) : null;
}


/**
 * Stores an uploaded audio file and gives it the same asset identity
 * everything else already understands.
 *
 * The bytes live in Storage under a workspace-scoped path; the Firestore
 * doc carries only metadata and that path, so nothing downstream has to
 * learn a second kind of asset.
 */
export async function storeAudioAsset(opts: {
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  createdByUid: string;
  contentType: string;
  filename: string;
  bytes: Buffer;
  title?: string | null;
}): Promise<{ assetId: string; url: string }> {
  if (!ALLOWED_AUDIO_TYPES[opts.contentType]) {
    throw new Error(`Unsupported audio type: ${opts.contentType}`);
  }
  if (opts.bytes.length === 0) throw new Error("Empty file");
  if (opts.bytes.length > MAX_AUDIO_BYTES) {
    throw new Error(`Audio exceeds the ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB limit`);
  }

  const db = getAdminDb();
  const ref = db.collection("funnelAssets").doc();
  // Workspace-scoped so an object can never be mistaken for another
  // tenant's, and the id makes it unguessable in the bucket too.
  const storagePath = `${AUDIO_PREFIX}/${opts.subAccountId}/${ref.id}`;

  await getAdminStorageBucket().file(storagePath).save(opts.bytes, {
    resumable: false,
    metadata: { contentType: opts.contentType },
  });

  await ref.set({
    id: ref.id,
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    funnelId: opts.funnelId,
    kind: "audio",
    contentType: opts.contentType,
    filename: opts.filename.slice(0, 200),
    title: (opts.title ?? "").slice(0, 200) || null,
    storagePath,
    sizeBytes: opts.bytes.length,
    chunkCount: 0,
    createdByUid: opts.createdByUid,
    createdAt: new Date(),
  });
  return { assetId: ref.id, url: `/d/${ref.id}` };
}

/**
 * A short-lived signed URL for a Storage-backed asset.
 *
 * Minted per request and never stored, so the bucket path is not a durable
 * public credential. The branded route redirects to it rather than piping
 * the bytes, which is what gives the player working seek.
 */
export async function signedAudioUrl(meta: FunnelAssetMeta): Promise<string | null> {
  if (!meta.storagePath) return null;
  try {
    const [url] = await getAdminStorageBucket()
      .file(meta.storagePath)
      .getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return url;
  } catch (err) {
    console.error("[funnel-assets] signed audio URL failed", { id: meta.id, err });
    return null;
  }
}
