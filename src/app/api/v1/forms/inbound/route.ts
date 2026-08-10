import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import {
  parseInboundLeadCreate,
  serializeContactForApi,
} from "@/lib/api/serializers/contacts";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Generic inbound-lead capture for external site/form builders that
 * aren't a Flow-hosted form — WordPress, Squarespace, Wix, or a
 * hand-built page (Lovable/Replit/etc). Unlike
 * `POST /api/v1/forms/:formId/submissions`, this does NOT require a
 * pre-built Flow form document with `mapsTo` field configuration — the
 * caller sends well-known flat field names directly, so a WordPress
 * plugin's webhook (or a small snippet) can map its own arbitrary field
 * layout into this shape with zero setup on the Flow side.
 *
 *   POST /api/v1/forms/inbound
 *   Body: { name?, first_name?, last_name?, email?, phone?, company?,
 *           message?, source?, tags?, page_url? }
 *
 * At least one of name (or first_name/last_name) / email / phone must
 * resolve to something non-empty.
 *
 * Auth: `forms-ingest` scope — write-only, safe to embed client-side.
 * Same CORS-open contract as the formId-scoped submissions endpoint.
 *
 * Behaviour:
 *   - Creates a Contact (mode-tagged). `source` defaults to
 *     "external-form" when the caller doesn't set one.
 *   - `message` (if present) becomes a Note on the contact — there's no
 *     first-class "form message" field on Contact.
 *   - Fires the `contact.created` workflow trigger + webhook event, live
 *     mode only (mirrors POST /api/v1/contacts).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Idempotency-Key, LeadStack-Version",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function applyCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

const DEFAULT_SOURCE = "external-form";

export const POST = withApiAuth(
  async ({ body, ctx }) => {
    const parsed = parseInboundLeadCreate(body);
    if (!parsed.ok) {
      return applyCors(
        apiError(ctx, "invalid_request", "invalid_body", parsed.error!),
      );
    }
    const input = parsed.value!;

    const db = getAdminDb();
    const contactRef = db.collection("contacts").doc();
    const now = new Date();
    await contactRef.set({
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      address: "",
      source: input.source || DEFAULT_SOURCE,
      tags: input.tags,
      pipelineStage: null,
      territoryId: GLOBAL_TERRITORY_ID,
      customFields: null,
      attribution: null,
      emailOptedOut: false,
      smsOptedOut: false,
      countryCode: null,
      country: null,
      city: null,
      lat: null,
      lng: null,
      agencyId: ctx.agencyId,
      subAccountId: ctx.subAccountId,
      createdByUid: `apikey:${ctx.keyPrefix}`,
      mode: ctx.mode,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // `message` has no first-class Contact field, so it lands as a note.
    // Awaited (not fire-and-forget) because it's primary submitted data,
    // not a side-effect — but never blocks contact creation from having
    // already succeeded, and a failure here doesn't fail the request.
    if (input.message) {
      const noteLines = [input.message];
      if (input.pageUrl) noteLines.push(`Submitted from: ${input.pageUrl}`);
      try {
        await contactRef.collection("notes").add({
          content: noteLines.join("\n\n"),
          createdBy: `apikey:${ctx.keyPrefix}`,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn("[api/v1/forms/inbound] note write failed", err);
      }
    }

    const created = await contactRef.get();
    const wire = serializeContactForApi(created.id, created.data()!, ctx.mode);
    if (wire.created_at === new Date(0).toISOString()) {
      wire.created_at = now.toISOString();
      wire.updated_at = now.toISOString();
    }

    if (ctx.mode === "live") {
      void fireWorkflowTrigger({
        subAccountId: ctx.subAccountId,
        agencyId: ctx.agencyId,
        type: "contact.created",
        contactId: created.id,
      });
    }

    void emitWebhookEvent({
      subAccountId: ctx.subAccountId,
      agencyId: ctx.agencyId,
      mode: ctx.mode,
      type: "contact.created",
      payload: { contact: wire },
    });

    return applyCors(apiOk(ctx, { contact: wire }, { status: 201 }));
  },
  { requireScope: "forms-ingest" },
);
