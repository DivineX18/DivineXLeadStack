import "server-only";

import { callAi } from "@/lib/comms/ai/openrouter";
import { evaluateSections } from "@/lib/funnels/section-completeness";
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
  | "coherence"
  /** The heading promises something the content beneath it does not deliver —
   *  e.g. "Everything you'll learn" over an enrollment process. Model-written
   *  copy, so this is judgment, not a rule. */
  | "heading_content_mismatch"
  /** OBJECTIVE, never model-decided: a section is present on the page but
   *  carries no customer-facing content, or is missing a required piece of
   *  it. Produced by the deterministic pass below, not by the Critic model. */
  | "incomplete_section"
  /** The call to action does not read as a clear action with a relevant,
   *  immediate payoff that continues the offer. Judgment — see the system
   *  prompt; deliberately NOT a banned-phrase list. */
  | "cta_quality";

export interface CriticFinding {
  severity: "blocking" | "major" | "minor";
  sectionType: string;
  category: CriticCategory;
  /** Concise and actionable — enough for the Director to correct without
   *  a conversation. Customer-appropriate wording. */
  correction: string;
  /** For heading_content_mismatch ONLY: the heading that would honestly
   *  describe the content beneath. Supplied by the Critic because rewriting a
   *  heading is judgment; APPLIED by the Director, so correction stays a
   *  single authority. */
  replacementHeading?: string;
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
  "heading_content_mismatch", "incomplete_section", "cta_quality",
];

/**
 * OBJECTIVE PASS — runs BEFORE the model, and its findings are never subject
 * to the model's opinion.
 *
 * The traced failure this exists to close: a page with an empty proof strip,
 * an all-blank problem/solution block and an itemless FAQ was returned
 * "ready" with zero findings. The Critic was asked to judge composition and
 * answered a composition question correctly; nothing in the system was
 * asking the prior, factual question — is there content in these sections at
 * all? A model is the wrong instrument for that, and the fixture proves a
 * model can be walked past it.
 *
 * Empty shells are BLOCKING. A missing required element inside a section that
 * does carry content is MAJOR — real but not a dead zone.
 */
function completenessFindings(sections: FunnelSection[]): CriticFinding[] {
  return evaluateSections(sections)
    .filter((e) => e.state !== "ok")
    .map((e) => ({
      severity: e.state === "empty" ? ("blocking" as const) : ("major" as const),
      sectionType: e.sectionType,
      category: "incomplete_section" as const,
      correction:
        e.state === "empty"
          ? `${e.reason} Fill it in or remove the section — do not publish it blank.`
          : e.reason,
    }));
}

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
      // THE ITEM LABELS, not just a count. Without them the Critic could see
      // "4 items" under "Everything you'll learn" and had no way to know the
      // items were Apply / Strategy call / Roadmap — i.e. it was structurally
      // incapable of detecting a heading/content mismatch. A category alone
      // would not have fixed that; the input had to change.
      const items = (c.items as { label?: string; title?: string; heading?: string; imageUrl?: string }[] | undefined) ?? [];
      const withImg = items.filter((it) => it.imageUrl).length;
      if (items.length) {
        const labels = items
          .map((it) => it.label ?? it.title ?? it.heading)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .slice(0, 6)
          .map((x) => x.slice(0, 40));
        bits.push(
          labels.length
            ? `${items.length} items: ${labels.join(" / ")}${withImg ? `, ${withImg} with images` : ""}`
            : `${items.length} items, ${withImg} with images`,
        );
      }
      const logos = (c.logos as unknown[] | undefined)?.length ?? 0;
      if (logos) bits.push(`${logos} partner logos`);
      // THE CTA LABEL, verbatim. Without it the Critic was structurally
      // incapable of judging CTA quality at all — the same class of gap the
      // item labels closed. Judgment needs the actual words.
      const ctaLabel = typeof c.ctaLabel === "string" ? c.ctaLabel.trim() : "";
      const cta = (c.cta ?? {}) as Record<string, unknown>;
      if (ctaLabel) {
        const opens =
          typeof c.formId === "string" && c.formId
            ? "opens capture form"
            : typeof cta.bookingPageSlug === "string" && cta.bookingPageSlug
              ? "opens booking calendar"
              : typeof cta.phoneNumber === "string" && cta.phoneNumber
                ? "dials phone"
                : typeof c.ctaHref === "string" && c.ctaHref
                  ? "links out"
                  : "no destination";
        bits.push(`CTA button "${ctaLabel.slice(0, 60)}" (${opens})`);
      }
      const headline = typeof c.headline === "string" ? c.headline : "";
      return `${i + 1}. ${s.type}${headline ? ` — "${headline.slice(0, 60)}"` : ""}${bits.length ? ` (${bits.join(", ")})` : " (no media)"}`;
    })
    .join("\n");
}

/** What the page is actually selling, so CTA continuity can be judged against
 *  the offer rather than in the abstract. Optional — absent is today's
 *  composition-only behavior. */
