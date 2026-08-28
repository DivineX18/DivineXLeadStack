/**
 * BUSINESS REALITY ENGINE (slice A) — Authenticity Models.
 *
 * Typed knowledge of what REAL-WORLD EVIDENCE makes an offer believable
 * per business category: not "do we have logos," but "for THIS kind of
 * business, which tangible assets (people, products, environments,
 * deliverables, credentials) close the believability gap, and which of
 * them may never be faked."
 *
 * THE CORE LAW (consumed by every downstream slice):
 *   Real evidence      → use it intelligently (place where it reduces
 *                        uncertainty most).
 *   Missing evidence   → request it (asset manifest), compose gracefully
 *                        around the gap.
 *   Ambient imagery    → stock may be appropriate (environment IS the
 *                        evidence for experiential services).
 *   Evidentiary imagery→ NEVER counterfeit it (products, faces, reviews,
 *                        deliverables, addresses).
 *
 * Fabricability classes:
 *   "never"        — only a supplied asset may fill this slot. Stock or
 *                    generated stand-ins would be counterfeit evidence.
 *   "stock_ok"     — ambient/environmental imagery where the ambience
 *                    itself is the honest signal (a dental operatory, a
 *                    warehouse floor). Always marked stock in the builder.
 *   "synthesizable"— presentation of VERIFIED facts is allowed (a styled
 *                    guide-cover mock from the real title/author; a
 *                    framed "Example preview" of the real methodology).
 *                    Synthesized presentation must be visibly an
 *                    example/preview — never dressed as historical
 *                    customer evidence.
 */

export type AuthenticityCategory =
  | "local_service_health" // dentists, clinics, therapists
  | "local_service_trade" // HVAC, plumbing, roofing, detailing
  | "physical_product" // ecom / packaged goods
  | "b2b_services" // integrators, agencies, consultancies
  | "enterprise_software" // SaaS / platform sales
  | "info_product" // lead magnets, guides, courses
  | "coaching" // programs, high-ticket personal services
  | "nonprofit";

export type Fabricability = "never" | "stock_ok" | "synthesizable";

export interface EvidenceAsset {
  /** Stable kind key ("product_photo", "team_photo", "guide_cover", …). */
  kind: string;
  /** Operator-facing label used in the asset manifest. */
  label: string;
  /** How much this asset moves believability for this category. */
  value: "high" | "medium";
  fabricability: Fabricability;
  /** One line of WHY, shown in the manifest. */
  note: string;
}

/** The PRIMARY TRUST QUESTION each category's page must answer — heads the
 *  asset manifest so operators see WHY the assets matter. */
export const TRUST_QUESTIONS: Record<AuthenticityCategory, string> = {
  local_service_health: "Can I trust these people with my body, and will I feel safe here?",
  local_service_trade: "Will these people actually show up, solve it, and treat me fairly?",
  physical_product: "Is this product real, right for me, and worth paying for?",
  b2b_services: "Are these people credible enough to trust with an important business decision?",
  enterprise_software: "Is this vendor credible enough to enter our evaluation/procurement process?",
  info_product: "Is this person worth listening to?",
  coaching: "Can this specific person actually get me the outcome?",
  nonprofit: "Is this organization legitimate, and will my support actually matter?",
};

