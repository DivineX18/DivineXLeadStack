import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { saveWebsiteTestimonials } from "@/lib/server/websites-service";
import type { WebsiteTestimonial } from "@/types/website";

/**
 * PATCH the operator's real testimonials for this site. BUG-011 — storage
 * only; applying them to an already-published page is the separate
 * `fix-content` route below.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id: subAccountId, siteId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { testimonials?: WebsiteTestimonial[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.testimonials)) {
    return NextResponse.json({ error: "Body must include a `testimonials` array." }, { status: 400 });
  }

  const result = await saveWebsiteTestimonials(subAccountId, siteId, body.testimonials);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? "Site not found." },
      { status: result.reason === "missing" ? 404 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
