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
  { label: "Unlimited contacts", gate: null },
  { label: "Unlimited visitors", gate: null },
  { label: "Zeno Growth Strategist", gate: "aiSuiteEnabledByAgency" },
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
  { label: "Unlimited contacts", gate: null },
  { label: "Unlimited visitors", gate: null },
  // Ordered by what a buyer is paying to GET, not by what makes Ascend
  // architecturally interesting. The things that earn revenue lead; the
  // diagnosis that decides what to build sits mid-list as the differentiator;
  // the scan itself sits near the bottom, because it is how the work gets
  // aimed rather than the work. "Zeno" appears exactly once — repeating a
  // product name in a feature list reads as two entries for one thing.
  { label: "Funnels & landing pages", gate: "funnelsEnabledByAgency" },
  { label: "Automated lead follow-up", gate: null },
  { label: "CRM & sales pipelines", gate: null },
  { label: "Forms & lead capture", gate: null },
  { label: "Booking & scheduling", gate: null },
  { label: "Growth Intelligence", gate: "ascendIntelligenceEnabledByAgency" },
  { label: "Marketing Content & Assets", gate: "aiSuiteEnabledByAgency" },
  { label: "Zeno Growth Strategist", gate: "aiSuiteEnabledByAgency" },
  { label: "Workflows & automations", gate: null },
  { label: "Email broadcasts", gate: "broadcastsEnabledByAgency" },
  {
    label: "Growth Scans & prioritized recommendations",
    gate: "ascendIntelligenceEnabledByAgency",
  },
  { label: "Website builder", gate: "websiteEnabledByAgency" },
  { label: "Reporting & conversion measurement", gate: null },
];

/** Real capabilities, but not why most businesses buy. Shown as a tail. */
const SECONDARY: FeatureEntry[] = [
  { label: "Social planner", gate: "socialPlannerEnabledByAgency" },
  { label: "Facebook & Instagram inbox", gate: "metaInboxEnabledByAgency" },
  { label: "Unlimited custom domains", gate: "customDomainsEnabledByAgency" },
  { label: "Funnel checkout", gate: "funnelCheckoutEnabledByAgency" },
  { label: "Missed-call text back", gate: "missedCallTextBackEnabledByAgency" },
  { label: "WhatsApp channel", gate: "whatsappEnabledByAgency" },
  { label: "Automated outbound calling", gate: "outboundVoiceEnabledByAgency" },
  { label: "Unlimited courses & community", gate: "communityEnabledByAgency" },
  { label: "Dedicated sending domain", gate: "emailDomainEnabledByAgency" },
  { label: "API access", gate: "apiAccessEnabledByAgency" },
];

/*
 * ABUNDANCE WHERE IT IS FREE, METERING WHERE IT IS NOT.
 *
 * Only five things carry a ceiling anywhere in this product: workspaces,
 * websites, broadcast email, asset generations and Growth Scans. Those are
 * the four that cost real money plus the one that is the pricing lever.
 * Contacts, visitors, team members, custom domains, courses, pipelines,
 * forms and workflows have no limit in any code path, so saying "unlimited"
 * about them is a statement of fact rather than a promise we are hoping to
 * keep. Competitors meter most of them, which makes stating it plainly worth
 * more than leaving it unsaid.
 *
 * Anything added here must be genuinely uncapped. If a ceiling is ever
 * introduced for one of these, the line moves into quantifiedLines and
 * carries its number like the rest.
 */
/** Enough to show what the plan is; the rest condenses into one line. */
const HIGHLIGHT_COUNT = 8;

