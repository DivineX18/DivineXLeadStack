import { ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/**
 * Upload a digital-product deliverable to Firebase Storage. Client-side,
 * direct upload — the operator is Firebase-authed, so storage.rules'
 * `productFiles/**` write rule (active member/owner of subAccountId)
 * applies. Unlike Community images, this file is PRIVATE: no download
 * URL is returned here. The saved Product doc just carries the storage
 * path; buyers get access via a server-minted signed URL at delivery
 * time (see lib/products/delivery.ts), never this path directly.
 *
 * Path: `productFiles/{subAccountId}/{uploadId}/{fileName}` — `uploadId`
 * is a client-generated random id, independent of the eventual Product
 * doc id (which doesn't exist yet for a brand-new product at upload
 * time). Passing the SAME uploadId again (e.g. re-uploading to replace
 * the file while editing) overwrites the previous object at that path.
 */

export const MAX_PRODUCT_FILE_BYTES = 250 * 1024 * 1024; // 250 MB

export interface UploadedProductFile {
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
}

export async function uploadProductFile(
  file: File,
  subAccountId: string,
  uploadId: string,
): Promise<UploadedProductFile> {
  if (file.size > MAX_PRODUCT_FILE_BYTES) {
    throw new Error(
      `File is too large — keep it under ${MAX_PRODUCT_FILE_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 300) || "file";
  const path = `productFiles/${subAccountId}/${uploadId}/${safeName}`;
  const storageRef = ref(getFirebaseStorage(), path);
  const contentType = file.type || "application/octet-stream";
  await uploadBytes(storageRef, file, { contentType });
  return {
    storagePath: path,
    fileName: file.name,
    sizeBytes: file.size,
    contentType,
  };
}
