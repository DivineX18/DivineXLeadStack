import "server-only";

/**
 * CAMPAIGN INTENT + CAMPAIGN PLAN (Campaign Architect addendum).
 *
 * THE THREE LEVELS, kept structurally separate:
 *   1. BUSINESS INTELLIGENCE — canonical, in Ascend (never duplicated here)
 *   2. OFFER INTELLIGENCE   — semi-persistent, referenced by STABLE id
 *                             (`offers[].id` on the profile contract)
 *   3. CAMPAIGN INTENT      — campaign-scoped, lives here, NEVER written
 *                             back into the Business/Brand Profile
 *
 * The Campaign Plan is the MACHINE-READABLE execution contract — never a
 * giant prompt. It references canonical ids (offerId, assetIds,
 * brandProfileVersion) rather than copying business truth, and compiles
 * into the EXISTING certified Flow systems (funnel generation, forms, CRM,
 * and the compose-strategy workflow compiler).
 */

export type CampaignObjective =
  | "leads"
  | "appointments"
  | "sales"
  | "applications"
  | "donations"
  | "registrations";

export interface CampaignIntent {
  /** Canonical linkage — the plan never restates business truth. */
  businessProfileId: number;
  subAccountId: string;
  /** Stable reference into the profile contract's offers[]. */
  offerId?: string | null;
  /** Free-text offer description when the offer isn't canonical yet (a new
   *  offer learned conversationally becomes a DRAFT offer the customer can
   *  save — never silently promoted to Offer Truth). */
  offerDescription?: string | null;
  objective: CampaignObjective;
  audience?: string | null;
  trafficSource?: string | null;
  geography?: string | null;
  timing?: string | null;
  constraints?: string[];
  /** Verbatim customer instructions ("don't ask for phone", "less
   *  aggressive"). Retained as CONTEXT alongside structured fields. */
  customerInstructions?: string[];
  /** What Ascend recommended, when this came from a reveal. */
  ascendRecommendation?: {
    scanId?: number;
    primaryConstraint?: string;
    recommendedFunnelType?: string;
    recommendedLeadMagnet?: string;
  } | null;
}

/** One communication in the plan — becomes a REAL workflow email node. */
export interface PlannedMessage {
  channel: "email" | "sms";
  /** Hours after enrollment, or an event-anchored offset. */
  delayHours: number;
  anchorOffsetHours?: number | null;
  purpose: string;
  commType:
    | "transactional"
    | "operational"
    | "reminder"
    | "nurture"
    | "recovery"
    | "sales_followup"
    | "stewardship"
    | "reactivation";
  subject: string;
  body: string;
  /** "supplied" = the customer wrote it (installed verbatim, never
   *  rewritten); "generated" = Zeno wrote it. */
  origin: "supplied" | "generated";
}

export interface SegmentationRule {
  /** Form field the routing depends on (created if missing). */
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "in";
  value: string;
  /** Tag applied to matching leads — the CRM-visible segment. */
  tag: string;
  label: string;
}

export interface CampaignPlan {
  planVersion: 1;
  status: "draft" | "approved";
  intent: CampaignIntent;
  /** Funnel generation inputs — consumed by the FROZEN create_funnel path;
   *  this plan supplies inputs, it never re-implements generation. */
  funnelStrategy: {
    genre?: string;
    headlineHint?: string | null;
    /** Chain steps when the journey is multistep. */
    multistep?: boolean;
  };
  formRequirements: {
    fields: { name: string; label: string; type: "text" | "email" | "phone" | "select" | "number"; required: boolean; options?: string[] }[];
  };
  segmentationRules: SegmentationRule[];
  followUpStrategy: {
    /** Lifecycle goal that ENDS the sequence (canonical states preferred:
     *  booked/purchased/replied/accepted/won). */
    goalTag: string;
    goalState: string;
    handoffDays: number;
    messages: PlannedMessage[];
  };
  crmRequirements: { pipelineStages?: string[]; tags?: string[] };
  /** Canonical asset ids (approved only) — stable references, not copies. */
  assetSelections: number[];
  /** The brand snapshot version this plan was composed against. */
  brandProfileVersion: number | null;
  /** Human-readable summary rendered for review (derived, not authoritative). */
  summary?: string;
}

/** Compact human-readable rendering of the plan for the review screen. */
export function renderPlanSummary(plan: CampaignPlan): string {
  const lines: string[] = [];
  lines.push(`Objective: ${plan.intent.objective}`);
  if (plan.intent.offerId || plan.intent.offerDescription) {
    lines.push(`Offer: ${plan.intent.offerId ?? plan.intent.offerDescription}`);
  }
  if (plan.intent.audience) lines.push(`Audience: ${plan.intent.audience}`);
  if (plan.formRequirements.fields.length > 0) {
    lines.push(`Form: ${plan.formRequirements.fields.map((f) => f.label).join(", ")}`);
  }
  if (plan.segmentationRules.length > 0) {
    lines.push(`Segments: ${plan.segmentationRules.map((r) => r.label).join(" / ")}`);
  }
  const msgs = plan.followUpStrategy.messages;
  if (msgs.length > 0) {
    lines.push(
      `Follow-up: ${msgs.length} message${msgs.length === 1 ? "" : "s"} — ${msgs
        .map((m) => `${m.delayHours === 0 ? "immediate" : `+${Math.round(m.delayHours / 24)}d`} ${m.commType}`)
        .join(", ")}`,
    );
  }
  lines.push(`Exit: ${plan.followUpStrategy.goalState} (tag "${plan.followUpStrategy.goalTag}")`);
  if (plan.assetSelections.length > 0) lines.push(`Assets: ${plan.assetSelections.length} approved`);
  return lines.join("\n");
}

/** Deterministic validation before anything is written to Flow. */
export function validateCampaignPlan(plan: CampaignPlan): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!plan.intent?.businessProfileId) errors.push("intent.businessProfileId is required");
  if (!plan.intent?.subAccountId) errors.push("intent.subAccountId is required");
  if (!plan.intent?.objective) errors.push("intent.objective is required");
  if (!plan.followUpStrategy?.goalTag) errors.push("followUpStrategy.goalTag is required");

  const msgs = plan.followUpStrategy?.messages ?? [];
  msgs.forEach((m, i) => {
    if (!m.subject?.trim()) errors.push(`message[${i}] missing subject`);
    if (!m.body?.trim()) errors.push(`message[${i}] missing body`);
    if (!Number.isFinite(m.delayHours) || m.delayHours < 0) errors.push(`message[${i}] invalid delayHours`);
  });

  for (const rule of plan.segmentationRules ?? []) {
    const hasField = (plan.formRequirements?.fields ?? []).some((f) => f.name === rule.field);
    if (!hasField) errors.push(`segmentation needs form field "${rule.field}" — add it to formRequirements`);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
