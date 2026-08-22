/**
 * Campaign Strategy Builder (Conversion Engine, P1 keystone — Milestone 2).
 *
 * Assembles a Campaign Strategy Object from whatever inputs exist and derives
 * the parts that are DETERMINISTICALLY knowable — the funnel genre / page
 * type, the offer structure, the CTA + follow-up strategy, and the framework
 * stack. The narrative, judgement-heavy fields (central promise, unique
 * mechanism, core belief, inferred awareness/sophistication) are intentionally
 * left null here and recorded in `unknowns[]`: they are the AI-enrichment
 * layer's job (a later milestone), and until they're filled honestly they must
 * NOT be invented. This function is the deterministic spine that enrichment,
 * the Build-Campaign orchestrator, and every asset generator hang off.
 *
 * Pure — no LLM, no Firestore, no side effects — so it's trivially testable and
 * safe to call anywhere. Persistence + AI enrichment compose on top.
 */

import type {
  CampaignStrategy,
  CampaignBusiness,
  CampaignAudience,
  CampaignOffer,
  CampaignContext,
  CampaignObjective,
  DerivedStrategy,
  StrategyFieldSource,
} from "@/types/conversion";
import { CAMPAIGN_STRATEGY_VERSION } from "@/types/conversion";
import type { FunnelGenre } from "@/types/funnels";
import { frameworksForStrategy } from "./framework-library";

/**
 * Map a campaign objective (+ whether the offer is priced) onto the funnel
 * genre that best fits it. Deterministic default — the AI/operator can
 * override to an adjacent genre (e.g. a high-ticket free_trial to `vsl`), but
 * this is the sensible starting architecture per page-architecture-by-intent.
 */
export function funnelGenreForObjective(
  objective: CampaignObjective | null,
  priced: boolean,
): FunnelGenre {
  switch (objective) {
    case "purchase":
      return "tripwire"; // a real priced sales page
    case "application":
      return "application";
    case "webinar_registration":
    case "event_registration":
      return "webinar";
    case "free_trial":
      // A self-serve trial is a short capture-style page; a high-ticket,
      // demo-led trial reads better as a VSL — but default to the lighter one.
      return "lead_gen";
    case "appointment":
    case "consultation":
    case "audit_request":
    case "lead_generation":
    case "donation":
      return "lead_gen";
    case null:
    default:
      // No stated objective + a price implies a sales page; otherwise the
      // lowest-commitment capture page.
      return priced ? "tripwire" : "lead_gen";
  }
}

function ctaStrategyForObjective(objective: CampaignObjective | null): string {
  switch (objective) {
    case "appointment":
    case "consultation":
      return "Book a call (popup calendar), phone fallback";
    case "application":
      return "Apply now → qualifying application form";
    case "free_trial":
      return "Start free trial (single primary CTA)";
    case "purchase":
      return "Buy now → checkout (single primary CTA)";
    case "webinar_registration":
    case "event_registration":
      return "Register (popup form)";
    case "audit_request":
      return "Request my audit (popup form)";
    case "donation":
      return "Donate (single primary CTA)";
    case "lead_generation":
    default:
      return "Get [the offer] (popup lead form)";
  }
}

function followUpStrategyForObjective(objective: CampaignObjective | null): string {
  switch (objective) {
    case "appointment":
    case "consultation":
      return "Confirmation → prep → reminder → no-show branch; stop booking nudges once booked";
    case "free_trial":
      return "Welcome → activation → first-value → objection handling → convert; stop pre-trial nurture on trial start";
    case "purchase":
      return "Receipt → onboarding → next-step; stop the sales sequence on purchase";
    case "webinar_registration":
    case "event_registration":
      return "Confirmation → reminders → show-up sequence → replay/offer branch";
    case "audit_request":
      return "Confirmation → report delivery → report education → CTA → follow-up";
    case "lead_generation":
    default:
      return "Deliver value → educate → mechanism → objection handling → proof → offer; stop on conversion";
  }
}

function offerStructureFor(priced: boolean): string {
  return priced
    ? "Value stack of real deliverables → total-value anchor → price reveal → real guarantee → honest urgency"
    : "Single low-friction ask — one clear thing received in exchange for contact details";
}

export interface StrategyBuilderInput {
  subAccountId?: string | null;
  agencyId?: string | null;
  createdByUid?: string | null;
  business?: Partial<CampaignBusiness>;
  audience?: Partial<CampaignAudience>;
  offer?: Partial<CampaignOffer>;
  context?: Partial<CampaignContext>;
}

