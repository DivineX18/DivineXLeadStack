import "server-only";
import { getDivinexProfileSnapshot, type DivinexProfileSnapshot } from "@/lib/divinex/contract";

/**
 * FLOW CONSUMPTION OF THE CANONICAL PROFILE (Unification Slice 6).
 *
 * The certified generation stack is FROZEN. This module does not touch it:
 * it is a deterministic INPUT-RESOLUTION layer that turns the canonical
 * Business/Brand Profile + approved Asset Library into the inputs the
 * existing engines already accept (accent colour, design axes, evidence
 * assets, identity, real rating).
 *
 * LAWS enforced here:
 *   - No snapshot → returns null → generation behaves EXACTLY as certified.
 *   - Only APPROVED assets are ever offered to generation. Candidates
 *     harvested from a website are invisible until the customer approves.
 *   - Evidence classes stay evidence: a partner/press/certification mark is
 *     never handed over as brand-owned creative.
 *   - Nothing here fabricates: absent fields stay absent.
 */

export interface ProfileDerivedInputs {
  businessProfileId: number;
  profileVersion: number;
  /** Real business identity for the funnel identity layer. */
  identity: { businessName?: string; websiteUrl?: string; email?: string; phone?: string; logoUrl?: string };
  /** Brand-derived generation axes (only when the profile actually has them). */
  accentColor?: string;
  campaignEnergy?: "calm" | "balanced" | "urgent";
  campaignHumanity?: "product_led" | "balanced" | "people_led";
  visualDensity?: "low" | "medium" | "high";
  /** Approved, classified imagery the evidence pipeline may use. */
  assets: {
    hero?: string;
    product?: string;
    team?: string[];
    environment?: string[];
    /** Real photography from the business, usable for gallery/section media.
     *  Most photos on a real site land here — they are genuinely theirs, we
     *  just aren't claiming what each one depicts. */
    gallery: string[];
    /** Evidence-class marks (partner/press/certification) — rendered as an
     *  evidence strip, never as brand-owned imagery. */
    evidenceLogos: { url: string; label: string }[];
  };
  /** Canonical offers, referenceable by stable id. */
  offers: { id: string; name: string; kind: string }[];
}

const PEOPLE_CLASSES = new Set(["founder", "team", "customer"]);
const EVIDENCE_CLASSES = new Set(["partner", "certification", "evidence"]);

function firstHex(palette: unknown): string | undefined {
  if (!Array.isArray(palette)) return undefined;
  const hex = palette.find((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));
  return typeof hex === "string" ? hex : undefined;
}

/**
 * Resolve generation inputs for a workspace. Returns null when the
 * workspace has no canonical profile — the certified default path.
 */
export async function resolveProfileInputs(subAccountId: string): Promise<ProfileDerivedInputs | null> {
  const snapshot: DivinexProfileSnapshot | null = await getDivinexProfileSnapshot(subAccountId);
  if (!snapshot) return null;

  const business = (snapshot.business ?? {}) as Record<string, unknown>;
  const brand = (snapshot.brand ?? {}) as Record<string, unknown>;
  const visual = (brand.visual ?? {}) as Record<string, unknown>;
  const tokens = (visual.tokens ?? {}) as { logoUrl?: string; palette?: string[]; fonts?: string[] };
  const contact = (business.contact ?? {}) as { email?: string; phone?: string };
  const personality = Array.isArray(visual.personality) ? (visual.personality as string[]) : [];
  const photography = Array.isArray(visual.photographyStyle) ? (visual.photographyStyle as string[]) : [];

  // APPROVED ASSETS ONLY.
  const approved = (snapshot.assets ?? []).filter((a) => (a.status ?? "approved") === "approved");
  const byClass = (cls: string) => approved.filter((a) => a.classification === cls).map((a) => a.fileUrl);

  const evidenceLogos = approved
    .filter((a) => EVIDENCE_CLASSES.has(a.classification ?? ""))
    .slice(0, 8)
    .map((a) => ({ url: a.fileUrl, label: a.classification === "certification" ? "Certification" : "Partner" }));

  const teamShots = [...byClass("founder"), ...byClass("team")];
  const environmentShots = byClass("environment");
  const productShots = byClass("product");
  // Discovery marks a large LANDSCAPE photograph as "hero" — the only class
  // whose shape is known to work in a hero slot.
  const heroShots = byClass("hero");
  const photoShots = byClass("photo");

  // Hero preference: a picture the site itself leads with beats anything we
  // infer. Then evidence value — a real product for product businesses, a
  // real person for people-led ones, an environment shot otherwise — and
  // general photography last. Absent → undefined (engines compose around
  // it and leave an honest labeled placeholder).
  //
  // Note the ordering change: productShots used to come FIRST, which is how
  // an icon misclassified as "product" became a workspace's hero image.
  const hero =
    heroShots[0] ??
    productShots[0] ??
    (photography.includes("people-first") ? teamShots[0] : undefined) ??
    environmentShots[0] ??
    teamShots[0] ??
    photoShots[0];

  // Gallery: every real photo of theirs that isn't already the hero. Ordered
  // so the site's own lead imagery comes first.
  // DEDUPE BY URL. A real site serves the same image from several entries
  // (Wix emits a srcset variant per breakpoint), so discovery legitimately
  // stores it more than once. Without this the same photograph is placed in
  // multiple sections of one page — found at output level on the RWAR probe:
  // 9 image slots, only 6 distinct pictures.
  const gallery = Array.from(
    new Set([...heroShots, ...photoShots, ...byClass("event"), ...byClass("customer")]),
  )
    .filter((url) => url !== hero)
    .slice(0, 12);

  const inputs: ProfileDerivedInputs = {
    businessProfileId: snapshot.businessProfileId,
    profileVersion: snapshot.profileVersion,
    identity: {
      businessName: typeof business.name === "string" ? business.name : undefined,
      websiteUrl: typeof business.websiteUrl === "string" ? business.websiteUrl : undefined,
      email: typeof contact.email === "string" ? contact.email : undefined,
      phone: typeof contact.phone === "string" ? contact.phone : undefined,
      logoUrl: typeof tokens.logoUrl === "string" ? tokens.logoUrl : undefined,
    },
    assets: {
      hero,
      product: productShots[0],
      team: teamShots.slice(0, 4),
      environment: environmentShots.slice(0, 4),
      gallery,
      evidenceLogos,
    },
    offers: snapshot.offers ?? [],
  };

  const accent = firstHex(tokens.palette);
  if (accent) inputs.accentColor = accent;

  if (personality.includes("bold") || personality.includes("energetic")) inputs.campaignEnergy = "urgent";
  else if (personality.includes("calm") || personality.includes("minimal")) inputs.campaignEnergy = "calm";

  if (personality.includes("people-first") || photography.includes("people-first")) inputs.campaignHumanity = "people_led";
  else if (personality.includes("product-first")) inputs.campaignHumanity = "product_led";

  if (personality.includes("minimal")) inputs.visualDensity = "low";
  else if (personality.includes("expressive")) inputs.visualDensity = "high";

  return inputs;
}
