import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getFunnel } from "@/lib/server/funnels-service";
import { extractPrincipleFromFeedback } from "@/lib/design-intelligence/extraction";
import { aiIsConfigured } from "@/lib/comms/ai/openrouter";
import type { DesignFeedback } from "@/types/design-intelligence";

export const dynamic = "force-dynamic";

const MAX_TEXT_LEN = 600;

/**
 * The "designer feedback loop" capture endpoint — an operator viewing a
 * generated (or hand-edited) funnel tells Zeno what improved and why. This
 * IS the Calibration Queue entry point from the locked North Star spec:
 * every submission here is immediately run through extraction (best-effort,
 * inline — small LLM call, same synchronous-external-call precedent as the
 * AI Agent profile's "Refresh KB" route) so the vault grows in near
 * real-time rather than needing a separate batch job.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = body.rating === "helpful" || body.rating === "not_helpful" ? body.rating : null;
  const whatImproved = typeof body.whatImproved === "string" ? body.whatImproved.trim().slice(0, MAX_TEXT_LEN) : "";
  const why = typeof body.why === "string" ? body.why.trim().slice(0, MAX_TEXT_LEN) : "";

  if (!rating) {
    return NextResponse.json({ error: "rating must be \"helpful\" or \"not_helpful\"." }, { status: 400 });
  }
  if (!whatImproved || !why) {
    return NextResponse.json(
      { error: "Tell us what you'd change (or what worked) and why — both fields are required." },
      { status: 400 },
    );
  }

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getAdminDb();
  const ref = db.collection("designFeedback").doc();
  const doc: Omit<DesignFeedback, "id"> = {
    funnelId,
    subAccountId,
    agencyId: funnel.agencyId,
    submittedByUid: access.uid,
    rating,
    whatImproved,
    why,
    status: "pending",
    extractedPrincipleId: null,
    archetype: funnel.designStrategy?.visualArchetype ?? null,
    genre: funnel.genre,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });

  if (!aiIsConfigured()) {
    // Feedback is safely stored either way — extraction just runs later
    // once OPENROUTER_API_KEY is set (or a future batch job picks up the
    // still-"pending" row). Never lose the operator's input over this.
    return NextResponse.json({ feedbackId: ref.id, extracted: false });
  }

  try {
    const { principleId, reinforced } = await extractPrincipleFromFeedback(ref.id);
    return NextResponse.json({ feedbackId: ref.id, extracted: true, principleId, reinforced });
  } catch (err) {
    // Extraction failure never loses the feedback — it just stays "pending"
    // for a retry (e.g. from the Command Center queue).
    return NextResponse.json({
      feedbackId: ref.id,
      extracted: false,
      error: err instanceof Error ? err.message : "Extraction failed — feedback saved, will retry later.",
    });
  }
}
