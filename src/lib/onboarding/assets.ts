import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { recordOnboardingEvent } from "@/lib/server/client-onboarding-service";
import type { ClientOnboardingDoc, OnboardingAssetDoc } from "@/types/client-onboarding";

/**
 * Client asset uploads.
 *
 * STRAIGHT TO STORAGE, NEVER THROUGH THE APP. This is the same v4 signed-URL
 * path the funnel audio upload uses, and for the same measured reason: this
 * platform rejects a request body somewhere around 4.5MB, before any route
 * runs, returning an HTML error page. A client uploading a brand-guidelines
 * PDF or a folder of photography would hit that constantly.
 *
 * The signed URL is bound to a content type and a server-chosen path, and the
 * file is verified by reading its real size and type back from Storage after
 * the PUT. Nothing the caller claims about the upload is trusted.
 */

const PREFIX = "onboardingAssets";
const MAX_BYTES = 50 * 1024 * 1024;

/** Deliberately conservative. Everything here is something a client is
 *  plausibly handing an agency; executables and archives are not. */
export const ALLOWED_ASSET_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif",
  "application/pdf",
  "video/mp4", "video/quicktime",
  "audio/mpeg", "audio/mp4",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

export function assetLimitsText(): string {
  return `Images, PDFs, documents, video and audio up to ${Math.round(MAX_BYTES / 1024 / 1024)}MB each.`;
}

export async function mintOnboardingUploadUrl(opts: {
  onboardingId: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ assetId: string; uploadUrl: string } | { error: string }> {
  if (!ALLOWED_ASSET_TYPES.includes(opts.contentType)) {
    return { error: `We can't accept ${opts.contentType || "that file type"}. ${assetLimitsText()}` };
  }
  if (!Number.isFinite(opts.sizeBytes) || opts.sizeBytes <= 0) {
    return { error: "That file looks empty." };
  }
  if (opts.sizeBytes > MAX_BYTES) {
    return {
      error: `That file is ${(opts.sizeBytes / 1024 / 1024).toFixed(1)}MB, over the ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.`,
    };
  }
  const assetId = getAdminDb().collection("onboardingAssetIds").doc().id;
  const [uploadUrl] = await getAdminStorageBucket()
    .file(`${PREFIX}/${opts.onboardingId}/${assetId}`)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: opts.contentType,
    });
  return { assetId, uploadUrl };
}

/**
 * Register what actually landed.
 *
 * Size and type are read back from Storage, not taken from the client. An
 * object that is missing, oversized or of a type we do not accept is DELETED
 * rather than registered, so a refused upload cannot sit in the bucket costing
 * money and waiting to be referenced by something later.
 */
export async function finalizeOnboardingAsset(opts: {
  onboarding: ClientOnboardingDoc;
  assetId: string;
  key: string;
  filename: string;
  uploadedBy: string;
}): Promise<{ ok: true; asset: OnboardingAssetDoc } | { ok: false; error: string }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opts.assetId)) return { ok: false, error: "Unknown upload." };
  const path = `${PREFIX}/${opts.onboarding.id}/${opts.assetId}`;
  const file = getAdminStorageBucket().file(path);

  const [exists] = await file.exists();
  if (!exists) return { ok: false, error: "That upload didn't arrive. Try again." };

  const [meta] = await file.getMetadata();
  const sizeBytes = Number(meta.size ?? 0);
  const contentType = String(meta.contentType ?? "");

  if (!ALLOWED_ASSET_TYPES.includes(contentType) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    await file.delete().catch(() => {});
    return { ok: false, error: `That file can't be accepted. ${assetLimitsText()}` };
  }

  const doc: Omit<OnboardingAssetDoc, "id"> = {
    key: opts.key.slice(0, 60) || "other",
    filename: opts.filename.slice(0, 200) || "upload",
    contentType,
    sizeBytes,
    storagePath: path,
    uploadedAt: FieldValue.serverTimestamp(),
    uploadedBy: opts.uploadedBy,
  };
  await getAdminDb()
    .doc(`clientOnboardings/${opts.onboarding.id}/assets/${opts.assetId}`)
    .set(doc);

  await recordOnboardingEvent({
    onboardingId: opts.onboarding.id,
    agencyId: opts.onboarding.agencyId,
    type: "onboarding.asset.uploaded",
    actor: opts.uploadedBy,
    detail: `${doc.filename} uploaded for "${doc.key}".`,
  });

  return { ok: true, asset: { id: opts.assetId, ...doc } };
}

/** Short-lived read URL. Assets are never public. */
export async function signedAssetUrl(storagePath: string): Promise<string | null> {
  try {
    const [url] = await getAdminStorageBucket()
      .file(storagePath)
      .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
    return url;
  } catch {
    return null;
  }
}

export async function listOnboardingAssets(onboardingId: string): Promise<OnboardingAssetDoc[]> {
  const snap = await getAdminDb().collection(`clientOnboardings/${onboardingId}/assets`).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OnboardingAssetDoc, "id">) }));
}
