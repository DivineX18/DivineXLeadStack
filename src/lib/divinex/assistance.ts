/**
 * ASSISTANCE RECOMMENDATIONS (approved addendum).
 *
 * Deliberately NOT called upsells: the system recommends the appropriate
 * level of assistance, and "none" is a valid — often correct —
 * recommendation. Software is the default path; human expertise is
 * recommended when it removes real friction or supplies judgment; never because
 * it generates revenue.
 *
 * ONE authoritative price/definition source. No prices in components.
 */

export type ServiceKey =
  | "flow_guided_launch"
  | "growth_system_launch"
  | "strategy_sprint"
  | "strategic_partnership"
  | "wordpress_website"
  | "traffic_specialist";

export interface ServiceDefinition {
  key: ServiceKey;
  name: string;
  /** Display price — the single place any price string exists. */
  price: string;
  /** What the money actually buys, stated plainly. */
  includes: string[];
  /** The human-window clarity law: software access ≠ human support window. */
  humanWindow?: string;
  qualificationOnly?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

export const SERVICE_CATALOG: Record<ServiceKey, ServiceDefinition> = {
  flow_guided_launch: {
    key: "flow_guided_launch",
    name: "Flow Guided Launch",
    price: "$1,997 one time",
    includes: [
      "12 months of Flow included",
      "Guided setup and business profile review",
      "Your first campaign built and reviewed with you",
      "Funnel, form, CRM, automation and communications QA",
      "Launch-readiness review",
    ],
    humanWindow: "Human help covers an approximately 30-day launch window. Your Flow access continues for the full 12 months.",
    ctaLabel: "Get launch help",
    ctaHref: "/app/assistance/flow_guided_launch",
  },
  growth_system_launch: {
    key: "growth_system_launch",
    name: "DivineX Growth System Launch",
    price: "$2,997 one time",
    includes: [
      "12 months of DivineX Complete included",
      "Strategist-led launch engagement",
      "Growth diagnosis and constraint review",
      "Offer clarity, positioning and campaign strategy",
      "Review of everything Zeno and Flow build",
      "Launch QA and final strategic adjustments",
    ],
    humanWindow: "The strategist-led launch runs approximately 30 days. Your DivineX Complete access continues for the full 12 months.",
    ctaLabel: "Launch with a strategist",
    ctaHref: "/app/assistance/growth_system_launch",
  },
  strategy_sprint: {
    key: "strategy_sprint",
    name: "Strategy Sprint",
    price: "From $500, scoped to the problem",
    includes: [
      "A focused engagement on one real bottleneck",
      "Offer, positioning, conversion or journey work",
      "Clear recommendation you can act on",
    ],
    ctaLabel: "Book a strategy session",
    ctaHref: "/app/assistance/strategy_sprint",
  },
  strategic_partnership: {
    key: "strategic_partnership",
    name: "Strategic Growth Partnership",
    price: "From $2,997/month",
    includes: [
      "Ongoing strategist oversight across campaigns",
      "Portfolio strategy and testing priorities",
      "Continuous conversion and offer optimization",
      "Flow execution oversight",
    ],
    qualificationOnly: true,
    ctaLabel: "See if this fits",
    ctaHref: "/app/assistance/strategic_partnership",
  },
  wordpress_website: {
    key: "wordpress_website",
    name: "Custom Website",
    price: "From $4,500, depending on scope",
    includes: [
      "A full corporate website built on WordPress",
      "Built from your existing brand profile and assets",
      "Designed to work with your Flow campaigns",
    ],
    ctaLabel: "Discuss my website",
    ctaHref: "/app/assistance/wordpress_website",
  },
  traffic_specialist: {
    key: "traffic_specialist",
    name: "Traffic Specialist",
    price: "Varies by channel and spend",
    includes: [
      "Vetted specialist for Google Ads, SEO or paid social",
      "Matched to your current constraint",
    ],
    ctaLabel: "Explore traffic options",
    ctaHref: "/app/assistance/traffic_specialist",
  },
};

export type AssistanceTrigger =
  | "post_reveal"
  | "campaign_built_not_launched"
  | "strategic_bottleneck"
  | "insufficient_traffic"
  | "website_constraint"
  | "high_scale_operation";

export interface AssistanceRecommendation {
  trigger: AssistanceTrigger;
  service: ServiceKey | null; // null = the correct recommendation is NO paid assistance
  headline: string;
  explanation: string;
  priority: number;
  dismissible: boolean;
  /** Days before this recommendation may reappear after dismissal. */
  cooldownDays: number;
}

export interface AssistanceSignals {
  /** Real Ascend intelligence — never manufactured to create an upsell. */
  primaryConstraint?: string | null;
  growthScore?: number | null;
  /** Flow operational reality. */
  campaignsBuilt?: number;
  campaignsLive?: number;
  monthlyLeads?: number | null;
  /** Economic-responsibility inputs. */
  monthlyRevenueBand?: string | null;
  monthlyAdSpend?: number | null;
}

/**
 * THE ECONOMIC RESPONSIBILITY LAW, in code: an expensive engagement is only
 * appropriate when the customer's scale can justify it. Below that bar the
 * honest recommendation is software plus traffic — or nothing at all.
 */
function canAffordRetainer(signals: AssistanceSignals): boolean {
  const band = signals.monthlyRevenueBand ?? "";
  if (band === "250k_plus") return true;
  if (band === "50k_250k" && (signals.monthlyAdSpend ?? 0) >= 10_000) return true;
  return false;
}

/**
 * Recommend the appropriate level of assistance for the moment — or none.
 * Returns [] when nothing is genuinely useful, which is a valid outcome and
 * the expected one most of the time.
 */
export function recommendAssistance(
  trigger: AssistanceTrigger,
  signals: AssistanceSignals,
): AssistanceRecommendation[] {
  const out: AssistanceRecommendation[] = [];

  if (trigger === "insufficient_traffic") {
    // Explicitly recommends AGAINST paid optimization work.
    out.push({
      trigger,
      service: "traffic_specialist",
      headline: "Your conversion system is ready for more traffic",
      explanation:
        "Based on your current volume, more funnel optimization is unlikely to be the highest-leverage move yet. The next real gain comes from qualified traffic.",
      priority: 10,
      dismissible: true,
      cooldownDays: 21,
    });
    return out;
  }

  if (trigger === "post_reveal") {
    out.push({
      trigger,
      service: "flow_guided_launch",
      headline: "Want help getting this live?",
      explanation:
        "Build it yourself with Zeno, or have a DivineX specialist set up and review your first campaign end to end.",
      priority: 5,
      dismissible: true,
      cooldownDays: 30,
    });
    return out;
  }

  if (trigger === "campaign_built_not_launched") {
    out.push({
      trigger,
      service: "flow_guided_launch",
      headline: "Want a second set of eyes before you launch?",
      explanation: "A specialist can review your funnel, workflow, tracking and launch configuration.",
      priority: 6,
      dismissible: true,
      cooldownDays: 14,
    });
    return out;
  }

  if (trigger === "strategic_bottleneck" && signals.primaryConstraint) {
    out.push({
      trigger,
      service: "strategy_sprint",
      headline: "Want another set of eyes on this?",
      explanation: `Ascend identified ${signals.primaryConstraint} as your primary constraint. A strategist can work through it with you.`,
      priority: 7,
      dismissible: true,
      cooldownDays: 30,
    });
    return out;
  }

  if (trigger === "website_constraint") {
    out.push({
      trigger,
      service: "wordpress_website",
      headline: "Your website may be limiting the rest of your growth system",
      explanation: "Your campaigns are working around it. A custom site built from your brand profile removes that ceiling.",
      priority: 4,
      dismissible: true,
      cooldownDays: 60,
    });
    return out;
  }

  if (trigger === "high_scale_operation") {
    if (!canAffordRetainer(signals)) {
      // The correct recommendation is NO paid assistance.
      return [];
    }
    out.push({
      trigger,
      service: "strategic_partnership",
      headline: "Your business may now benefit from dedicated strategic oversight",
      explanation:
        "You are running enough campaigns and acquisition volume that continuous optimization can pay for itself.",
      priority: 3,
      dismissible: true,
      cooldownDays: 45,
    });
  }
  return out;
}
