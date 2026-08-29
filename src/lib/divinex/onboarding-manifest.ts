/**
 * DIVINEX ONBOARDING FRAMEWORK (Unification Slice 4).
 *
 * ONE adaptive framework, three modes (complete | ascend | flow) expressed
 * as DATA, not code. The runtime renders one step at a time, persists each
 * answer to the canonical profile through Ascend, and — per the
 * progressive-enrichment law — SKIPS anything DivineX already knows with
 * sufficient confidence (offering confirmation instead of re-asking when
 * the value was merely extracted/inferred).
 *
 * Onboarding establishes DURABLE CONTEXT (business, brand, assets, core
 * offers, growth situation). It is NOT campaign setup: campaign intent is
 * gathered by the Campaign Architect when the customer actually wants to
 * build something (Campaign Architect addendum).
 */

export type OnboardingMode = "complete" | "ascend" | "flow";

export type StepKind =
  | "intro"
  | "question"
  | "website_connect"
  | "brand_review"
  | "asset_review"
  | "visual_preference"
  | "reveal";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

export interface OnboardingStep {
  id: string;
  kind: StepKind;
  /** Question copy — one primary task per screen. */
  prompt?: string;
  helper?: string;
  inputType?: "text" | "textarea" | "url" | "choice" | "multi";
  options?: ChoiceOption[];
  placeholder?: string;
  optional?: boolean;
  /** Canonical destination: "business.<field>" | "brandVisual.<field>" |
   *  "brandVoice.<field>". The runtime patches exactly this path. */
  field?: string;
  /** Progressive enrichment: profile paths that, when already present,
   *  make this step skippable (or confirm-only when not yet confirmed). */
  knownFrom?: string[];
  /** Branch: only show when a previously answered step matches. */
  showIf?: { stepId: string; equals?: string; notEquals?: string; oneOf?: string[] };
  /** Which modes include this step. */
  modes: OnboardingMode[];
}

/**
 * The manifest. Deliberately compact: every question either materially
 * changes what Ascend can diagnose or what Flow can build. Anything a
 * website scan can answer is NOT asked when a site is connected.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "intro",
    kind: "intro",
    modes: ["complete", "ascend", "flow"],
    prompt: "Let's teach DivineX how your business works",
    helper: "A few questions and, if you have one, your website. Everything you tell us gets used to build your growth system.",
  },
  {
    id: "website",
    kind: "website_connect",
    modes: ["complete", "ascend", "flow"],
    prompt: "Do you have a website?",
    helper: "Paste it and DivineX will learn your business, brand and assets automatically. You can skip this if you don't have one yet.",
    inputType: "url",
    placeholder: "yourbusiness.com",
    optional: true,
    field: "business.websiteUrl",
    knownFrom: ["business.websiteUrl"],
  },
  {
    id: "brand_review",
    kind: "brand_review",
    modes: ["complete", "ascend", "flow"],
    prompt: "Here's what we learned about your brand",
    helper: "Confirm what's right. Anything you change becomes the truth DivineX builds from.",
    showIf: { stepId: "website", notEquals: "" },
  },
  {
    id: "asset_review",
    kind: "asset_review",
    modes: ["complete", "flow"],
    prompt: "We found these assets on your site",
    helper: "Approve the ones we can use in your marketing. Nothing is used until you approve it.",
    showIf: { stepId: "website", notEquals: "" },
  },
  {
    id: "visual_preference",
    kind: "visual_preference",
    modes: ["complete", "flow"],
    prompt: "Which feels more like your brand?",
    helper: "This shapes how your pages look and feel.",
    showIf: { stepId: "website", equals: "" },
  },
  {
    id: "business_name",
    kind: "question",
    modes: ["complete", "ascend", "flow"],
    prompt: "What's your business called?",
    inputType: "text",
    field: "business.businessName",
    knownFrom: ["business.name"],
    placeholder: "Acme Dental",
  },
  {
    id: "business_type",
    kind: "question",
    modes: ["complete", "ascend", "flow"],
    prompt: "What kind of business is this?",
    helper: "This decides which evidence makes your pages believable.",
    inputType: "choice",
    field: "business.businessType",
    knownFrom: ["business.type"],
    options: [
      { value: "local_service", label: "Local service", description: "Trades, home services, auto, repair" },
      { value: "health_practice", label: "Health practice", description: "Dental, medical, therapy, wellness" },
      { value: "ecommerce", label: "Physical product", description: "You ship something to customers" },
      { value: "b2b_services", label: "B2B services", description: "Agencies, consultancies, integrators" },
      { value: "software", label: "Software / SaaS", description: "You sell a platform or app" },
      { value: "creator_coach", label: "Creator or coach", description: "Courses, coaching, content, programs" },
      { value: "nonprofit", label: "Nonprofit", description: "Donations, programs, community" },
    ],
  },
  {
    id: "primary_offer",
    kind: "question",
    modes: ["complete", "ascend", "flow"],
    prompt: "What's the main thing you sell?",
    helper: "One sentence is plenty. Include the price if there is one.",
    inputType: "textarea",
    field: "business.offer",
    knownFrom: ["business.offer", "offers.0.name"],
    placeholder: "A $4,500 twelve-week leadership coaching program for mid-career managers",
  },
  {
    id: "audience",
    kind: "question",
    modes: ["complete", "ascend", "flow"],
    prompt: "Who buys it?",
    helper: "The more specific the better. Who are they, and what are they dealing with?",
    inputType: "textarea",
    field: "business.audience",
    knownFrom: ["business.audience"],
    placeholder: "Parents in Houston with kids in grades 3-8 who are worried about reading levels",
  },
  {
    id: "objective",
    kind: "question",
    modes: ["complete", "flow"],
    prompt: "What should marketing do for you right now?",
    inputType: "choice",
    field: "business.goals",
    options: [
      { value: "leads", label: "Get more leads", description: "Capture interest and follow up" },
      { value: "appointments", label: "Book appointments", description: "Fill the calendar" },
      { value: "sales", label: "Sell online", description: "Take payment directly" },
      { value: "applications", label: "Get qualified applications", description: "Screen before a call" },
      { value: "donations", label: "Raise donations", description: "Recurring or one-time giving" },
    ],
  },
  {
    id: "constraint",
    kind: "question",
    modes: ["complete", "ascend"],
    prompt: "What's holding growth back most right now?",
    helper: "Your honest read. Ascend will check it against what it finds.",
    inputType: "choice",
    field: "business.notes",
    options: [
      { value: "not_enough_traffic", label: "Not enough people find us" },
      { value: "traffic_not_converting", label: "People visit but don't convert" },
      { value: "leads_not_closing", label: "Leads don't turn into customers" },
      { value: "no_followup", label: "We don't follow up consistently" },
      { value: "unclear_offer", label: "Our offer isn't landing" },
      { value: "not_sure", label: "I'm not sure — that's why I'm here" },
    ],
  },
  {
    id: "revenue",
    kind: "question",
    modes: ["complete", "ascend"],
    prompt: "Roughly what does the business do monthly?",
    helper: "Used to judge what's worth recommending. Never shown publicly.",
    inputType: "choice",
    optional: true,
    field: "business.monthlyRevenue",
    knownFrom: ["business.monthlyRevenue"],
    options: [
      { value: "pre_revenue", label: "Just getting started" },
      { value: "under_10k", label: "Under $10k" },
      { value: "10k_50k", label: "$10k - $50k" },
      { value: "50k_250k", label: "$50k - $250k" },
      { value: "250k_plus", label: "$250k+" },
    ],
  },
  {
    id: "reveal",
    kind: "reveal",
    modes: ["complete", "ascend", "flow"],
    prompt: "Your Growth System is Ready",
  },
];

export const MODE_PROMISE: Record<OnboardingMode, { title: string; cta: string; completion: string }> = {
  complete: {
    title: "Build My Growth System",
    cta: "Teach DivineX how your business works",
    completion: "Your Growth System is Ready",
  },
  ascend: {
    title: "Build My Growth Intelligence Profile",
    cta: "Find what's holding back your growth",
    completion: "Your Growth Intelligence Profile is Ready",
  },
  flow: {
    title: "Build My Marketing System",
    cta: "Set up your marketing system",
    completion: "Your Marketing System is Ready",
  },
};

/** Read a dotted path out of the profile contract. */
export function readProfilePath(profile: Record<string, unknown> | null, path: string): unknown {
  if (!profile) return null;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return null;
    if (Array.isArray(acc)) return acc[Number(key)] ?? null;
    return (acc as Record<string, unknown>)[key] ?? null;
  }, profile);
}

