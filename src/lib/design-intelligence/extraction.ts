import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import { callAi } from "@/lib/comms/ai/openrouter";
import { createPrinciple, listPrinciples, reinforcePrinciple } from "@/lib/design-intelligence/principles";
import type { DesignFeedback, DesignPrincipleCategory } from "@/types/design-intelligence";

/**
 * The "designer feedback loop" from the locked North Star spec: "Whenever a
 * human edits a generated page, treat the edit as design feedback: what
 * changed, why, what improved. Store only the reusable principle behind the
 * edit, never the specific client's branding or copy."
 *
 * Takes a raw DesignFeedback entry (the operator's own "what improved" /
 * "why" text, already scrubbed of the requirement to write anything
 * client-specific by the UI copy itself) and asks the model to generalize
 * it into ONE reusable principle — or decide it's too specific/one-off to
 * generalize, in which case nothing is written (a feedback row can be
 * marked "extracted" with no principle produced; that's a valid outcome,
 * not a failure).
 */

const EXTRACTION_MAX_TOKENS = 300;

const CATEGORY_VALUES: DesignPrincipleCategory[] = [
  "visual_system",
  "section_pattern",
  "typography_system",
  "cro_principle",
  "archetype_note",
];

function buildExtractionPrompt(feedback: DesignFeedback, existingTexts: string[]): string {
  return (
    "You extract REUSABLE design principles for a landing-page design knowledge vault, from one operator's feedback on ONE funnel. " +
    "Rules: (1) generalize away any client-specific business name, brand, exact copy, or numbers — the principle must be usable on a completely different business; " +
    "(2) if the feedback is too specific/one-off to generalize into a real principle, say so — do not force one; " +
    "(3) keep it to ONE sentence, concrete and actionable (e.g. 'Roofing pages perform better with a before/after section placed right after the offer', not 'improve visual quality'); " +
    "(4) pick the best category: visual_system (palette/typography/imagery style for a class of business), section_pattern (which section type/placement works), typography_system (type scale/pairing/rhythm), cro_principle (attention/trust/urgency/friction), archetype_note (a specific observation about one visual_archetype).\n\n" +
    `Funnel genre: ${feedback.genre}. Visual archetype: ${feedback.archetype ?? "unspecified"}.\n` +
    `Operator's rating: ${feedback.rating}.\n` +
    `What they changed/noticed: ${feedback.whatImproved}\n` +
    `Why it's better: ${feedback.why}\n\n` +
    (existingTexts.length > 0
      ? `Existing vault principles (do not duplicate — if this feedback just reinforces one of these, respond with {"duplicate_of": "<exact existing text>"} instead):\n` +
        existingTexts.map((t) => `- ${t}`).join("\n") +
        "\n\n"
      : "") +
    'Respond with ONLY JSON, no markdown: {"principle": "...", "category": "..."} OR {"skip": true, "reason": "..."} OR {"duplicate_of": "..."}.'
  );
}

interface ExtractionResult {
  principle?: string;
  category?: string;
  skip?: boolean;
  duplicate_of?: string;
}

function parseExtraction(text: string): ExtractionResult {
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    return { skip: true };
  }
}

/**
 * Runs extraction for one feedback doc and flips its status. Best-effort —
 * called synchronously from the feedback-submission route (small LLM call,
 * acceptable latency, matches the "Refresh KB" route's synchronous-external-
 * call precedent) but never throws past the caller; a failed extraction
 * just leaves the feedback row `pending` for a manual retry.
 */
export async function extractPrincipleFromFeedback(feedbackId: string): Promise<{
  principleId: string | null;
  reinforced: boolean;
}> {
  const db = getAdminDb();
  const feedbackRef = db.doc(`designFeedback/${feedbackId}`);
  const snap = await feedbackRef.get();
  if (!snap.exists) return { principleId: null, reinforced: false };
  const feedback = snap.data() as DesignFeedback;
  if (feedback.status !== "pending") return { principleId: feedback.extractedPrincipleId, reinforced: false };

  const existing = await listPrinciples();
  const existingTexts = existing.filter((p) => p.active).map((p) => p.text);

  const prompt = buildExtractionPrompt(feedback, existingTexts.slice(0, 40));
  const result = await callAi({
    messages: [{ role: "user", content: prompt }],
    maxTokens: EXTRACTION_MAX_TOKENS,
    temperature: 0.4,
  });
  const parsed = parseExtraction(result.text);

  if (parsed.duplicate_of) {
    const match = existing.find((p) => p.text === parsed.duplicate_of);
    if (match) {
      await reinforcePrinciple(match.id);
      await feedbackRef.update({ status: "extracted", extractedPrincipleId: match.id });
      return { principleId: match.id, reinforced: true };
    }
  }

  if (parsed.skip || !parsed.principle) {
    await feedbackRef.update({ status: "extracted", extractedPrincipleId: null });
    return { principleId: null, reinforced: false };
  }

  const category = CATEGORY_VALUES.includes(parsed.category as DesignPrincipleCategory)
    ? (parsed.category as DesignPrincipleCategory)
    : "cro_principle";

  const principleId = await createPrinciple({
    text: parsed.principle,
    category,
    archetype: feedback.archetype,
    industryTag: null,
    source: "human_feedback",
    createdFromFeedbackId: feedback.id,
  });
  await feedbackRef.update({ status: "extracted", extractedPrincipleId: principleId });
  return { principleId, reinforced: false };
}
