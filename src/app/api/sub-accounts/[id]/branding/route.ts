import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * PATCH /api/sub-accounts/[id]/branding
 *
 * Update this sub-account's external-facing branding: the logo URL (a public
 * https URL) and the accent colour. Renders on quote/invoice emails, public
 * /q/[token] pages, PDFs, and the call-to-action buttons in automated emails,
 * the surfaces this client's customers see.
 *
 * Auth: sub-account admin OR agency owner (via requireSubAccountAdmin).
 *
 * Body: { logoUrl?: string | null, brandColor?: string | null }
 *   - null or "" → wipe the field
 *   - logoUrl    → must start with http(s)://
 *   - brandColor → a hex colour ("#059669" or "#0a0"); null restores the
 *     product accent. Validated rather than stored as typed, because it goes
 *     straight into a style attribute in an email.
 */

const URL_RE = /^https?:\/\/.+/i;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

interface PatchBody {
  logoUrl?: string | null;
  brandColor?: string | null;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("logoUrl" in body) {
    if (body.logoUrl === null || body.logoUrl === "") {
      updates.logoUrl = null;
    } else if (typeof body.logoUrl === "string") {
      const trimmed = body.logoUrl.trim();
      if (!URL_RE.test(trimmed)) {
        return NextResponse.json(
          { error: "logoUrl must start with http:// or https://." },
          { status: 400 },
        );
      }
      updates.logoUrl = trimmed.slice(0, 2_000);
    }
  }

  if ("brandColor" in body) {
    if (body.brandColor === null || body.brandColor === "") {
      updates.brandColor = null;
    } else if (typeof body.brandColor === "string") {
      const trimmed = body.brandColor.trim();
      // This value is interpolated into a style attribute in an email. Only
      // a hex colour is ever written, so nothing else can reach that
      // attribute no matter what is typed here.
      if (!HEX_RE.test(trimmed)) {
        return NextResponse.json(
          { error: "brandColor must be a hex colour, for example #059669." },
          { status: 400 },
        );
      }
      updates.brandColor = trimmed.toLowerCase();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, ...updates });
}