/** Provenance status for a canonical field, when recorded. */
export function provenanceStatus(profile: Record<string, unknown> | null, field: string): string | null {
  const prov = readProfilePath(profile, "brand.provenance") as Record<string, { status?: string }> | null;
  if (!prov) return null;
  const key = field.split(".").pop() ?? field;
  return prov[key]?.status ?? prov[field]?.status ?? null;
}

/**
 * PROGRESSIVE ENRICHMENT: never ask for what DivineX already knows with
 * sufficient confidence. Returns "ask" | "confirm" | "skip".
 *   - supplied/confirmed value present → skip
 *   - extracted/inferred value present → confirm (prefilled, one tap)
 *   - nothing → ask
 */
export function stepDisposition(
  step: OnboardingStep,
  profile: Record<string, unknown> | null,
): { disposition: "ask" | "confirm" | "skip"; value: unknown } {
  if (!step.knownFrom?.length) return { disposition: "ask", value: null };
  for (const path of step.knownFrom) {
    const value = readProfilePath(profile, path);
    if (value !== null && value !== undefined && value !== "") {
      const status = step.field ? provenanceStatus(profile, step.field) : null;
      if (status === "extracted" || status === "inferred") return { disposition: "confirm", value };
      return { disposition: "skip", value };
    }
  }
  return { disposition: "ask", value: null };
}

/** Steps for a mode, after branch + enrichment filtering. */
export function resolveSteps(
  mode: OnboardingMode,
  profile: Record<string, unknown> | null,
  answers: Record<string, string>,
): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => {
    if (!step.modes.includes(mode)) return false;
    if (step.showIf) {
      const answer = answers[step.showIf.stepId] ?? "";
      if (step.showIf.equals !== undefined && answer !== step.showIf.equals) return false;
      if (step.showIf.notEquals !== undefined && answer === step.showIf.notEquals) return false;
      if (step.showIf.oneOf && !step.showIf.oneOf.includes(answer)) return false;
    }
    if (step.kind === "question" && stepDisposition(step, profile).disposition === "skip") return false;
    return true;
  });
}

/** Visual-preference pairs for the no-website path (compact, evolvable). */
export const VISUAL_PAIRS: { id: string; left: ChoiceOption; right: ChoiceOption }[] = [
  {
    id: "energy",
    left: { value: "calm", label: "Calm and considered" },
    right: { value: "energetic", label: "Bold and energetic" },
  },
  {
    id: "density",
    left: { value: "minimal", label: "Minimal, lots of space" },
    right: { value: "expressive", label: "Rich and expressive" },
  },
  {
    id: "humanity",
    left: { value: "people_first", label: "People-first" },
    right: { value: "product_first", label: "Product-first" },
  },
];
