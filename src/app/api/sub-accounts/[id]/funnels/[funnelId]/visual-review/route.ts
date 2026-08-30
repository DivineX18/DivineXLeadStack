import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getFunnel } from "@/lib/server/funnels-service";
import { captureFunnelScreenshot } from "@/lib/funnels/funnel-screenshot";
import {
  runVisualReview,
  storeVisualReview,
  getLatestVisualReviewForFunnel,
  visualReviewConfigured,
} from "@/lib/design-intelligence/visual-review";

export const dynamic = "force-dynamic";
// Headless Chromium needs the Node runtime + headroom. Harmless if screenshots
// aren't yet activated (the capture just returns null quickly).
export const runtime = "nodejs";
export const maxDuration = 60;

/** Latest stored visual review for this funnel, if any. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const review = await getLatestVisualReviewForFunnel(funnelId);
  return NextResponse.json({ review });
}

/**
 * Render the funnel, screenshot it, and run the vision review — the layer that
 * actually SEES the page before publish. Best-effort throughout: if screenshots
 * aren't activated on this deployment (puppeteer-core + @sparticuz/chromium not
 * installed) or the model can't run, it returns a clear, non-error status so
 * the review gate falls back to the structured design + copy reviews.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!visualReviewConfigured()) {
    return NextResponse.json(
      { review: null, status: "not_configured", message: "Set OPENROUTER_API_KEY to enable the visual review." },
      { status: 200 },
    );
  }

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json(
      { review: null, status: "no_app_url", message: "NEXT_PUBLIC_APP_URL must be set (and publicly reachable) to screenshot the page." },
      { status: 200 },
    );
  }
  const previewUrl = `${appUrl}/preview/funnel/${funnelId}`;

  const imageBase64 = await captureFunnelScreenshot(previewUrl);
  if (!imageBase64) {
    return NextResponse.json(
      {
        review: null,
        status: "screenshot_unavailable",
        message:
          "Couldn't capture a screenshot. Activate it with `pnpm add puppeteer-core @sparticuz/chromium` and confirm NEXT_PUBLIC_APP_URL is publicly reachable. The design + copy reviews still work.",
      },
      { status: 200 },
    );
  }

  const heroHeadline = (() => {
    const hero = funnel.sections.find((s) => s.type === "hero");
    const h = (hero?.config as { headline?: string } | undefined)?.headline;
    return typeof h === "string" ? h : "";
  })();
  const funnelContext = `${funnel.genre} funnel "${funnel.name}"${heroHeadline ? ` — headline: "${heroHeadline}"` : ""}`;

  const review = await runVisualReview({ imageBase64, funnelContext });
  if (!review) {
    return NextResponse.json({ review: null, status: "review_failed", message: "The vision model didn't return a usable review. Try again." }, { status: 200 });
  }

  const stored = await storeVisualReview({
    funnelId: funnel.id,
    subAccountId: funnel.subAccountId,
    agencyId: funnel.agencyId ?? null,
    review,
  });
  return NextResponse.json({ review: stored ?? { ...review, id: null }, status: "ok" });
}
