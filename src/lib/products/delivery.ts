import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import { renderProductDeliveryEmail, type DeliveryLink } from "@/lib/products/delivery-email";
import {
  buildDeliveryUrl,
  issueProductDeliveryToken,
  verifyProductDeliveryToken,
} from "@/lib/products/delivery-token";
import type { Quote } from "@/types/quotes";
import type { Product } from "@/types/products";
import type { ProductDelivery } from "@/types/product-deliveries";
import type { SubAccountDoc } from "@/types";

/**
 * Automated digital-product fulfillment. Called from
 * lib/quotes/lifecycle.ts::markQuotePaid() — the single "flip a
 * quote/invoice to paid" chokepoint — so it fires identically whether
 * the operator clicked "Mark as paid" or a Stripe webhook did it.
 *
 * Best-effort: never throws. A delivery failure must not undo the
 * payment or block the rest of the paid-lifecycle side-effects. Skips
 * silently (no email sent) when the quote has no file-delivery
 * products on it — the common case for most quotes/invoices.
 *
 * Does NOT cover Funnel Checkout — that system prices its own line
 * items independent of the Products catalog (materialize-price.ts
 * mints its own Stripe Price/Product) and has no productId linkage
 * today. Out of scope for this pass; noted, not silently dropped.
 */

const TOKEN_TTL_DAYS = 30;
const SIGNED_URL_TTL_MINUTES = 15;

export interface DeliverDigitalProductsResult {
  delivered: number;
  reason?: string;
}

export async function deliverDigitalProductsForQuote(
  quote: Pick<
    Quote,
    "id" | "agencyId" | "subAccountId" | "contactId" | "lineItems" | "quoteNumber"
  >,
): Promise<DeliverDigitalProductsResult> {
  try {
    const productIds = Array.from(
      new Set(
        quote.lineItems
          .map((li) => li.productId)
          .filter((id): id is string => !!id),
      ),
    );
    if (productIds.length === 0) return { delivered: 0, reason: "no_products" };

    const db = getAdminDb();
    const productSnaps = await Promise.all(
      productIds.map((id) => db.doc(`products/${id}`).get()),
    );
    const fileProducts = productSnaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as Omit<Product, "id">) }))
      .filter((p) => p.subAccountId === quote.subAccountId && p.deliveryType === "file" && p.fileStoragePath);

    if (fileProducts.length === 0) return { delivered: 0, reason: "no_file_products" };

    if (!emailIsConfigured()) {
      console.warn("[products/delivery] email not configured — skipping delivery for", quote.id);
      return { delivered: 0, reason: "email_not_configured" };
    }

    const [contactSnap, subSnap] = await Promise.all([
      db.doc(`contacts/${quote.contactId}`).get(),
      db.doc(`subAccounts/${quote.subAccountId}`).get(),
    ]);
    const contact = contactSnap.exists
      ? (contactSnap.data() as { email?: string; name?: string })
      : null;
    const recipientEmail = contact?.email?.trim();
    if (!recipientEmail) {
      console.warn("[products/delivery] contact has no email — skipping delivery for", quote.id);
      return { delivered: 0, reason: "no_contact_email" };
    }
    const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;

    const links: DeliveryLink[] = [];
    for (const product of fileProducts) {
      const deliveryRef = db.collection("productDeliveries").doc();
      const { token, hash } = issueProductDeliveryToken(deliveryRef.id);
      const expiresAt = Timestamp.fromMillis(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      const delivery: Omit<ProductDelivery, "id"> = {
        agencyId: quote.agencyId,
        subAccountId: quote.subAccountId,
        contactId: quote.contactId,
        productId: product.id,
        productName: product.name,
        fileStoragePath: product.fileStoragePath!,
        fileName: product.fileName || product.name,
        sourceType: "quote",
        sourceId: quote.id,
        downloadTokenHash: hash,
        expiresAt,
        downloadCount: 0,
        lastDownloadAt: null,
        createdAt: FieldValue.serverTimestamp(),
      };
      await deliveryRef.set(delivery);
      const url = buildDeliveryUrl(token);
      if (!url) {
        console.warn("[products/delivery] NEXT_PUBLIC_APP_URL not configured — link omitted");
        continue;
      }
      links.push({
        productName: product.name,
        fileName: product.fileName || product.name,
        downloadUrl: url,
      });
    }

    if (links.length === 0) return { delivered: 0, reason: "no_links_built" };

    const email = renderProductDeliveryEmail({
      businessName: sub?.name || "Your business",
      businessLogoUrl: sub?.logoUrl ?? null,
      recipientName: contact?.name?.trim() || "",
      quoteNumber: quote.quoteNumber,
      links,
    });
    await sendEmail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      from: tenantFrom(sub),
    });

    return { delivered: links.length };
  } catch (err) {
    console.error("[products/delivery] delivery failed", err);
    return { delivered: 0, reason: "error" };
  }
}

export type ResolveDownloadResult =
  | { ok: true; signedUrl: string; fileName: string }
  | { ok: false; status: 404 | 410; message: string };

/**
 * Resolve a presented download token into a fresh, short-lived signed
 * Storage URL. Called by the public GET /api/dl/[token] route. Verifies
 * the token, loads the delivery doc, checks the token-window expiry,
 * mints a signed URL (much shorter TTL than the token itself — a new
 * one is minted on every click), and bumps downloadCount best-effort.
 */
export async function resolveProductDownload(
  token: string,
): Promise<ResolveDownloadResult> {
  const parsed = verifyProductDeliveryToken(token);
  if (!parsed) return { ok: false, status: 404, message: "Invalid download link." };

  const db = getAdminDb();
  const ref = db.collection("productDeliveries").doc(parsed.deliveryId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, message: "Download not found." };
  const delivery = snap.data() as Omit<ProductDelivery, "id">;
  if (delivery.downloadTokenHash !== parsed.hash) {
    return { ok: false, status: 404, message: "Invalid download link." };
  }
  const expiresAtMs = expiryToMillis(delivery.expiresAt);
  if (expiresAtMs !== null && expiresAtMs < Date.now()) {
    return { ok: false, status: 410, message: "This download link has expired." };
  }

  try {
    const bucket = getAdminStorageBucket();
    const file = bucket.file(delivery.fileStoragePath);
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_URL_TTL_MINUTES * 60 * 1000,
      responseDisposition: `attachment; filename="${sanitizeFilename(delivery.fileName)}"`,
    });
    void ref
      .update({
        downloadCount: FieldValue.increment(1),
        lastDownloadAt: FieldValue.serverTimestamp(),
      })
      .catch((err) => console.warn("[products/delivery] download-count bump failed", err));
    return { ok: true, signedUrl, fileName: delivery.fileName };
  } catch (err) {
    console.error("[products/delivery] signed URL mint failed", err);
    return { ok: false, status: 404, message: "This file is no longer available." };
  }
}

function expiryToMillis(v: unknown): number | null {
  const maybe = v as { toMillis?: () => number } | null | undefined;
  return maybe && typeof maybe.toMillis === "function" ? maybe.toMillis() : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\\]/g, "_");
}
