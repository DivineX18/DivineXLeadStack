import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isPubliclyRenderable } from "@/types/funnels";
import type { FunnelDoc } from "@/types/funnels";
import { recordFunnelEvent, checkBeaconRateLimit } from "@/lib/funnels/telemetry";

/**
 * Funnel telemetry beacon — public, unauthenticated by necessity: the caller
 * is an anonymous visitor on someone else's website.
 *
 * The funnelId is the only "credential", exactly like /api/forms/[id]/submit.
 * What that buys an attacker is a wrong number in a marketing dashboard, so
 * the defence is proportionate: the funnel must actually be PUBLISHED (a draft
 * can't be inflated), and per-IP rate limiting caps how fast anyone can push
 * it. Nothing here reads or writes customer data.
 *
 * Always returns 204. A visitor must never see a telemetry failure, and a
 * failing beacon must never look to the browser like the page is broken.
 */
export const dynamic = "force-dynamic";

const OK = new NextResponse(null, { status: 204 });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ funnelId: string }> },
) {
  try {
    const { funnelId } = await params;
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(funnelId)) return OK;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!checkBeaconRateLimit(ip)) return OK;

    const body = (await req.json().catch(() => null)) as {
      kind?: string;
      firstInSession?: boolean;
      step?: string;
      referrer?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      gclid?: string;
      fbclid?: string;
    } | null;
    if (!body) return OK;

    const kind = body.kind === "submission" ? "submission" : body.kind === "view" ? "view" : null;
    if (!kind) return OK;

    const snap = await getAdminDb().doc(`funnels/${funnelId}`).get();
    if (!snap.exists) return OK;
    const funnel = snap.data() as Omit<FunnelDoc, "id">;
    // Only live pages are measurable. Drafts and previews are deliberately
    // unmeasured — a preview must never pollute real performance data.
    if (!isPubliclyRenderable(funnel.status)) return OK;

    const cap = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 300) : null);

    await recordFunnelEvent({
      subAccountId: funnel.subAccountId,
      funnelId,
      kind,
      firstInSession: body.firstInSession === true,
      step: cap(body.step),
      // The campaign as it stands NOW is stamped onto the event, so history
      // stays true if the funnel is re-linked later.
      campaignId: (funnel as { campaignId?: string }).campaignId ?? null,
      referrer: cap(body.referrer),
      utmSource: cap(body.utmSource),
      utmMedium: cap(body.utmMedium),
      utmCampaign: cap(body.utmCampaign),
      gclid: cap(body.gclid),
      fbclid: cap(body.fbclid),
    });
  } catch {
    // Best-effort by contract. Swallowed deliberately — see the module note
    // on lib/funnels/telemetry.ts.
  }
  return new NextResponse(null, { status: 204 });
}