function coalesceBusiness(b?: Partial<CampaignBusiness>): CampaignBusiness {
  return {
    name: b?.name ?? null,
    businessType: b?.businessType ?? null,
    model: b?.model ?? null,
    website: b?.website ?? null,
    location: b?.location ?? null,
    differentiators: b?.differentiators ?? [],
    brandVoice: b?.brandVoice ?? null,
    existingAssets: b?.existingAssets ?? [],
  };
}
function coalesceAudience(a?: Partial<CampaignAudience>): CampaignAudience {
  return {
    icp: a?.icp ?? null,
    primaryPain: a?.primaryPain ?? null,
    desiredOutcome: a?.desiredOutcome ?? null,
    awareness: a?.awareness ?? null,
    sophistication: a?.sophistication ?? null,
    objections: a?.objections ?? [],
    fears: a?.fears ?? [],
    motivations: a?.motivations ?? [],
    buyingCriteria: a?.buyingCriteria ?? [],
  };
}
function coalesceOffer(o?: Partial<CampaignOffer>): CampaignOffer {
  return {
    productOrService: o?.productOrService ?? null,
    priceCents: o?.priceCents ?? null,
    transformation: o?.transformation ?? null,
    mechanism: o?.mechanism ?? null,
    guarantee: o?.guarantee ?? null,
    proof: o?.proof ?? [],
    urgency: o?.urgency ?? null,
    cta: o?.cta ?? null,
    conversionEvent: o?.conversionEvent ?? null,
  };
}
function coalesceContext(c?: Partial<CampaignContext>): CampaignContext {
  return {
    trafficSource: c?.trafficSource ?? null,
    objective: c?.objective ?? null,
    temperature: c?.temperature ?? null,
    searchIntent: c?.searchIntent ?? null,
    device: c?.device ?? null,
    geo: c?.geo ?? null,
  };
}

/** True when the offer carries a real, positive price. */
export function isPricedOffer(offer: CampaignOffer): boolean {
  return typeof offer.priceCents === "number" && offer.priceCents > 0;
}

/**
 * The honest "what don't we know" list. Downstream generation reads this and
 * writes around each gap instead of inventing a value. Only the facts that
 * actually matter for a coherent campaign are surfaced (not every null field).
 */
export function computeUnknowns(s: {
  business: CampaignBusiness;
  audience: CampaignAudience;
  offer: CampaignOffer;
  context: CampaignContext;
}): string[] {
  const u: string[] = [];
  if (!s.business.businessType) u.push("business type / industry");
  if (!s.business.model) u.push("business model");
  if (!s.offer.productOrService) u.push("what the offer actually is");
  if (!s.audience.primaryPain) u.push("audience's primary pain");
  if (!s.audience.desiredOutcome) u.push("audience's desired outcome");
  if (!s.offer.mechanism) u.push("unique mechanism (why this works)");
  if (!s.audience.awareness) u.push("audience awareness level (must be inferred, not assumed)");
  if (!s.audience.sophistication) u.push("market sophistication stage");
  if (s.offer.proof.length === 0) u.push("real proof / results (none supplied — do not fabricate any)");
  if (!s.offer.guarantee) u.push("guarantee (none supplied — do not invent one)");
  if (!s.offer.urgency) u.push("genuine urgency (none supplied — do not fabricate a deadline)");
  if (!s.context.objective) u.push("campaign objective");
  if (!s.context.trafficSource) u.push("traffic source");
  return u;
}

/**
 * Build a Campaign Strategy Object from the provided inputs. Deterministic
 * derivations only; narrative fields left null + logged in `unknowns` for the
 * AI-enrichment pass. Provenance is recorded per top-level block: "user_input"
 * where anything was supplied, "unknown" where the whole block was empty.
 */
export function buildCampaignStrategy(input: StrategyBuilderInput): CampaignStrategy {
  const business = coalesceBusiness(input.business);
  const audience = coalesceAudience(input.audience);
  const offer = coalesceOffer(input.offer);
  const context = coalesceContext(input.context);
  const priced = isPricedOffer(offer);

  const genre = funnelGenreForObjective(context.objective, priced);
  const frameworkStack = frameworksForStrategy({
    objective: context.objective,
    awareness: audience.awareness,
    temperature: context.temperature,
    priced,
  });

  const derived: DerivedStrategy = {
    primaryCustomer: audience.icp,
    primaryPain: audience.primaryPain,
    primaryDesiredOutcome: audience.desiredOutcome,
    centralPromise: null, // AI-enrichment fills this from the whole strategy
    uniqueMechanism: offer.mechanism,
    coreBeliefRequired: null, // AI-enrichment
    awareness: audience.awareness,
    sophistication: audience.sophistication,
    majorObjections: audience.objections,
    proofRequirements: offer.proof.length > 0 ? offer.proof : [],
    offerStructure: offerStructureFor(priced),
    pageType: genre,
    funnelType: genre,
    ctaStrategy: ctaStrategyForObjective(context.objective),
    followUpStrategy: followUpStrategyForObjective(context.objective),
    frameworkStack,
  };

  const nonEmpty = (obj: object): boolean =>
    Object.values(obj).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined));

  const sources: CampaignStrategy["sources"] = {
    business: nonEmpty(business) ? "user_input" : "unknown",
    audience: nonEmpty(audience) ? "user_input" : "unknown",
    offer: nonEmpty(offer) ? "user_input" : "unknown",
    context: nonEmpty(context) ? "user_input" : "unknown",
    derived: "inferred",
  };

  return {
    version: CAMPAIGN_STRATEGY_VERSION,
    id: null,
    subAccountId: input.subAccountId ?? null,
    agencyId: input.agencyId ?? null,
    createdByUid: input.createdByUid ?? null,
    business,
    audience,
    offer,
    context,
    derived,
    sources,
    unknowns: computeUnknowns({ business, audience, offer, context }),
  };
}
