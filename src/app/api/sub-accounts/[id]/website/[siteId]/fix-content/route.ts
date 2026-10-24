import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { applyTestimonialsFixForSubAccount } from "@/lib/server/websites-service";

const REASON_STATUS: Record<string, number> = {
  missing: 404,
  not_flagged: 409,
  no_testimonials: 400,
  not_configured: 503,
};

/**
 * BUG-011 remediation. A `needs_review` site flagged for fabricated
 * testimonials previously had no in-app fix — the operator's only option
 * was hand-editing raw HTML through gitpage's own dashboard (see CLAUDE.md
 * "Content-fabrication guardrail"). This is that fix, scoped to the one
 * category with a real alternative supply of truth (the operator's own
 * quotes): `action: "apply"` splices them into the live page via gitpage's
 * MCP tools; `action: "remove"` strips the fabricated section outright.
 * Both re-run the standard publish-integrity check afterward.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id: subAccountId, siteId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action !== "apply" && body.action !== "remove") {
    return NextResponse.json({ error: 'action must be "apply" or "remove".' }, { status: 400 });
  }

  const result = await applyTestimonialsFixForSubAccount(subAccountId, siteId, body.action);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: REASON_STATUS[result.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, liveUrl: result.liveUrl, status: result.status, contentFlags: result.contentFlags });
}
