/**
 * Upload a digital-product deliverable. Proxies through
 * POST /api/sub-accounts/[id]/products/upload-file (Admin SDK write on the
 * server) rather than a client-direct Firebase Storage upload — see that
 * route's doc comment for why. The file is PRIVATE: no download URL comes
 * back here. The saved Product doc just carries the storage path; buyers
 * get access via a server-minted signed URL at delivery time (see
 * lib/products/delivery.ts), never this path directly.
 */

// Serverless request-body ceiling (Vercel default ~4.5 MB) rather than the
// original 250 MB client-direct-upload design — see the route's doc
// comment. Set with a small safety margin under the platform default.
export const MAX_PRODUCT_FILE_BYTES = 4 * 1024 * 1024;

export interface UploadedProductFile {
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
}

export async function uploadProductFile(
  file: File,
  subAccountId: string,
): Promise<UploadedProductFile> {
  if (file.size > MAX_PRODUCT_FILE_BYTES) {
    throw new Error(
      `File is too large — keep it under ${MAX_PRODUCT_FILE_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `/api/sub-accounts/${subAccountId}/products/upload-file`,
    { method: "POST", body: form },
  );
  const data = (await res.json().catch(() => ({}))) as
    | UploadedProductFile & { ok: true }
    | { ok?: false; error?: string };
  if (!res.ok || !("storagePath" in data)) {
    throw new Error(
      ("error" in data && data.error) || "Upload failed.",
    );
  }
  return {
    storagePath: data.storagePath,
    fileName: data.fileName,
    sizeBytes: data.sizeBytes,
    contentType: data.contentType,
  };
}
