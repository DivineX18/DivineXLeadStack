import type { CriticFinding } from "@/lib/funnels/landing-page-critic";
import type { FunnelSection, HeroConfig, VisualDecision } from "@/types/funnels";

/**
 * DIRECTOR-SIDE CORRECTION — P0.5.
 *
 * The Critic identifies what is wrong and where; the Director performs the
 * correction. Two systems both rearranging a page would disagree and the page
 * would oscillate, so the Critic never mutates anything.
 *
 * WHAT IS ACTUALLY CORRECTABLE, AND WHAT IS NOT. This applies only the
 * findings the Director can genuinely act on deterministically: imagery that
 * weakens a section, and sections that would read stronger as text. Removing
 * imagery is a real, bounded operation with a real effect on the artifact.
 *
 * Judgments like `visual_hierarchy`, `generic_feel` and `coherence` are
 * deliberately NOT auto-corrected. There is no deterministic transform that
 * makes a page feel less generic, and pretending otherwise would produce the
 * worst possible outcome: a finding marked handled while the page is
 * unchanged. Those are preserved in the persisted verdict for the operator
 * instead — visible, honest, and un-actioned rather than falsely actioned.
 *
 * Every removal becomes a recorded VisualDecision, so a section that loses
 * its image explains itself rather than looking like a bug.
 */

/** Only these findings map to an operation the Director can actually perform. */
const CORRECTABLE = new Set(["imagery_weakens", "text_would_be_stronger"]);

/**
 * A heading mismatch IS correctable, but not deterministically: rewriting a
 * heading is judgment, so the Critic supplies the replacement and the
 * Director applies it. That keeps correction a single authority while not
 * pretending a rule can understand meaning.
 */
function applyHeadingFix(section: FunnelSection, heading: string): FunnelSection | null {
  const cfg = section.config as Record<string, unknown>;
  if (typeof cfg.headline !== "string" || cfg.headline === heading) return null;
  return { ...section, config: { ...cfg, headline: heading } } as FunnelSection;
}

function stripMedia(section: FunnelSection, reason: string): FunnelSection | null {
  const cfg = section.config as Record<string, unknown>;

  if (section.type === "hero") {
    const hero = cfg as unknown as HeroConfig;
    if (!hero.mediaUrl) return null;
    return {
      ...section,
      config: {
        ...hero,
        mediaType: "none",
        mediaUrl: undefined,
        mediaPlaceholderLabel: "Intentionally text-led",
        mediaPlaceholderBrief: reason,
      },
    } as FunnelSection;
  }

  if (section.type === "story") {
    if (!cfg.photoUrl) return null;
    return { ...section, config: { ...cfg, photoUrl: undefined } } as FunnelSection;
  }

  if (section.type === "benefits_grid") {
    const items = (cfg.items as { imageUrl?: string }[] | undefined) ?? [];
    if (!items.some((i) => i.imageUrl)) return null;
    return {
      ...section,
      config: { ...cfg, items: items.map(({ imageUrl: _drop, ...rest }) => rest) },
    } as FunnelSection;
  }

  // A photo gallery IS its images — stripping them would delete the section's
  // reason to exist rather than correct it. Left for the operator.
  return null;
}

export function applyCriticCorrections(
  sections: FunnelSection[],
  findings: CriticFinding[],
): { sections: FunnelSection[]; decisions: VisualDecision[]; appliedCount: number } {
  // AUTO-APPLY IS DELIBERATELY OFF. Detection is proven — the Critic catches
  // the real observed defect ("Everything you'll learn" over an enrollment
  // process) precisely. Its FALSE-POSITIVE rate is NOT proven: in adversarial
  // testing it also flagged "How it works" over process steps, which is an
  // honest heading. Auto-rewriting on that basis would corrupt correct copy
  // across every generated page — worse than the defect it fixes.
  //
  // So the finding is surfaced in the persisted verdict for review, and the
  // heading is not rewritten, until calibration is demonstrated. Re-enable by
  // restoring the filter below once a control page passes cleanly.
  const AUTO_APPLY_HEADING_FIXES = false;
  const headingFixes = AUTO_APPLY_HEADING_FIXES
    ? findings.filter((f) => f.category === "heading_content_mismatch" && !!f.replacementHeading)
    : [];
  const actionable = findings.filter((f) => CORRECTABLE.has(f.category));
  if (actionable.length === 0 && headingFixes.length === 0) {
    return { sections, decisions: [], appliedCount: 0 };
  }

  const decisions: VisualDecision[] = [];
  let appliedCount = 0;

  const next = sections.map((section) => {
    // Heading first: a dishonest heading misleads the visitor about the
    // section's whole purpose, which outranks a media judgment on it.
    const headingFix = headingFixes.find((f) => f.sectionType === section.type);
    if (headingFix?.replacementHeading) {
      const fixed = applyHeadingFix(section, headingFix.replacementHeading);
      if (fixed) {
        appliedCount++;
        return fixed;
      }
    }
    const finding = actionable.find((f) => f.sectionType === section.type);
    if (!finding) return section;
    const corrected = stripMedia(section, finding.correction);
    if (!corrected) return section; // nothing to remove, or not correctable
    appliedCount++;
    decisions.push({
      role: section.type === "hero" ? "hero" : "benefit",
      sectionType: section.type,
      reason: finding.correction,
    });
    return corrected;
  });

  return { sections: next, decisions, appliedCount };
}