export interface CriticPageContext {
  businessName?: string;
  corePromise?: string;
  prospect?: string;
}

function describeContext(ctx?: CriticPageContext): string {
  if (!ctx) return "";
  const lines = [
    ctx.businessName ? `Business: ${ctx.businessName}` : "",
    ctx.prospect ? `Visitor: ${ctx.prospect}` : "",
    ctx.corePromise ? `What the page promises: ${ctx.corePromise}` : "",
  ].filter(Boolean);
  return lines.length ? `THE OFFER THIS PAGE IS MAKING\n${lines.join("\n")}\n\nTHE COMPOSITION\n` : "";
}

const SYSTEM = `You are a senior art director reviewing a finished landing page composition.

You are given the page's section order and what media each section carries. Judge the COMPOSITION only — not the copy's persuasiveness, not the offer.

FIRST, for every section that has both a heading and content: does the heading honestly describe what is underneath it? A heading that promises a curriculum ("Everything you'll learn") above an enrollment process (Apply, Strategy call, Roadmap), "How it works" above testimonials, "Results" above feature descriptions, or "What you'll receive" above a founder biography are all real failures — the visitor is told one thing and shown another. When you find one, use category "heading_content_mismatch" and supply "replacementHeading" with a short heading that honestly describes the content. THE BAR IS MISLEADING, NOT IMPROVABLE. Flag it ONLY when the heading promises a DIFFERENT KIND OF THING than what follows, so a visitor would feel misled. Generic-but-accurate headings are CORRECT and must NOT be flagged: "How it works" over process steps, "What's included" over a deliverables list, "About" over a bio, "FAQ" over questions. If your suggested replacement would merely be more specific or more compelling than the current heading, that is NOT a mismatch — say nothing. Almost all headings are fine; this finding should be rare.

SECOND, judge the CALLS TO ACTION. You are given each CTA button's exact label and what it actually does. A call to action works when all three hold: it names a CLEAR ACTION the visitor is about to take; it implies a RELEVANT, IMMEDIATE PAYOFF for taking it; and it CONTINUES the offer the page just made rather than restarting the conversation generically. Judge those three together — a short label is not automatically weak and a long one is not automatically strong. "Get started" on a page whose whole promise is a gentle first dental visit fails the payoff and continuity tests, because it would sit equally well on any page on the internet; "Book my first visit" passes. There is no banned wording — evaluate what the label does for THIS page, in front of THIS visitor, given what the button actually opens. When a CTA fails, use category "cta_quality" and say in the correction what the label should convey. Repeat CTAs down a page may echo each other; that is not a fault.

Also look for: weak or absent visual hierarchy; poor visual rhythm (imagery clustered in one place, or long stretches with none); a generic stock-photo feel; imagery that weakens rather than strengthens a section; sections where a text-only treatment would read stronger; awkward density; and whether the page reads as intentionally art-directed rather than populated from an inventory.

A page with FEW images, or none, can be excellent. Do not treat missing imagery as a fault in itself. An image slot explicitly marked "image requested, not supplied" is a known gap, not a composition error.

Reply with ONLY a JSON object:
{"verdict":"ready"|"needs_correction","findings":[{"severity":"blocking"|"major"|"minor","sectionType":"<section>","category":"visual_hierarchy"|"visual_rhythm"|"generic_feel"|"imagery_weakens"|"text_would_be_stronger"|"density"|"coherence"|"heading_content_mismatch"|"cta_quality","correction":"<one concise, actionable sentence>","replacementHeading":"<only for heading_content_mismatch>"}]}

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
          ...(typeof f.replacementHeading === "string" && f.replacementHeading.trim()
            ? { replacementHeading: String(f.replacementHeading).trim().slice(0, 80) }
            : {}),
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
  context?: CriticPageContext,
): Promise<CriticVerdict> {
  // OBJECTIVE FIRST. Computed before the call so an incomplete page cannot be
  // certified by a model that overlooked it, and — because the merge happens
  // in both the success and failure paths below — cannot be certified by a
  // model that never answered at all.
  const objective = completenessFindings(sections);

  let subjective: CriticVerdict;
  try {
    const result = await callAi({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: describeContext(context) + describeComposition(sections) },
      ],
      maxTokens: 800,
      temperature: 0.2,
    });
    subjective = parseVerdict(result.text, round, result.model);
  } catch (err) {
    // The subjective half is unavailable. That is NOT a pass — the caller
    // already treats a thrown Critic as "not reviewed". But an objective
    // failure is knowable without a model, so surface it rather than losing
    // it inside the outage.
    if (objective.length > 0) {
      return {
        verdict: "needs_correction",
        findings: objective,
        evaluatedAt: new Date().toISOString(),
        model: "deterministic",
        round,
      };
    }
    throw err;
  }

  const findings = [...objective, ...subjective.findings].slice(0, 12);
  return {
    ...subjective,
    findings,
    verdict:
      objective.some((f) => f.severity === "blocking") || subjective.verdict === "needs_correction"
        ? "needs_correction"
        : "ready",
  };
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
