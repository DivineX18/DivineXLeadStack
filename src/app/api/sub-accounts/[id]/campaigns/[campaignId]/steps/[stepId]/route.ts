import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { updateCampaignStep } from "@/lib/server/campaigns-service";

/**
 * PATCH — the customer's decision on ONE step of a campaign plan.
 *
 * Three decisions, and no others: approve it, ask for changes, or drop it.
 * Admin-only, because approving a step is what lets work proceed.
 *
 * "Request changes" records the customer's own words and moves the step back
 * to in-progress. It deliberately does NOT rewrite anything by itself: what
 * gets changed, and how, is Zeno's next conversation with them, not a silent
 * mutation of work they have already seen.
 */
const ACTIONS = {
  approve: "approved",
  request_changes: "in_progress",
  cancel: "skipped",
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; campaignId: string; stepId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, campaignId, stepId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as { action?: string; note?: string } | null;
  const action = body?.action as keyof typeof ACTIONS | undefined;
  if (!action || !(action in ACTIONS)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (action === "request_changes" && !body?.note?.trim()) {
    return NextResponse.json(
      { error: "Tell us what to change, so the revision is about what you actually want." },
      { status: 400 },
    );
  }

  const updated = await updateCampaignStep({
    subAccountId,
    campaignId,
    stepId,
    status: ACTIONS[action],
    ...(action === "request_changes" ? { changeRequest: body!.note!.trim().slice(0, 1000) } : {}),
  });
  // A campaign in another workspace is reported as missing, never as forbidden.
  if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true, steps: updated.plan.steps ?? [] });
}
