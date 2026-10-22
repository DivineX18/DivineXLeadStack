import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyTagLinkToken } from "@/lib/automations/tag-link-token";
import { updateContactServerSide } from "@/lib/server/contacts-service";

export const dynamic = "force-dynamic";

/**
 * Public tag-link endpoint. The page at /t/[token] POSTs here on mount to
 * apply ONE tag to ONE contact. We use POST (not GET), and the page itself
 * fires it client-side rather than resolving on the server, for the exact
 * same reason as /api/u/[token]: email-link previewers (Outlook Safe Links,
 * corporate scanning gateways) issue a plain GET/HEAD against the href in
 * the email, and that must never itself apply the tag.
 *
 * Token format: `{contactId}.{tag}.{HMAC}` — see
 * lib/automations/tag-link-token.ts.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const verified = verifyTagLinkToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  const snap = await getAdminDb().doc(`contacts/${verified.contactId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  // Replace-semantics patch (updateContactServerSide doesn't do array-union),
  // so the new tag list is the existing one with this tag merged in exactly
  // once. Deduping here — rather than short-circuiting on "already has it" —
  // means a double-click or a re-opened link is just a no-op write: the diff
  // updateContactServerSide computes internally comes out empty, so it never
  // fires a second contact.tag.added for the same tag.
  const existingTags: string[] = Array.isArray(snap.data()!.tags) ? snap.data()!.tags : [];
  const tags = existingTags.includes(verified.tag) ? existingTags : [...existingTags, verified.tag];

  const result = await updateContactServerSide({
    contactId: verified.contactId,
    patch: { tags },
  });
  if (!result) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
