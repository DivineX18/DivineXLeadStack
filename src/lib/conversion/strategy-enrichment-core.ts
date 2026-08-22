import type {
  CampaignStrategy,
  AwarenessLevel,
  SophisticationStage,
} from "@/types/conversion";
import { computeUnknowns } from "./strategy-builder";

/**
 * Campaign Strategy Enrichment — PURE core (Conversion Engine, M7).
 *
 * The prompt builder, response parser, and applier that turn the deterministic
 * strategy's null narrative fields (central promise, unique mechanism, core
 * belief, inferred awareness/sophistication) into grounded, non-fabricated
 * values. All PURE + deterministic + dependency-light (only types +
 * computeUnknowns), so they run anywhere and are tested directly. The
 * server-only LLM wrapper (enrichCampaignStrategy) lives in
 * strategy-enrichment.ts and composes these.
 */

export interface StrategyEnrichment {
  centralPromise?: string | null;
  uniqueMechanism?: string | null;
  coreBeliefRequired?: string | null;
  awareness?: AwarenessLevel | null;
  sophistication?: SophisticationStage | null;
}

const AWARENESS_VALUES: AwarenessLevel[] = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"];
function isAwareness(v: unknown): v is AwarenessLevel {
  return typeof v === "string" && (AWARENESS_VALUES as string[]).includes(v);
}
function isSophistication(v: unknown): v is SophisticationStage {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}
function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function factLine(label: string, value: string | null | undefined): string | null {
  return value ? `- ${label}: ${value}` : null;
}

/** Build the enrichment prompt from a strategy. Feeds ONLY the facts the
 *  strategy holds, plus the explicit unknowns with a no-fabrication rule. */
export function buildStrategyEnrichmentPrompt(strategy: CampaignStrategy): { system: string; user: string } {
  const b = strategy.business;
  const a = strategy.audience;
  const o = strategy.offer;
  const c = strategy.context;
  const gs = strategy.intelligence?.growthScan;
  const cro = strategy.intelligence?.cro;

  const facts = [
    factLine("Business", b.name),
    factLine("Business type", b.businessType),
    factLine("Business model", b.model),
    factLine("Differentiators", b.differentiators.length ? b.differentiators.join("; ") : null),
    factLine("Brand voice", b.brandVoice),
    factLine("Offer", o.productOrService),
    factLine("Price (cents)", o.priceCents != null ? String(o.priceCents) : null),
    factLine("Transformation (before → after)", o.transformation),
    factLine("Stated mechanism", o.mechanism),
    factLine("Real proof supplied", o.proof.length ? o.proof.join("; ") : null),
    factLine("Audience (ICP)", a.icp),
    factLine("Primary pain", a.primaryPain),
    factLine("Desired outcome", a.desiredOutcome),
    factLine("Known objections", a.objections.length ? a.objections.join("; ") : null),
    factLine("Objective", c.objective),
    factLine("Traffic source", c.trafficSource),
    factLine("Traffic temperature", c.temperature),
    factLine("Diagnosed growth constraint (Ascend)", gs?.primaryConstraint),
    factLine("CRO primary leak (Ascend)", cro?.primaryLeak),
  ].filter(Boolean);

  const system =
    "You are a senior direct-response strategist. Given ONLY the verified facts about a business, offer, and audience, infer the campaign's strategic core. " +
    "You reason from what is given — you NEVER invent a fact, statistic, proof point, testimonial, guarantee, customer count, or a mechanism the facts don't support. " +
    "If a field cannot be grounded in the provided facts, return null for it rather than guessing. Awareness and sophistication are the exception: infer them from the audience, offer, and traffic, since they are judgements, not facts. " +
    "Return ONLY a JSON object, no markdown, no commentary, with exactly these keys:\n" +
    '{ "centralPromise": string|null, "uniqueMechanism": string|null, "coreBeliefRequired": string|null, "awareness": "unaware"|"problem_aware"|"solution_aware"|"product_aware"|"most_aware"|null, "sophistication": 1|2|3|4|5|null }\n' +
    "- centralPromise: the single specific promise the whole campaign makes (grounded in the real outcome/offer).\n" +
    "- uniqueMechanism: the specific 'how/why this works' ONLY if the facts imply one; else null. Never invent a proprietary system.\n" +
    "- coreBeliefRequired: the one thing the reader must believe to act.\n" +
    "- awareness: where the reader stands relative to the problem/solution.\n" +
    "- sophistication: how many times this market has heard claims like this (1 first, 5 burned out).";

  const user =
    `VERIFIED FACTS (the only things known — do not add to them):\n${facts.join("\n")}\n\n` +
    (strategy.unknowns.length
      ? `NOT KNOWN (never invent values for these):\n${strategy.unknowns.map((u) => `- ${u}`).join("\n")}\n\n`
      : "") +
    "Return the JSON object now.";

  return { system, user };
}

/** Parse the model's JSON reply into a StrategyEnrichment. Tolerant of code
 *  fences; returns null on anything unparseable. */
export function parseEnrichmentResponse(text: string | null | undefined): StrategyEnrichment | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      centralPromise: cleanStr(raw.centralPromise),
      uniqueMechanism: cleanStr(raw.uniqueMechanism),
      coreBeliefRequired: cleanStr(raw.coreBeliefRequired),
      awareness: isAwareness(raw.awareness) ? raw.awareness : null,
      sophistication: isSophistication(raw.sophistication) ? raw.sophistication : null,
    };
  } catch {
    return null;
  }
}

/** Apply an enrichment to a strategy. Pure + non-mutating. Fills ONLY currently-
 *  null fields, validates awareness/sophistication, grounds an inferred
 *  mechanism onto the offer + derived views, and recomputes `unknowns`. */
export function applyStrategyEnrichment(strategy: CampaignStrategy, e: StrategyEnrichment): CampaignStrategy {
  const business = { ...strategy.business };
  const audience = { ...strategy.audience };
  const offer = { ...strategy.offer };
  const context = { ...strategy.context };
  const derived = { ...strategy.derived };

  if (derived.centralPromise == null) derived.centralPromise = cleanStr(e.centralPromise);
  if (derived.coreBeliefRequired == null) derived.coreBeliefRequired = cleanStr(e.coreBeliefRequired);

  const mech = cleanStr(e.uniqueMechanism);
  if (!offer.mechanism && mech) {
    offer.mechanism = mech;
    derived.uniqueMechanism = mech;
  }

  if (audience.awareness == null && isAwareness(e.awareness)) {
    audience.awareness = e.awareness;
    derived.awareness = e.awareness;
  }
  if (audience.sophistication == null && isSophistication(e.sophistication)) {
    audience.sophistication = e.sophistication;
    derived.sophistication = e.sophistication;
  }

  return {
    ...strategy,
    business,
    audience,
    offer,
    context,
    derived,
    unknowns: computeUnknowns({ business, audience, offer, context }),
  };
}
