import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Product catalog — per sub-account, reusable across quotes and invoices.
 *
 * Tenancy mirrors quotes / contacts: every doc carries `agencyId` +
 * `subAccountId` keys so Firestore rules can gate by sub-account
 * membership.
 *
 * Money is stored as integer cents to avoid floating-point arithmetic.
 * When dropped into a quote/invoice line item, the cents value is
 * converted to whole units (line items use whole units for back-compat
 * with the existing quote schema). The product's name + description +
 * unit price are SNAPSHOTTED onto the line item at the moment of add —
 * editing the product later never mutates historical docs.
 *
 * Archive = soft delete. `active: false` hides the product from the
 * catalog picker but historical line items keep their snapshotted
 * values unchanged. Operator can restore by setting active back to true.
 */

export interface Product {
  id: string;

  // ── Tenancy ───────────────────────────────────────────────────────
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  // ── Catalog fields ───────────────────────────────────────────────
  name: string;
  description: string;
  /** Integer cents in the product's currency. */
  unitPriceCents: number;
  /** ISO 4217. Defaults to "USD". */
  currency: string;
  /** False = archived. Hidden from picker; doesn't affect historical
   *  line items that snapshotted this product earlier. */
  active: boolean;

  // ── Digital delivery ─────────────────────────────────────────────
  /** "none" (default) = a plain quote/invoice line item, no fulfillment.
   *  "file" = a Storage-backed file is attached; when a quote/invoice
   *  carrying this product on a line item is marked paid, the buyer's
   *  contact gets an automated email with a secure, expiring download
   *  link. See lib/products/delivery.ts. */
  deliveryType: "none" | "file";
  /** Firebase Storage path, e.g. `productFiles/{subAccountId}/{uploadId}/{fileName}`.
   *  Null when deliveryType is "none". */
  fileStoragePath: string | null;
  /** Original filename, shown to the buyer + used as the download's
   *  suggested filename. */
  fileName: string | null;
  fileSizeBytes: number | null;
  fileContentType: string | null;

  // ── Audit ────────────────────────────────────────────────────────
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const DEFAULT_PRODUCT: Omit<
  Product,
  "id" | "agencyId" | "subAccountId" | "createdByUid" | "createdAt" | "updatedAt"
> = {
  name: "",
  description: "",
  unitPriceCents: 0,
  currency: "USD",
  active: true,
  deliveryType: "none",
  fileStoragePath: null,
  fileName: null,
  fileSizeBytes: null,
  fileContentType: null,
};
