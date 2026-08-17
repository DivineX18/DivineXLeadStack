import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import type { DesignFeedback, FunnelDesignReview } from "@/types/design-intelligence";

export const dynamic = "force-dynamic";

/**
 * Command Center → Design Intelligence summary: "how many landing pages
 * have been analyzed, common winning patterns by industry, top-performing
 * section types, recent calibration insights" (locked spec). v1 keeps this
 * to what's actually derivable from stored data — recent feedback (the
 * Calibration Queue itself) + recent reviews + a simple below-bar count —
 * rather than inventing "top-performing section types" analytics with no
 * real performance data (funnels have no conversion-tracking pipeline
 * feeding this yet) behind them.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const db = getAdminDb();
  const [feedbackSnap, reviewsSnap] = await Promise.all([
    db.collection("designFeedback").orderBy("createdAt", "desc").limit(50).get(),
    db.collection("funnelDesignReviews").orderBy("createdAt", "desc").limit(50).get(),
  ]);

  const feedback = feedbackSnap.docs.map((d) => d.data() as DesignFeedback);
  const reviews = reviewsSnap.docs.map((d) => d.data() as FunnelDesignReview);

  const pendingCount = feedback.filter((f) => f.status === "pending").length;
  const belowBarCount = reviews.filter((r) => r.belowBar.length > 0).length;
  const avgScore =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.overallScore, 0) / reviews.length) * 10) / 10
      : null;

  return NextResponse.json({
    feedback,
    reviews,
    summary: {
      totalReviewed: reviews.length,
      avgScore,
      belowBarCount,
      pendingFeedbackCount: pendingCount,
    },
  });
}
