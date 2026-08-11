import type { Product } from "@/types/products";

/**
 * Shared product-payload sanitizer for the products create + update routes.
 *
 * Lives in lib/ (not in a route.ts) because Next 15 forbids non-handler
 * exports from route files — the `[productId]` route needs to reuse this, so
 * it can't hang off the collection route's module.
 */

export interface CreateProductPayload {
  name?: string;
  description?: string;
  unitPriceCents?: number;
  currency?: string;
  active?: boolean;
  deliveryType?: "none" | "file";
  fileStoragePath?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  fileContentType?: string | null;
}

export function sanitizeProductPayload(
  body: CreateProductPayload,
): Partial<Product> {
  const out: Partial<Product> = {};

  if (typeof body.name === "string") {
    out.name = body.name.trim().slice(0, 200);
  }
  if (typeof body.description === "string") {
    out.description = body.description.trim().slice(0, 2_000);
  }
  if (
    typeof body.unitPriceCents === "number" &&
    Number.isFinite(body.unitPriceCents)
  ) {
    out.unitPriceCents = Math.max(0, Math.round(body.unitPriceCents));
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    out.currency = body.currency.trim().toUpperCase().slice(0, 3);
  }
  if (typeof body.active === "boolean") {
    out.active = body.active;
  }

  if (body.deliveryType === "none" || body.deliveryType === "file") {
    out.deliveryType = body.deliveryType;
    // Clearing delivery back to "none" drops any attached file metadata
    // too — the Storage object itself is left in place (no delete-on-
    // change plumbing in v1; an orphaned file costs nothing to leave).
    if (body.deliveryType === "none") {
      out.fileStoragePath = null;
      out.fileName = null;
      out.fileSizeBytes = null;
      out.fileContentType = null;
    }
  }
  if (body.fileStoragePath === null || typeof body.fileStoragePath === "string") {
    out.fileStoragePath = body.fileStoragePath?.trim().slice(0, 1_000) || null;
  }
  if (body.fileName === null || typeof body.fileName === "string") {
    out.fileName = body.fileName?.trim().slice(0, 300) || null;
  }
  if (
    body.fileSizeBytes === null ||
    (typeof body.fileSizeBytes === "number" && Number.isFinite(body.fileSizeBytes))
  ) {
    out.fileSizeBytes =
      typeof body.fileSizeBytes === "number"
        ? Math.max(0, Math.round(body.fileSizeBytes))
        : null;
  }
  if (body.fileContentType === null || typeof body.fileContentType === "string") {
    out.fileContentType = body.fileContentType?.trim().slice(0, 200) || null;
  }

  return out;
}