export interface PlanAllowance {
  label: string;
  value: string;
  /** Optional one-line descriptor under the value, for units that mean
   *  nothing on their own. "Creations" is the case this exists for. */
  note?: string;
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
    out.push({
      label: "Marketing Content & Assets",
      value: `${n(l.maxAiGenerationsPerMonth)} creations/mo`,
      // Deliberately excludes emails, blogs, ads and social content: those are
      // real capabilities, but they do not decrement THIS counter, and a
      // metered allowance has to list only what it actually meters.
      note: "Lead magnets, page copy, VSLs, scripts, proposals, content plans & more.",
    });
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

/**
 * THE NUMBERS BELONG IN THE LIST, NOT IN A TABLE ABOVE IT.
 *
 * "Funnels & landing pages" tells a buyer we have the feature, not whether
 * they get five or a hundred — and the answer sat in a separate grid they had
 * to cross-reference to find out. These lines fold the two together, so one
 * read down a single column answers both "what do I get" and "how much of
 * it".
 *
 * Each quantified line REPLACES the qualitative one it measures, reported via
 * `covered`, so nothing is stated twice. A capability whose meter is absent
 * keeps its plain label: a limit we cannot source is left unstated rather
 * than guessed, and a gate that is off contributes nothing either way, so no
 * line can ever promise an allowance for something the plan does not include.
 */
function quantifiedLines(
  limits: PlanLimits | undefined,
  gates: Record<string, boolean>,
): { lines: string[]; covered: Set<string> } {
  const lines: string[] = [];
  const covered = new Set<string>();
  const l = limits;
  if (!l) return { lines, covered };

  const on = (gate: string) => gates[gate] === true;
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

  if (has(l.maxSubAccounts)) {
    lines.push(`${n(l.maxSubAccounts)} business workspace${l.maxSubAccounts === 1 ? "" : "s"}`);
  }
  // FUNNELS AND WEBSITES ARE NOT THE SAME COUNT, AND ONLY ONE OF THEM HAS ONE.
  //
  // The old combined "Websites & funnels" line implied `maxWebsites` capped
  // both. It never did: that ceiling is enforced only in websites-service,
  // and the funnel create route carries no quota check at all. So the line
  // was simultaneously understating funnels, which are genuinely uncapped,
  // and overstating the cap's reach. Split, each half is true.
  //
  // Websites keep the cap deliberately — a website build spends the shared
  // gitpage quota, which is the one count here that actually costs money.
  if (on("funnelsEnabledByAgency")) {
    lines.push("Unlimited funnels & landing pages");
    covered.add("Funnels & landing pages");
  }
  if (has(l.maxWebsites) && on("websiteEnabledByAgency")) {
    lines.push(`${n(l.maxWebsites)} websites`);
    covered.add("Website builder");
  }
  if (has(l.maxAiGenerationsPerMonth) && on("aiSuiteEnabledByAgency")) {
    lines.push(`${n(l.maxAiGenerationsPerMonth)} marketing assets a month in Asset Studio`);
    covered.add("Marketing Content & Assets");
  }
  if (has(l.maxGrowthScansPerMonth) && l.maxGrowthScansPerMonth > 0) {
    lines.push(`${n(l.maxGrowthScansPerMonth)} Growth Scans a month`);
    // The metered line says everything the qualitative one did, and says how
    // many. Keeping both put "30 Growth Scans a month" and "Growth Scans &
    // prioritized recommendations" in the same column.
    covered.add("Growth Scans & prioritized recommendations");
  }
  if (has(l.maxEmailsPerMonth) && on("broadcastsEnabledByAgency")) {
    lines.push(`${n(l.maxEmailsPerMonth)} broadcast emails a month`);
    covered.add("Email broadcasts");
  }
  return { lines, covered };
}

export function buildPlanPresentation(
  product: PlanProduct,
  gates: Record<string, boolean>,
  limits: PlanLimits | undefined,
): PlanPresentation {
  const included = (e: FeatureEntry) => e.gate === null || gates[e.gate] === true;
  const { lines, covered } = quantifiedLines(limits, gates);
  const uncovered = (e: FeatureEntry) => !covered.has(e.label);
  const primary = (product === "unified" ? UNIFIED_PRIMARY : FLOW_PRIMARY)
    .filter(included)
    .filter(uncovered);
  const secondary = SECONDARY.filter(included).filter(uncovered);

  const highlights = [...lines, ...primary.slice(0, HIGHLIGHT_COUNT).map((e) => e.label)];
  const alsoIncluded = [
    ...primary.slice(HIGHLIGHT_COUNT).map((e) => e.label),
    ...secondary.map((e) => e.label),
  ];

  return { highlights, alsoIncluded, allowances: buildAllowances(limits) };
}
