import type { PlanGateKey, PlanLimits, PlanProduct } from "@/types/billing";

/**
 * HOW A PLAN IS PRESENTED TO A CUSTOMER — deliberately separate from what it
 * ENTITLES them to.
 *
 * The pricing card used to render `PLAN_GATE_KEYS` order through
 * `PLAN_GATE_LABELS`, which meant a stranger deciding whether to spend $797
 * read our internal gate list, in schema order, in schema language — the
 * Ascend gate literally rendered as "Ascend Intelligence (Full Ascend shell)".
 * It also buried the reasons someone actually buys (Zeno, CRM, funnels,
 * follow-up) underneath supporting channels like WhatsApp and API access.
 *
 * Nothing here changes entitlement. A capability is listed ONLY when the plan
 * genuinely carries it: gated capabilities are shown when their gate is on,
 * and the entries marked `gate: null` are ungated surfaces every workspace
 * has (contacts, pipeline, forms, booking, workflows, reporting). Ordering is
 * a presentation concern; the gate remains the source of truth.
 */

interface FeatureEntry {
  label: string;
  /** null = an ungated surface every workspace gets. */
  gate: PlanGateKey | null;
}

/** Capture → follow up → convert → automate → measure. */
const FLOW_PRIMARY: FeatureEntry[] = [
  { label: "Zeno AI assistant", gate: "aiSuiteEnabledByAgency" },
  { label: "CRM & sales pipelines", gate: null },
  { label: "Funnels & landing pages", gate: "funnelsEnabledByAgency" },
  { label: "Automated lead follow-up", gate: null },
  { label: "Forms & lead capture", gate: null },
  { label: "Booking & scheduling", gate: null },
  { label: "Workflows & automations", gate: null },
  { label: "Email broadcasts", gate: "broadcastsEnabledByAgency" },
  { label: "Website builder", gate: "websiteEnabledByAgency" },
  { label: "Reporting & conversion measurement", gate: null },
];

/** Intelligence first, then the execution it feeds. */
const UNIFIED_PRIMARY: FeatureEntry[] = [
  { label: "Ascend Growth Intelligence", gate: "ascendIntelligenceEnabledByAgency" },
  { label: "Zeno — business-aware AI assistant", gate: "aiSuiteEnabledByAgency" },
  {
    label: "Growth Scans & prioritized recommendations",
    gate: "ascendIntelligenceEnabledByAgency",
  },
  { label: "AI-generated marketing & conversion assets", gate: "aiSuiteEnabledByAgency" },
  { label: "Funnels & landing pages", gate: "funnelsEnabledByAgency" },
  { label: "CRM & sales pipelines", gate: null },
  { label: "Automated lead follow-up", gate: null },
  { label: "Forms & lead capture", gate: null },
  { label: "Booking & scheduling", gate: null },
  { label: "Workflows & automations", gate: null },
  { label: "Email broadcasts", gate: "broadcastsEnabledByAgency" },
  { label: "Website builder", gate: "websiteEnabledByAgency" },
  { label: "Reporting & conversion measurement", gate: null },
];

/** Real capabilities, but not why most businesses buy. Shown as a tail. */
const SECONDARY: FeatureEntry[] = [
  { label: "Social planner", gate: "socialPlannerEnabledByAgency" },
  { label: "Facebook & Instagram inbox", gate: "metaInboxEnabledByAgency" },
  { label: "Custom domains", gate: "customDomainsEnabledByAgency" },
  { label: "Funnel checkout", gate: "funnelCheckoutEnabledByAgency" },
  { label: "Missed-call text back", gate: "missedCallTextBackEnabledByAgency" },
  { label: "WhatsApp channel", gate: "whatsappEnabledByAgency" },
  { label: "Outbound AI voice calls", gate: "outboundVoiceEnabledByAgency" },
  { label: "Community & courses", gate: "communityEnabledByAgency" },
  { label: "Dedicated sending domain", gate: "emailDomainEnabledByAgency" },
  { label: "API access", gate: "apiAccessEnabledByAgency" },
];

/** Enough to show what the plan is; the rest condenses into one line. */
const HIGHLIGHT_COUNT = 8;

export interface PlanAllowance {
  label: string;
  value: string;
}

export interface PlanPresentation {
  /** Ordered, customer-facing. What this plan is. */
  highlights: string[];
  /** Real but supporting capabilities, condensed. */
  alsoIncluded: string[];
  /** How much you can use — the reason to move up a tier. */
  allowances: PlanAllowance[];
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

/** "How much can I use?" — the upgrade reason, stated plainly. */
export function buildAllowances(limits: PlanLimits | undefined): PlanAllowance[] {
  const l = limits;
  if (!l) return [];
  const out: PlanAllowance[] = [];

  const workspaces = l.maxSubAccounts;
  if (workspaces !== null && workspaces !== undefined) {
    out.push({
      label: workspaces === 1 ? "Business workspace" : "Business workspaces",
      value: n(workspaces),
    });
  }
  if (l.maxWebsites !== null && l.maxWebsites !== undefined) {
    out.push({ label: "Websites & funnels", value: n(l.maxWebsites) });
  }
  if (l.maxAiGenerationsPerMonth !== null && l.maxAiGenerationsPerMonth !== undefined) {
    out.push({ label: "AI generations / month", value: n(l.maxAiGenerationsPerMonth) });
  }
  if (l.maxEmailsPerMonth !== null && l.maxEmailsPerMonth !== undefined) {
    out.push({ label: "Broadcast emails / month", value: n(l.maxEmailsPerMonth) });
  }
  // Only where the plan actually includes them — Flow tiers carry 0, and
  // "0 Growth Scans" on a card reads as a broken promise rather than a limit.
  if (
    l.maxGrowthScansPerMonth !== null &&
    l.maxGrowthScansPerMonth !== undefined &&
    l.maxGrowthScansPerMonth > 0
  ) {
    out.push({ label: "Growth Scans / month", value: n(l.maxGrowthScansPerMonth) });
  }
  return out;
}

export function buildPlanPresentation(
  product: PlanProduct,
  gates: Record<string, boolean>,
  limits: PlanLimits | undefined,
): PlanPresentation {
  const included = (e: FeatureEntry) => e.gate === null || gates[e.gate] === true;
  const primary = (product === "unified" ? UNIFIED_PRIMARY : FLOW_PRIMARY).filter(included);
  const secondary = SECONDARY.filter(included);

  const highlights = primary.slice(0, HIGHLIGHT_COUNT).map((e) => e.label);
  const alsoIncluded = [
    ...primary.slice(HIGHLIGHT_COUNT).map((e) => e.label),
    ...secondary.map((e) => e.label),
  ];

  return { highlights, alsoIncluded, allowances: buildAllowances(limits) };
}
