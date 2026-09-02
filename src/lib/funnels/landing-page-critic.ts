import "server-only";

import { callAi } from "@/lib/comms/ai/openrouter";
import type { FunnelDoc, FunnelSection } from "@/types/funnels";

/**
 * LANDING PAGE CRITIC — P0.5.
 *
 * Judges the FINISHED composition. It is deliberately NOT a second design
 * authority: it identifies what is wrong and where, and the Director performs
 * the correction. Two systems both rearranging a page would disagree, and the
 * page would oscillate.
 *
 * SUBJECTIVE BY DESIGN. Visual hierarchy, rhythm, whether imagery strengthens
 * or weakens a composition, whether a text-only treatment reads better — these
 * are judgment, and weakening the Critic into a rules engine to make
 * certification convenient would defeat its purpose. Deterministic guards
 * already own deterministic failures (duplicates, poor-grade placement,
 * above-fold budget, unresolved media states); this owns what they cannot see.
 *
 * AUDITABLE, NOT TRANSPARENT. The structured verdict and findings are
 * persisted so a readiness decision can be inspected later. Internal
 * reasoning is never persisted and never reaches a customer.
 */

export type CriticCategory =
  | "visual_hierarchy"
  | "visual_rhythm"
  | "generic_feel"
  | "imagery_weakens"
  | "text_would_be_stronger"
  | "density"
  | "coherence";

export interface CriticFinding {
  severity: "blocking" | "major" | "minor";
  sectionType: string;
  category: CriticCategory;
  /** Concise and actionable — enough for the Director to correct without
   *  a conversation. Customer-appropriate wording. */
  correction: string;
}

export interface CriticVerdict {
  verdict: "ready" | "needs_correction";
  findings: CriticFinding[];
  evaluatedAt: string;
  model: string;
  /** How many correction rounds preceded this verdict. Bounded — see
   *  MAX_CORRECTION_ROUNDS. */
  round: number;
}

/** AI self-revision is bounded. An unbounded loop burns spend and tends to
 *  oscillate rather than converge. */
export const MAX_CORRECTION_ROUNDS = 1;

const CATEGORIES: CriticCategory[] = [
  "visual_hierarchy", "visual_rhythm", "generic_feel",
  "imagery_weakens", "text_would_be_stronger", "density", "coherence",
];

/**
 * A compact, factual description of what was actually composed. The Critic
 * judges THIS, not the generation inputs — a page can be built from good
 * decisions and still read badly, which is the entire reason it exists.
 */
export function describeComposition(sections: FunnelSection[]): string {
  return sections
    .map((s, i) => {
      const c = s.config as Record<string, unknown>;
      const bits: string[] = [];
      if (typeof c.mediaUrl === "string") bits.push("has image");
      else if (c.mediaPlaceholderBrief) bits.push("image requested, not supplied");
      if (typeof c.photoUrl === "string") bits.push("has portrait");
      const imgs = (c.images as unknown[] | undefined)?.length ?? 0;
      if (imgs) bits.push(`${imgs} gallery images`);
      const items = (c.items as { imageUrl?: string }[] | undefined) ?? [];
      const withImg = items.filter((it) => it.imageUrl).length;
      if (items.length) bits.push(`${items.length} items, ${withImg} with images`);
      const logos = (c.logos as unknown[] | undefined)?.length ?? 0;
      if (logos) bits.push(`${logos} partner logos`);
      const headline = typeof c.headline === "string" ? c.headline : "";
      return `${i + 1}. ${s.type}${headline ? ` — "${headline.slice(0, 60)}"` : ""}${bits.length ? ` (${bits.join(", ")})` : " (no media)"}`;
    })
    .join("\n");
}

