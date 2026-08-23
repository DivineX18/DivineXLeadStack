import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  VISUAL_REVIEW_SYSTEM,
  parseVisualReview,
  type VisualReview,
} from "./visual-review-core";

/**
 * Visual Review — the "second intelligence layer" that actually SEES the page.
 *
 * The design scorer reviews structured JSON (it says so itself), which is why
 * it never caught the flat/bland/"default template" look. This runs a real
 * SCREENSHOT through a vision model, judged for direct-response boldness, and
 * persists the result (mirrors scoreFunnelDesign → funnelDesignReviews). All
 * best-effort: no key, no screenshot, a model failure, or unparseable output
 * return null; publish is never blocked by this.
 */

export type { VisualReview, VisualFlag } from "./visual-review-core";
export { VISUAL_FLAGS, parseVisualReview, visualReviewNeedsAttention } from "./visual-review-core";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISUAL_REVIEW_MODEL = process.env.VISUAL_REVIEW_MODEL?.trim() || "anthropic/claude-sonnet-4-5";

export function visualReviewConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Run the vision model on a screenshot. `imageBase64` is raw base64 (no
 *  data-URI prefix). Best-effort — returns null on any failure. */
export async function runVisualReview(input: { imageBase64: string; funnelContext?: string }): Promise<VisualReview | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !input.imageBase64) return null;

  const userText =
    "Review this landing-page screenshot for direct-response conversion quality." +
    (input.funnelContext ? `\n\nContext (what the page is for): ${input.funnelContext}` : "") +
    "\n\nReturn the JSON now.";

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://leadstack.dev",
        "X-Title": "LeadStack Visual Review",
      },
      body: JSON.stringify({
        model: VISUAL_REVIEW_MODEL,
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          { role: "system", content: VISUAL_REVIEW_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:image/png;base64,${input.imageBase64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? parseVisualReview(text) : null;
  } catch {
    return null;
  }
}

// ─── Persistence (mirrors funnelDesignReviews) ────────────────────────────

const COLLECTION = "funnelVisualReviews";

export interface FunnelVisualReview extends VisualReview {
  id: string;
  funnelId: string;
  subAccountId: string;
  agencyId: string | null;
  createdAt: unknown;
}

export async function storeVisualReview(input: {
  funnelId: string;
  subAccountId: string;
  agencyId: string | null;
  review: VisualReview;
}): Promise<FunnelVisualReview | null> {
  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc();
    const doc: FunnelVisualReview = {
      id: ref.id,
      funnelId: input.funnelId,
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      visualScore: input.review.visualScore,
      verdict: input.review.verdict,
      strengths: input.review.strengths,
      issues: input.review.issues,
      flags: input.review.flags,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(doc);
    return doc;
  } catch {
    return null;
  }
}

export async function getLatestVisualReviewForFunnel(funnelId: string): Promise<FunnelVisualReview | null> {
  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).where("funnelId", "==", funnelId).orderBy("createdAt", "desc").limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as FunnelVisualReview;
  } catch {
    return null;
  }
}
