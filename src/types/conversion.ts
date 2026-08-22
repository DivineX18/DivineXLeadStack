/**
 * DivineX Conversion Campaign Intelligence — shared types.
 *
 * This is the KEYSTONE data layer of the Conversion Engine (Phase 0 audit,
 * P1). Two things live here:
 *
 *  1. `ConversionFramework` — the shape of one versioned entry in the DivineX
 *     Conversion Framework Library (see lib/conversion/framework-library.ts).
 *     A framework is a distilled PRINCIPLE (why / when / how to reason), never
 *     a fill-in-the-blank template — that distinction is the whole point of
 *     Phase 1 of the mandate.
 *
 *  2. `CampaignStrategy` — the Campaign Strategy Object. ONE structured,
 *     saved strategy that every downstream asset (landing page, form,
 *     thank-you, email sequence, workflow, CRM stages, tracking, ad copy)
 *     reads from, so the whole campaign says one coherent thing. Missing
 *     information is NEVER invented — it is recorded in `unknowns` so
 *     generation writes around it honestly.
 *
 * Purely additive: nothing imports these yet in a live path. Milestone 1 of
 * the keystone is the schema + library + a deterministic verify script; a
 * later milestone wires them into create_funnel / the strategy builder /
 * the Build-Campaign orchestrator.
 */

// ─── Framework Library ────────────────────────────────────────────────────

/** The five framework families in the DivineX Conversion Framework Library. */
export type FrameworkFamily =
  | "copywriting"
  | "buyer_psychology"
  | "offer"
  | "landing_page"
  | "email";

/**
 * Eugene Schwartz's five awareness levels — where the reader stands relative
 * to their problem and your solution. Determines where a page must OPEN.
 */
export type AwarenessLevel =
  | "unaware"
  | "problem_aware"
  | "solution_aware"
  | "product_aware"
  | "most_aware";

/**
 * Market sophistication (Schwartz) — how many times this market has already
 * heard a claim like yours. Determines how hard the claim must work
 * (1 = first to make it; 5 = burned out, identify/mechanism-led).
 */
export type SophisticationStage = 1 | 2 | 3 | 4 | 5;

/** How warm the visitor is to THIS specific business at arrival. */
export type TrafficTemperature = "cold" | "warm" | "hot";

/**
 * A single, versioned conversion framework. Stores everything the mandate's
 * Phase 1 asks for so the engine can REASON about which framework to use and
 * WHY — not just paste a structure.
 */
export interface ConversionFramework {
  /** Stable kebab-case id — the handle the strategy's frameworkStack stores. */
  id: string;
  family: FrameworkFamily;
  name: string;
  /** Bumped on any meaningful change so campaigns can pin the version used. */
  version: string;
  /** One line: what this framework is for. */
  purpose: string;
  /** Concrete situations where it applies. */
  useCases: string[];
  /** Situations where it actively HURTS — the guardrail against misuse. */
  whenNotToUse: string[];
  /** The strategy inputs this framework needs to be applied well. */
  requiredInputs: string[];
  /** "If X then Y" logic the engine reasons with when selecting/applying it. */
  decisionRules: string[];
  /** The (honest) psychological principles it works through. */
  psychologicalPrinciples: string[];
  /** The ordered structural moves — the anatomy, never finished copy. */
  structure: string[];
  /** How to grade an output made with this framework — drives the rewrite loop. */
  evaluationCriteria: string[];
  /** Common ways it's executed badly — the anti-patterns to catch. */
  failureModes: string[];
  /** Other framework ids that stack well with this one. */
  compatibleFrameworks: string[];
  /** Retrieval hints — synonyms + related terms. */
  tags: string[];
  /** Honest provenance. Names established public frameworks where relevant;
   *  never fabricates authority. */
  source: string;
}

// ─── Campaign Strategy Object ─────────────────────────────────────────────

/** Where a piece of the strategy came from — honest provenance, so the
 *  engine (and the operator) can tell a real fact from an inference. */
export type StrategyFieldSource =
  | "user_input"
  | "ascend_profile"
  | "growth_scan"
  | "website_evidence"
  | "brand_voice"
  | "crm_history"
  | "inferred" // AI-reasoned from provided context — allowed, but flagged as such
  | "unknown"; // genuinely not known — NEVER invented downstream

/** The campaign's top-level objective — maps onto a landing_page framework
 *  and a post-conversion email sequence archetype. */
export type CampaignObjective =
  | "lead_generation"
  | "appointment"
  | "application"
  | "free_trial"
  | "purchase"
  | "webinar_registration"
  | "audit_request"
  | "consultation"
  | "event_registration"
  | "donation";

export interface CampaignBusiness {
  name: string | null;
  /** Industry / vertical, e.g. "HVAC", "dental", "B2B SaaS". */
  businessType: string | null;
  /** Business model, e.g. "local service", "self-serve SaaS", "high-ticket coaching". */
  model: string | null;
  website: string | null;
  location: string | null;
  differentiators: string[];
  brandVoice: string | null;
  existingAssets: string[];
}

export interface CampaignAudience {
  /** Ideal customer profile in a sentence. */
  icp: string | null;
  primaryPain: string | null;
  desiredOutcome: string | null;
  awareness: AwarenessLevel | null;
  sophistication: SophisticationStage | null;
  objections: string[];
  fears: string[];
  motivations: string[];
  buyingCriteria: string[];
}

