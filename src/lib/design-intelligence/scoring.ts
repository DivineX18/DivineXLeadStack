import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { callAi } from "@/lib/comms/ai/openrouter";
import {
  DESIGN_REVIEW_CRITERIA,
  DESIGN_REVIEW_PASS_THRESHOLD,
  type DesignReviewCriterion,
  type FunnelDesignReview,
} from "@/types/design-intelligence";
import type { FunnelDoc } from "@/types/funnels";

/**
 * The locked North Star design review: "Every generated page gets an
 * internal design review... Score each of these 1-10: visual hierarchy,
 * typography, spacing, section rhythm, emotional flow, CTA placement,
 * trust building, visual storytelling, industry authenticity, conversion
 * psychology, originality, premium feel, overall cohesion."
 *
 * v1 honesty note: there is no screenshot/render pipeline in this codebase
 * (funnels render client-side from structured JSON; no headless-browser
 * capture exists anywhere here), so this scores the funnel's STRUCTURED
 * CONTENT + chosen design tokens (archetype, palette, typography, layout
 * sequence, copy) rather than a rendered image. That is a real, honest
 * proxy for typography/spacing/hierarchy/rhythm choices (all of which are
 * enumerated tokens from design-strategy.ts, not free-form CSS) and for
 * copy-driven criteria (emotional flow, trust building, conversion
 * psychology, industry authenticity) it IS the actual signal. It is a
 * weaker proxy for pure pixel polish. Documented limitation, not a silent
 * gap — see the "What's intentionally NOT in v1" note in CLAUDE.md's
 * Calibration Engine section.
 *
 * The locked spec also says "Any category scoring below 8 gets redesigned
 * before the page is returned." v1 does NOT auto-redesign — a blind
 * automated rewrite loop with no human checkpoint is a real regression
 * risk (it could silently degrade a page a human just liked). Instead this
 * scores every AI-created funnel, stores the review, and surfaces
 * below-bar categories + concrete notes to the operator so they (or a
 * follow-up Zeno turn) can act on them. Auto-redesign is a deliberate v2
 * step once there's real signal on how the scores correlate with human
 * feedback.
 */

const SCORING_MODEL_MAX_TOKENS = 900;

interface ScoringLlmResult {
  scores: Record<DesignReviewCriterion, number>;
  notes: Partial<Record<DesignReviewCriterion, string>>;
}

/** Fields that carry structural/styling info rather than reader-facing
 *  copy — excluded so the reviewer sees content, not config noise. */
const NON_CONTENT_KEYS = new Set([
  "id",
  "formId",
  "photoUrl",
  "mediaUrl",
  "mediaType",
  "mediaPlaceholderBrief",
  "ctaHref",
  "videoUrl",
  "iconType",
  "style",
  "layout",
  "popupLayout",
  "group",
  "bookingPageSlug",
  "phoneNumber",
  "productImageUrl",
  "priceCents",
  "strikethroughPriceCents",
  "currency",
  "checkoutMode",
  "billingMode",
]);

/** Recursively pulls every reader-facing string out of a section's config —
 *  headline/subheadline/eyebrow/byline/paragraphs/item titles+descriptions/
 *  badge labels/FAQ Q&A/guarantee copy/etc. Generalizes across every
 *  FunnelSectionConfig shape instead of hardcoding each one, so a new
 *  section type is reviewed correctly with zero changes here. A section
 *  with nothing left after filtering reads as "(no content yet)" — which
 *  is exactly what an empty section IS, and should tank the relevant
 *  score rather than silently reading as "fine, nothing to say." */
function extractSectionText(value: unknown, keyHint?: string): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return [keyHint ? `${keyHint}="${trimmed.slice(0, 200)}"` : `"${trimmed.slice(0, 200)}"`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSectionText(item, keyHint));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      NON_CONTENT_KEYS.has(k) ? [] : extractSectionText(v, k),
    );
  }
  return [];
}

