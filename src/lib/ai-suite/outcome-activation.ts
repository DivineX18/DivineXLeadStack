import "server-only";
/** Release activation only. Missing/invalid configuration is OFF in every environment.
 * Read at admission time; already admitted transactions/actions finish durably.
 * Never expose this setting through a public/client environment variable. */
export function agentOutcomeEnabled(): boolean {
  return process.env.DIVINEX_AGENT_OUTCOME_ENABLED === "true";
}
export function requireAgentOutcomeEnabled(): void {
  if (!agentOutcomeEnabled()) throw new Error("agent_outcome_inactive");
}