export interface CampaignOffer {
  productOrService: string | null;
  priceCents: number | null;
  /** The before → after the offer delivers. */
  transformation: string | null;
  /** The unique "how" — why this works when other things didn't. */
  mechanism: string | null;
  /** ONLY when the business actually offers one. Never invented. */
  guarantee: string | null;
  /** ONLY real, verifiable proof. Never fabricated. */
  proof: string[];
  /** ONLY genuine urgency/scarcity. Never a fake deadline. */
  urgency: string | null;
  cta: string | null;
  /** The tracked conversion event, e.g. "form_submitted", "booking_completed". */
  conversionEvent: string | null;
}

export interface CampaignContext {
  /** e.g. "google_search", "pmax", "meta", "linkedin", "email", "organic". */
  trafficSource: string | null;
  objective: CampaignObjective | null;
  temperature: TrafficTemperature | null;
  /** Search intent phrase, when the source is search. */
  searchIntent: string | null;
  device: string | null;
  geo: string | null;
}

/**
 * The DERIVED strategy — the reasoning the engine commits to once, that every
 * asset then reads. This is what keeps the ad, page, and emails saying the
 * same thing (message match).
 */
export interface DerivedStrategy {
  primaryCustomer: string | null;
  primaryPain: string | null;
  primaryDesiredOutcome: string | null;
  /** The single sentence the whole campaign promises. */
  centralPromise: string | null;
  uniqueMechanism: string | null;
  /** What the reader must BELIEVE to act. */
  coreBeliefRequired: string | null;
  awareness: AwarenessLevel | null;
  sophistication: SophisticationStage | null;
  majorObjections: string[];
  proofRequirements: string[];
  offerStructure: string | null;
  /** Resolves to a landing_page framework id / funnel genre. */
  pageType: string | null;
  funnelType: string | null;
  ctaStrategy: string | null;
  followUpStrategy: string | null;
  /** The selected ConversionFramework ids — the framework stack for this campaign. */
  frameworkStack: string[];
}

/** Current schema version of the Campaign Strategy Object. */
export const CAMPAIGN_STRATEGY_VERSION = "1.0.0";

// ─── Shared Intelligence Layer (Ascend → Flow handoff) ────────────────────

/**
 * The unified DivineX Intelligence Layer, as CONSUMED by Flow. Ascend
 * (Diagnose / Analyze / Recommend / Prioritize) populates it and hands it to
 * Flow (Execute / Build / Automate / Measure) so a campaign is built from what
 * DivineX already knows about the business — never re-asked, never invented.
 *
 * Every field is optional: absent = not handed off (a direct-in-Flow build),
 * and the Strategy Builder records the resulting gap in `unknowns` rather than
 * guessing. The Ascend side owns populating these shapes; Flow only reads them.
 */
export interface GrowthScanContext {
  overallScore: number | null; // 0-100 growth score
  primaryConstraint: string | null; // the #1 growth constraint Ascend diagnosed
  growthStage: string | null;
  topOpportunities: string[];
  websiteUrl: string | null;
  businessType: string | null;
}
export interface BrandVoiceContext {
  tone: string | null; // e.g. "warm, plain-spoken, confident"
  descriptors: string[];
  avoid: string[]; // words/phrases the brand does not use
  sampleCopy: string | null;
}
export interface CroContext {
  findings: string[]; // CRO audit findings
  primaryLeak: string | null; // e.g. "no lead capture above the fold"
}
export interface BusinessMemoryContext {
  summary: string | null; // persistent business description
  differentiators: string[];
  pastAssets: string[];
  knownAudience: string | null;
  knownOffer: string | null;
}
export interface AnalyticsContext {
  topTrafficSource: string | null;
  topConvertingPage: string | null;
  notableMetrics: string[];
}
export interface IntelligenceContext {
  businessMemory?: BusinessMemoryContext;
  brandVoice?: BrandVoiceContext;
  growthScan?: GrowthScanContext;
  cro?: CroContext;
  analytics?: AnalyticsContext;
}

export interface CampaignStrategy {
  /** Schema version — pinned so a later schema change can migrate safely. */
  version: string;
  /** Set when persisted to Firestore. */
  id: string | null;
  subAccountId: string | null;
  agencyId: string | null;
  createdByUid: string | null;
  business: CampaignBusiness;
  audience: CampaignAudience;
  offer: CampaignOffer;
  context: CampaignContext;
  derived: DerivedStrategy;
  /** Per-area provenance — honest record of where each block came from. */
  sources: Partial<Record<keyof Omit<CampaignStrategy, "sources" | "unknowns" | "version" | "id" | "createdAt" | "updatedAt">, StrategyFieldSource>>;
  /** Explicit list of what is NOT known. Downstream generation MUST write
   *  around these, never invent a value to fill them. This is the
   *  anti-fabrication guardrail made concrete at the data layer. */
  unknowns: string[];
  /** The shared Intelligence Layer this strategy was built from, if any —
   *  carried whole so downstream generation and the orchestrator can read the
   *  full diagnosis (growth-scan constraint, CRO leak, brand voice) that
   *  informed it, not just the fields it hydrated. */
  intelligence?: IntelligenceContext;
  /** Firestore Timestamps once persisted. */
  createdAt?: unknown;
  updatedAt?: unknown;
}