const SYSTEM = `You are a senior art director reviewing a finished landing page composition.

You are given the page's section order and what media each section carries. Judge the COMPOSITION only — not the copy's persuasiveness, not the offer.

Look for: weak or absent visual hierarchy; poor visual rhythm (imagery clustered in one place, or long stretches with none); a generic stock-photo feel; imagery that weakens rather than strengthens a section; sections where a text-only treatment would read stronger; awkward density; and whether the page reads as intentionally art-directed rather than populated from an inventory.

A page with FEW images, or none, can be excellent. Do not treat missing imagery as a fault in itself. An image slot explicitly marked "image requested, not supplied" is a known gap, not a composition error.

Reply with ONLY a JSON object:
{"verdict":"ready"|"needs_correction","findings":[{"severity":"blocking"|"major"|"minor","sectionType":"<section>","category":"visual_hierarchy"|"visual_rhythm"|"generic_feel"|"imagery_weakens"|"text_would_be_stronger"|"density"|"coherence","correction":"<one concise, actionable sentence>"}]}

Use "blocking" only when the composition genuinely fails. Return an empty findings array when the page is sound. No prose outside the JSON.`;

function parseVerdict(raw: string, round: number, model: string): CriticVerdict {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("critic_unparseable");
  const parsed = JSON.parse(match[0]) as { verdict?: string; findings?: unknown };
  const findings: CriticFinding[] = Array.isArray(parsed.findings)
    ? (parsed.findings as Record<string, unknown>[])
        .filter((f) => typeof f.sectionType === "string" && typeof f.correction === "string")
        .map((f) => ({
          severity: (["blocking", "major", "minor"] as const).includes(f.severity as never)
            ? (f.severity as CriticFinding["severity"])
            : "minor",
          sectionType: String(f.sectionType),
          category: CATEGORIES.includes(f.category as CriticCategory) ? (f.category as CriticCategory) : "coherence",
          correction: String(f.correction).slice(0, 240),
        }))
        .slice(0, 8)
    : [];
  return {
    verdict: parsed.verdict === "needs_correction" || findings.some((f) => f.severity === "blocking")
      ? "needs_correction"
      : "ready",
    findings,
    evaluatedAt: new Date().toISOString(),
    model,
    round,
  };
}

/**
 * Judge a composed page. Throws when the model is unavailable — the caller
 * decides what an unavailable Critic means for readiness, because silently
 * returning "ready" would let an outage publish unreviewed pages.
 */
export async function critiqueComposition(
  sections: FunnelSection[],
  round = 0,
): Promise<CriticVerdict> {
  const result = await callAi({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: describeComposition(sections) },
    ],
    maxTokens: 700,
    temperature: 0.2,
  });
  return parseVerdict(result.text, round, result.model);
}

/**
 * READINESS is a property of the FINAL ARTIFACT, not the absence of
 * deterministic errors. Three inputs, and a `recommended` photo opportunity is
 * deliberately NOT one of them — those coexist with readiness and power
 * "Publishable now. Stronger with N photos."
 */
export function computeReadiness(input: {
  funnel: Pick<FunnelDoc, "visualRequirements">;
  verdict: CriticVerdict | null;
  deterministicFailures?: string[];
}): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const f of input.deterministicFailures ?? []) reasons.push(f);

  // Only `required` blocks. Completed visualDecisions are in a different
  // field entirely and can never appear here.
  for (const r of input.funnel.visualRequirements ?? []) {
    if (!r.resolvedWith && r.necessity === "required") {
      reasons.push(`A photo is needed for ${r.sectionType}: ${r.brief}`);
    }
  }

  if (!input.verdict) {
    reasons.push("The page has not been reviewed yet.");
  } else if (input.verdict.verdict === "needs_correction") {
    for (const f of input.verdict.findings.filter((x) => x.severity === "blocking")) {
      reasons.push(f.correction);
    }
    // A non-blocking needs_correction after the bounded rounds is preserved
    // as a finding but does not falsely hold the page back.
    if (!input.verdict.findings.some((f) => f.severity === "blocking") && input.verdict.round < MAX_CORRECTION_ROUNDS) {
      reasons.push("Awaiting correction.");
    }
  }

  return { ready: reasons.length === 0, reasons };
}
