import type { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * One row per (contact, product) grant issued when a quote/invoice
 * carrying a file-delivery product is marked paid. Server-only — never
 * read or written from the client. The raw download token is never
 * persisted, only its SHA-256 hash (`downloadTokenHash`), same
 * discipline as `quotes.publicTokenHash`.
 */
export interface ProductDelivery {
  id: string;

  agencyId: string;
  subAccountId: string;
  contactId: string;

  productId: string;
  /** Snapshotted at grant time — a later product rename/edit doesn't
   *  change what an already-sent delivery email says. */
  productName: string;
  fileStoragePath: string;
  fileName: string;

  sourceType: "quote" | "invoice";
  sourceId: string;

  downloadTokenHash: string;
  /** Access window for the token itself (not the signed URL, which is
   *  minted fresh and much shorter-lived on each click). */
  expiresAt: Timestamp | FieldValue;

  downloadCount: number;
  lastDownloadAt: Timestamp | FieldValue | null;

  createdAt: Timestamp | FieldValue;
}