function summarizeFunnelForReview(funnel: FunnelDoc): string {
  const lines: string[] = [];
  lines.push(`Genre: ${funnel.genre}`);
  if (funnel.designStrategy) {
    const s = funnel.designStrategy;
    lines.push(
      `Design strategy: archetype=${s.visualArchetype}, palette=${s.paletteId}, colorMode=${s.colorMode}, typography=${s.typographyPairing}, heroLayout=${s.heroLayout}, cardStyle=${s.cardStyle}, density=${s.visualDensity}, animation=${s.animationLevel}, ctaStrategy=${s.ctaStrategy}, mediaStrategy=${s.mediaStrategy}`,
    );
  } else {
    lines.push(`Design strategy: none (legacy designPack=${funnel.designPack ?? "classic"})`);
  }
  lines.push(`Sections (${funnel.sections.length}):`);
  for (const section of funnel.sections) {
    const text = extractSectionText(section.config).join(", ");
    lines.push(`- [${section.type}] ${text || "(no content yet)"}`);
  }
  return lines.join("\n");
}

function buildScoringPrompt(funnel: FunnelDoc): string {
  const summary = summarizeFunnelForReview(funnel);
  return (
    "You are a senior conversion-focused landing-page design reviewer at a premium agency. " +
    "Score this funnel's structure and copy against each of these 13 criteria, 1-10 (10 = agency-portfolio quality worth $5,000-$20,000): " +
    DESIGN_REVIEW_CRITERIA.join(", ") +
    '. Be a genuinely critical reviewer — most first-draft pages should NOT score a clean sweep of 10s; reserve 9-10 for work with no real weakness. ' +
    "For any criterion scoring below 8, write ONE short, concrete, actionable note (max 20 words) on what specifically to fix — never generic praise, never a note on a criterion that scored 8+. " +
    'Respond with ONLY a JSON object, no markdown, no prose: {"scores": {"visual_hierarchy": 7, ...all 13 keys...}, "notes": {"visual_hierarchy": "..."}} — notes only for keys that scored below 8.\n\n' +
    "FUNNEL TO REVIEW:\n" +
    summary
  );
}

function clampScore(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 5;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function parseScoringResponse(text: string): ScoringLlmResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : text;
  let parsed: { scores?: Record<string, unknown>; notes?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const scores = {} as Record<DesignReviewCriterion, number>;
  for (const c of DESIGN_REVIEW_CRITERIA) {
    scores[c] = clampScore(parsed.scores?.[c]);
  }
  const notes: Partial<Record<DesignReviewCriterion, string>> = {};
  for (const c of DESIGN_REVIEW_CRITERIA) {
    const note = parsed.notes?.[c];
    if (typeof note === "string" && note.trim() && scores[c] < DESIGN_REVIEW_PASS_THRESHOLD) {
      notes[c] = note.trim().slice(0, 200);
    }
  }
  return { scores, notes };
}

/**
 * Scores a funnel and persists the review. Best-effort by design — callers
 * (create_funnel's post-generation hook, the manual "Score this page"
 * button) must never let a scoring failure block the actual funnel
 * creation/save, matching this codebase's established lifecycle-side-effect
 * discipline (see e.g. lib/quotes/lifecycle.ts).
 */
export async function scoreFunnelDesign(funnel: FunnelDoc): Promise<FunnelDesignReview> {
  const prompt = buildScoringPrompt(funnel);
  const result = await callAi({
    messages: [{ role: "user", content: prompt }],
    maxTokens: SCORING_MODEL_MAX_TOKENS,
    temperature: 0.3,
  });
  const { scores, notes } = parseScoringResponse(result.text);
  const overallScore =
    Math.round(
      (DESIGN_REVIEW_CRITERIA.reduce((sum, c) => sum + scores[c], 0) / DESIGN_REVIEW_CRITERIA.length) * 10,
    ) / 10;
  const belowBar = DESIGN_REVIEW_CRITERIA.filter((c) => scores[c] < DESIGN_REVIEW_PASS_THRESHOLD).sort(
    (a, b) => scores[a] - scores[b],
  );

  const db = getAdminDb();
  const ref = db.collection("funnelDesignReviews").doc();
  const doc: Omit<FunnelDesignReview, "id"> = {
    funnelId: funnel.id,
    subAccountId: funnel.subAccountId,
    agencyId: funnel.agencyId,
    scores,
    overallScore,
    belowBar,
    notes,
    archetype: funnel.designStrategy?.visualArchetype ?? null,
    genre: funnel.genre,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return { id: ref.id, ...doc } as FunnelDesignReview;
}

export async function getLatestReviewForFunnel(funnelId: string): Promise<FunnelDesignReview | null> {
  const db = getAdminDb();
  const snap = await db
    .collection("funnelDesignReviews")
    .where("funnelId", "==", funnelId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as FunnelDesignReview;
}
