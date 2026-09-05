import {
  planPageVisuals,
  outstandingPhotoRequests,
  type CandidateAsset,
} from "@/lib/funnels/image-director";
import type { FunnelSection } from "@/types/funnels";

/**
 * IMAGERY GUIDANCE — tell the customer what would strengthen the page.
 *
 * When a section would genuinely benefit from a photograph and none exists,
 * the honest product behaviour is to SAY SO, not to reach for stock or to
 * invent something. This turns the Image Director's existing decisions into
 * advice the customer can act on inside the editor.
 *
 * Deliberately NOT a second set of rules: role, brief and the "which sections
 * deserve imagery" judgement all come from planPageVisuals. This module only
 * maps the Director's output onto the sections actually on the page and
 * filters out slots the customer has already filled.
 *
 * Pure — no network, no Firestore — so the editor can compute it live as the
 * page is edited, and it stays testable.
 */

export interface ImageryHint {
  /** Section this concerns, when it maps to one on the page. */
  sectionId: string | null;
  sectionType: string;
  /** What to supply, in the customer's terms. */
  message: string;
  /** The Director's own shooting brief. */
  brief: string;
  /** required = the section's job depends on it; recommended = it would be
   *  stronger with it. Never used to block publication. */
  necessity: "required" | "recommended";
}

/** Does this section already carry real imagery? */
function hasImage(section: FunnelSection): boolean {
  const c = section.config as Record<string, unknown>;
  const s = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (s(c.mediaUrl) || s(c.photoUrl) || s(c.productImageUrl)) return true;
  if (Array.isArray(c.images) && (c.images as { url?: string }[]).some((i) => s(i.url))) return true;
  if (Array.isArray(c.items) && (c.items as { imageUrl?: string }[]).some((i) => s(i.imageUrl))) return true;
  if (Array.isArray(c.blocks) && (c.blocks as { imageUrl?: string }[]).some((b) => s(b.imageUrl))) return true;
  if (Array.isArray(c.members) && (c.members as { photoUrl?: string }[]).some((m) => s(m.photoUrl))) return true;
  return false;
}

/** Customer-facing phrasing per role. Falls back to the Director's brief so a
 *  new role can never produce an empty message. */
const ROLE_MESSAGE: Record<string, string> = {
  hero: "A real photo at the top would make this page feel like your business.",
  story_portrait: "A photo of you or your team would make this section land.",
  team_photo: "Add photos of the people on your team.",
  service_photo: "A photo of the work itself would make this concrete.",
  gallery: "A few photos of real work would strengthen this.",
  community_photo: "A photo of the people you serve would strengthen this.",
  proof: "A real image of results would make this evidence, not a claim.",
};

export function imageryGuidance(input: {
  sections: FunnelSection[];
  /** Approved workspace assets. Empty is the common case and is fine — the
   *  Director still says what SHOULD be there. */
  assets?: CandidateAsset[];
  heroBrief?: string | null;
  heroPrefersText?: boolean;
}): ImageryHint[] {
  const sections = input.sections ?? [];
  if (sections.length === 0) return [];

  const plan = planPageVisuals({
    sectionTypes: sections.map((s) => s.type),
    assets: input.assets ?? [],
    ...(input.heroBrief ? { heroBrief: input.heroBrief } : {}),
    ...(input.heroPrefersText ? { heroPrefersText: true } : {}),
  });

  const requests = outstandingPhotoRequests(plan);
  if (requests.length === 0) return [];

  // Map each request onto a real section. Hero maps to the hero; every other
  // role maps to the first section the Director gave that slot to.
  const slotByRole = new Map<string, string>();
  for (const slot of plan.slots) {
    const res = slot.resolution as { kind: string; role?: string };
    if (res.role && !slotByRole.has(res.role)) slotByRole.set(res.role, slot.sectionType);
  }

  const hints: ImageryHint[] = [];
  for (const req of requests) {
    const sectionType = req.role === "hero" ? "hero" : (slotByRole.get(req.role) ?? "");
    const section = sectionType ? sections.find((s) => s.type === sectionType) : undefined;
    // A slot the customer already filled is not outstanding advice.
    if (section && hasImage(section)) continue;
    hints.push({
      sectionId: section?.id ?? null,
      sectionType: sectionType || req.role,
      message: ROLE_MESSAGE[req.role] ?? req.brief,
      brief: req.brief,
      // The hero carries the page's first impression; everything else is an
      // improvement, not a prerequisite. Guidance NEVER blocks publication —
      // completeness validation is a separate, deterministic concern.
      necessity: req.role === "hero" ? "required" : "recommended",
    });
  }
  return hints;
}
