import "server-only";

/**
 * Explicit environment identification (2026-11-09 staging-isolation sprint).
 *
 * Every other isolation check in this codebase up to this point inferred
 * "is this staging?" from a side effect — a hostname, a missing env var, a
 * QStash flag — which is fragile and duplicated per-check logic. This is the
 * one place that answers the question directly, from one explicit signal a
 * Render service sets on itself.
 *
 * `DEPLOYMENT_ENV` is opt-in and defaults to `"production"` when unset. That
 * default is deliberate: every existing deployment (production, every
 * buyer's self-hosted instance, local dev) has never set this var and must
 * see ZERO behavior change. Only a deployment that explicitly sets
 * `DEPLOYMENT_ENV=staging` (the Render staging service, going forward)
 * opts into the stricter checks this module and its callers enforce.
 */

export type DeploymentEnvironment = "production" | "staging";

/** The one Firebase project this codebase's production deployment uses.
 *  Shared with scripts/verify-environment-isolation.mts — keep in sync. */
export const PRODUCTION_FIREBASE_PROJECT_ID = "ascend-crm-jvm";

export function getDeploymentEnvironment(): DeploymentEnvironment {
  const explicit = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
  return explicit === "staging" ? "staging" : "production";
}

export function isStagingDeployment(): boolean {
  return getDeploymentEnvironment() === "staging";
}

/**
 * Throws when this process is explicitly marked staging (`DEPLOYMENT_ENV=
 * staging`) but is configured to write to the production Firebase project.
 * Call this at the Admin SDK's init boundary — the earliest point a
 * misconfigured staging service would otherwise start reading/writing
 * production data.
 */
export function assertFirebaseProjectNotProductionInStaging(
  projectId: string | undefined,
): void {
  if (!isStagingDeployment()) return;
  if (projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new Error(
      `DEPLOYMENT_ENV=staging but FIREBASE_ADMIN_PROJECT_ID is "${projectId}" — ` +
        "the production project. Refusing to initialize the Admin SDK so a " +
        "misconfigured staging service cannot read or write production data. " +
        "Set FIREBASE_ADMIN_PROJECT_ID / NEXT_PUBLIC_FIREBASE_PROJECT_ID to the " +
        "divinex-staging project's own credentials.",
    );
  }
}
