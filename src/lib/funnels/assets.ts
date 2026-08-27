import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

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
export const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10MB

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
  kind: "image" | "pdf";
  contentType: string;
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