export const AUTHENTICITY_MODELS: Record<AuthenticityCategory, EvidenceAsset[]> = {
  local_service_health: [
    { kind: "team_photo", label: "Photo of the doctor/team", value: "high", fabricability: "never", note: "Patients book people, not pages — a real face answers 'who will I meet.'" },
    { kind: "office_photo", label: "Photos of your office/rooms", value: "high", fabricability: "stock_ok", note: "The environment answers 'is this a real, professional place.'" },
    { kind: "real_rating", label: "Your Google rating + review count", value: "high", fabricability: "never", note: "Linked, verifiable social proof beats any copy." },
    { kind: "credentials", label: "Credentials/memberships (e.g. ADA)", value: "medium", fabricability: "never", note: "Professional legitimacy signals." },
    { kind: "practice_identity", label: "Practice name, address, phone", value: "high", fabricability: "never", note: "A bookable business has a location and a number." },
  ],
  local_service_trade: [
    { kind: "team_photo", label: "Photo of your crew/trucks", value: "high", fabricability: "never", note: "Real crew and liveried trucks read as 'they actually show up.'" },
    { kind: "job_photo", label: "Photos of real jobs/work", value: "medium", fabricability: "stock_ok", note: "Work-in-progress imagery signals a working operation." },
    { kind: "real_rating", label: "Google rating + review count", value: "high", fabricability: "never", note: "The first thing an emergency searcher checks." },
    { kind: "license", label: "License/insurance numbers", value: "high", fabricability: "never", note: "Regulated-trade legitimacy; state-checkable." },
    { kind: "service_area", label: "Address / service area", value: "medium", fabricability: "never", note: "Local businesses are somewhere." },
  ],
  physical_product: [
    { kind: "product_photo", label: "Product photo (on white/in hand)", value: "high", fabricability: "never", note: "Buyers won't purchase a product they can't see. The single highest-leverage asset." },
    { kind: "packaging_photo", label: "Packaging/label photo", value: "high", fabricability: "never", note: "Ingredient/label transparency is the trust currency of skeptical buyers." },
    { kind: "texture_photo", label: "Texture/application close-up", value: "medium", fabricability: "stock_ok", note: "Generic texture/application ambience is honest context." },
    { kind: "founder_photo", label: "Founder/formulator photo + line", value: "medium", fabricability: "never", note: "'Who makes this' converts skeptics." },
    { kind: "reviews", label: "Real customer reviews/rating", value: "high", fabricability: "never", note: "Supplied verbatim only." },
    { kind: "logistics", label: "Shipping/returns facts", value: "medium", fabricability: "never", note: "Operational reality = a real store." },
  ],
  b2b_services: [
    { kind: "team_photo", label: "The actual team/experts", value: "high", fabricability: "never", note: "Enterprise buyers evaluate the people they'll work with." },
    { kind: "deliverable_preview", label: "A (sanitized) real deliverable", value: "high", fabricability: "synthesizable", note: "Show what they actually receive; synthesized versions must say 'Example preview.'" },
    { kind: "client_logos", label: "Client/partner logos", value: "high", fabricability: "never", note: "Peer proof is the enterprise shortcut." },
    { kind: "facility_photo", label: "Site/floor/environment photos", value: "medium", fabricability: "stock_ok", note: "Industry ambience grounds the domain." },
    { kind: "company_identity", label: "Company name, contacts, location", value: "high", fabricability: "never", note: "A five-figure engagement needs a real counterparty." },
  ],
  enterprise_software: [
    { kind: "product_screenshot", label: "Actual product/interface screenshots", value: "high", fabricability: "never", note: "The product IS the evidence for software." },
    { kind: "certifications", label: "Security/compliance certifications", value: "high", fabricability: "never", note: "SOC2/ISO badges are procurement's first filter." },
    { kind: "client_logos", label: "Customer logos", value: "high", fabricability: "never", note: "Named peers de-risk the shortlist." },
    { kind: "team_photo", label: "Leadership/expert identities", value: "medium", fabricability: "never", note: "'Who evaluates me' needs faces and names." },
    { kind: "deliverable_preview", label: "Sample evaluation/report", value: "medium", fabricability: "synthesizable", note: "Framed 'Example preview' of the real methodology." },
    { kind: "company_identity", label: "Company identity + contact", value: "high", fabricability: "never", note: "Six-figure contracts need a real company on the page." },
  ],
  info_product: [
    { kind: "guide_cover", label: "Cover image of the guide", value: "high", fabricability: "synthesizable", note: "A styled cover from the REAL title/author makes the deliverable tangible." },
    { kind: "author_photo", label: "Author photo + one-line credibility", value: "high", fabricability: "never", note: "'Who wrote this and why should I care' is the whole game." },
    { kind: "preview_pages", label: "A preview page/spread", value: "medium", fabricability: "synthesizable", note: "Show real contents as a clearly-labeled preview." },
    { kind: "brand_identity", label: "Your brand name/logo", value: "medium", fabricability: "never", note: "An author/brand exists somewhere." },
  ],
  coaching: [
    { kind: "coach_photo", label: "Your photo (the coach)", value: "high", fabricability: "never", note: "People hire a person. No face, no trust at this price." },
    { kind: "credentials", label: "Real background/credentials", value: "high", fabricability: "never", note: "Career history is checkable on LinkedIn." },
    { kind: "testimonials", label: "Real client testimonials", value: "high", fabricability: "never", note: "Supplied verbatim only, never synthesized." },
    { kind: "program_artifact", label: "What the program materials look like", value: "medium", fabricability: "synthesizable", note: "Framed preview of the real curriculum." },
  ],
  nonprofit: [
    { kind: "program_photo", label: "Real program/field photos", value: "high", fabricability: "never", note: "Donors give to work they can see; stock children would be counterfeit impact." },
    { kind: "org_identity", label: "Organization name, location, contact", value: "high", fabricability: "never", note: "Legitimacy starts with being findable." },
    { kind: "registration", label: "Charity registration (if held)", value: "high", fabricability: "never", note: "Only when actually supplied — never assumed." },
    { kind: "team_photo", label: "Founder/team photos", value: "medium", fabricability: "never", note: "Who runs this matters to recurring donors." },
  ],
};

/** Genre + archetype → category inference (deterministic floor; the model
 *  can override via the authenticity_category param when it knows better). */
export function inferAuthenticityCategory(input: {
  genre: string;
  archetype?: string | null;
}): AuthenticityCategory {
  const a = (input.archetype ?? "").toLowerCase();
  if (a.includes("medical") || a.includes("wellness") || a.includes("dental")) return "local_service_health";
  if (a.includes("local") || a.includes("trade") || a.includes("service")) return "local_service_trade";
  if (a.includes("ecommerce") || a.includes("product") || a.includes("beauty")) return "physical_product";
  if (a.includes("enterprise") || a.includes("saas") || a.includes("tech")) return "enterprise_software";
  if (a.includes("b2b") || a.includes("professional") || a.includes("corporate")) return "b2b_services";
  if (a.includes("nonprofit") || a.includes("charity")) return "nonprofit";
  if (a.includes("coach") || a.includes("consult")) return "coaching";
  switch (input.genre) {
    case "lead_magnet":
    case "webinar":
      return "info_product";
    case "tripwire":
      return "physical_product";
    case "application":
    case "vsl":
      return "coaching";
    default:
      return "local_service_trade";
  }
}

/** The manifest: top assets for the category, highest leverage first. */
export function assetManifest(category: AuthenticityCategory, max = 5): EvidenceAsset[] {
  const list = AUTHENTICITY_MODELS[category] ?? [];
  return [...list].sort((x, y) => (x.value === y.value ? 0 : x.value === "high" ? -1 : 1)).slice(0, max);
}

/** Slice C consumer: may STOCK imagery honestly fill this slot kind? */
export function stockAllowedFor(category: AuthenticityCategory, slotKind: string): boolean {
  const asset = (AUTHENTICITY_MODELS[category] ?? []).find((x) => x.kind === slotKind);
  if (asset) return asset.fabricability === "stock_ok";
  // Unknown slots default to ambient-permitted — the named "never" kinds
  // are the counterfeit-evidence surface.
  return true;
}
