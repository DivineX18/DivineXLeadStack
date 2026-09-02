import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { FunnelDoc, FunnelSection, HeroConfig, PhotoGalleryConfig, VisualRequirement } from "@/types/funnels";

/**
 * RESOLVE ONE VISUAL REQUIREMENT — P0.5.
 *
 * Structured state and the composed page are updated in a SINGLE transaction,
 * because the failure mode that matters is them disagreeing: the UI saying a
 * photo is handled while the page still lacks it, or the reverse. Either one
 * makes the product lie to the operator.
 *
 * PROVENANCE IS PRESERVED, NOT LAUNDERED. Resolution means "this visual role
 * is handled" — it never means "authentic first-party evidence now exists". A
 * generated image can legitimately fill a slot; it must not thereby become
 * evidence, because the Business Reality Engine and the approved-only law
 * both depend on that distinction. A resolution flow is precisely where it
 * would quietly erode, so the rule is enforced here rather than remembered by
 * callers.
 */

export type ResolutionProvenance = "first_party_upload" | "brand_library" | "generated";

export class VisualRequirementError extends Error {}

/** Only genuine business media is evidence. A generated visual never is,
 *  however well it fits the slot. */
function countsAsEvidence(provenance: ResolutionProvenance): boolean {
  return provenance !== "generated";
}

/** Apply the chosen visual to the section that actually owns the slot. */
function applyToSection(section: FunnelSection, role: string, url: string): FunnelSection {
  const cfg = section.config as Record<string, unknown>;
  if (section.type === "hero") {
    const hero = cfg as unknown as HeroConfig;
    return {
      ...section,
      config: { ...hero, mediaType: "image", mediaUrl: url, mediaPlaceholderLabel: undefined, mediaPlaceholderBrief: undefined },
    } as FunnelSection;
  }
  if (section.type === "story") {
    return { ...section, config: { ...cfg, photoUrl: url } } as FunnelSection;
  }
  if (section.type === "photo_gallery") {
    const gallery = cfg as unknown as PhotoGalleryConfig;
    return { ...section, config: { ...gallery, images: [...(gallery.images ?? []), { url }] } } as FunnelSection;
  }
  if (section.type === "benefits_grid") {
    const items = (cfg.items as { imageUrl?: string }[] | undefined) ?? [];
    const idx = items.findIndex((i) => !i.imageUrl);
    if (idx === -1) return section;
    const next = items.map((it, i) => (i === idx ? { ...it, imageUrl: url } : it));
    return { ...section, config: { ...cfg, items: next } } as FunnelSection;
  }
  // A role we do not know how to place is NOT silently swallowed — otherwise
  // state would record a resolution the page never received.
  throw new VisualRequirementError(`No media slot on section "${section.type}" for role "${role}".`);
}

export async function resolveVisualRequirement(input: {
  funnelId: string;
  subAccountId: string;
  requirementId: string;
  provenance: ResolutionProvenance;
  url: string;
  /** Carried from source verification — the asset's real classification,
   *  never re-derived here. See verify-resolution-source.ts. */
  sourceClassification?: string | null;
}): Promise<{ requirement: VisualRequirement; countsAsAuthenticEvidence: boolean }> {
  const db = getAdminDb();
  const ref = db.doc(`funnels/${input.funnelId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new VisualRequirementError("Funnel not found.");
    const funnel = snap.data() as Omit<FunnelDoc, "id">;

    // Tenancy is re-checked inside the transaction: a funnel id in a URL must
    // never reach another workspace's document.
    if (funnel.subAccountId !== input.subAccountId) throw new VisualRequirementError("Funnel not found.");

    const requirements = funnel.visualRequirements ?? [];
    const target = requirements.find((r) => r.id === input.requirementId);
    if (!target) throw new VisualRequirementError("That visual requirement no longer exists on this page.");

    const section = (funnel.sections ?? []).find((s) => s.type === target.sectionType);
    if (!section) throw new VisualRequirementError(`Section "${target.sectionType}" is no longer on this page.`);

    // Compose first: if placement fails, nothing is recorded as resolved.
    const updatedSection = applyToSection(section, target.role, input.url);
    const sections = (funnel.sections ?? []).map((s) => (s === section ? updatedSection : s));

    const isEvidence = countsAsEvidence(input.provenance);
    const resolved: VisualRequirement = {
      ...target,
      resolvedWith: {
        provenance: input.provenance,
        url: input.url,
        countsAsAuthenticEvidence: isEvidence,
        sourceClassification: input.sourceClassification ?? null,
      },
    };

    tx.update(ref, {
      sections,
      visualRequirements: requirements.map((r) => (r.id === target.id ? resolved : r)),
      updatedAt: new Date(),
    });

    return { requirement: resolved, countsAsAuthenticEvidence: isEvidence };
  });
}

/**
 * "Stronger with N photos" — counts only UNRESOLVED requirements. Completed
 * design decisions are excluded by construction: they live in a different
 * field entirely, so no caller has to remember to filter them.
 */
export function countOutstandingImprovements(funnel: Pick<FunnelDoc, "visualRequirements">): number {
  return (funnel.visualRequirements ?? []).filter((r) => !r.resolvedWith).length;
}

/** Requirements the Director judged the page genuinely cannot work without. */
export function blockingRequirements(funnel: Pick<FunnelDoc, "visualRequirements">): VisualRequirement[] {
  return (funnel.visualRequirements ?? []).filter((r) => !r.resolvedWith && r.necessity === "required");
}
