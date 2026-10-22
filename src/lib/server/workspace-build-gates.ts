/**
 * What a brand-new workspace can BUILD with, on day one.
 *
 * THE RULE: the build tools are the product; the spend-capable channels are
 * the agency's money. Those are different risks and they get different
 * defaults.
 *
 * Every gate used to ship off, which is right for a channel that spends the
 * agency's Twilio balance, Resend reputation or Vapi minutes on a workspace
 * the agency created for a client. It was wrong for funnels, websites and
 * Zeno. Those have no marginal cost per workspace, and with all three off a
 * new account is an empty shell: a customer signs in, sees a CRM with no way
 * to build anything, and reasonably concludes the product is broken. That is
 * not hypothetical — it is the report that prompted this, from a funnel
 * builder who could not find a funnel builder.
 *
 * The cost objection to Zeno is real but points the other way. Yes, every
 * reply spends OpenRouter credits. But a workspace nobody can build in
 * produces no replies, no funnels and no reason to stay, and the agency owner
 * can still turn any of these off per workspace from the Manage dialog. An
 * opt-OUT costs one click; an opt-in that nobody knows exists costs the
 * customer.
 *
 * Deliberately NOT included, and they stay off at every creation site:
 * broadcasts, outbound voice, WhatsApp, Meta inbox, social planner, the
 * public API, Get Leads, email domains, missed-call text-back, funnel
 * checkout. Each spends real money, carries compliance weight, or both. A new
 * account switching those on by itself would be indefensible.
 *
 * `ascendIntelligenceEnabledByAgency` is also excluded on purpose: it is a
 * billing-tier entitlement, not a build tool, and it is set by whoever grants
 * the tier.
 *
 * One constant, spread into all three creation sites, because this drifted
 * once already: the Ascend-purchase path turned funnels on while leaving the
 * assistant that builds them off, which is the single most confusing
 * combination the gates can produce.
 */
export const WORKSPACE_BUILD_GATES = {
  funnelsEnabledByAgency: true,
  websiteEnabledByAgency: true,
  aiSuiteEnabledByAgency: true,
} as const;

export type WorkspaceBuildGates = typeof WORKSPACE_BUILD_GATES;
