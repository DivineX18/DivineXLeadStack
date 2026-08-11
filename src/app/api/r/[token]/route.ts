import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateContactServerSide } from "@/lib/server/contacts-service";
import { verifyTagLinkToken } from "@/lib/automations/tag-link-token";

export const dynamic = "force-dynamic";

/**
 * Public tag-click endpoint. The page at /r/[token] POSTs here to add a
 * tag to a contact. POST (not GET) so email-client link previewers /
 * security scanners don't silently trigger the tag by prefetching the
 * URL before the recipient actually opens it — same reasoning as
 * /api/u/[token].
 *
 * Idempotent: adding a tag the contact already has is a no-op (the
 * underlying patch is a full-array replace where the tag is already
 * present), so a double-click or a retried POST can't double-fire
 * contact.tag.added.
 *
 * Token format: `{contactId}.{tag}.{HMAC}` — see
 * lib/automations/tag-link-token.ts.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const parsed = verifyTagLinkToken(token);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid or expired link." },
      { status: 400 },
    );
  }
  const { contactId, tag } = parsed;

  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }
  const existingTags: string[] = Array.isArray(snap.data()?.tags)
    ? snap.data()!.tags
    : [];
  if (!existingTags.includes(tag)) {
    const result = await updateContactServerSide({
      contactId,
      patch: { tags: [...existingTags, tag] },
    });
    if (!result) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
