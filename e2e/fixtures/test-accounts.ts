/**
 * Ascend OS Phase 2, Slice 8.5 — env-var-driven test account/workspace
 * fixtures. NEVER hardcode a credential here. Every value is read from
 * process.env at test-run time; a spec that needs an unconfigured account
 * calls `test.skip()` with a clear message rather than failing opaquely
 * or (worse) silently passing.
 *
 * See e2e/README.md for the full list of env vars and exactly how to
 * provision each test account/workspace by hand.
 */

export interface TestAccount {
  email: string;
  password: string;
  /** The workspace this account is expected to land in / operate on for
   *  the test, when relevant. Not every role needs one. */
  workspaceId?: string;
}

function readAccount(prefix: string): TestAccount | null {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) return null;
  const workspaceId = process.env[`${prefix}_WORKSPACE_ID`];
  return { email, password, ...(workspaceId ? { workspaceId } : {}) };
}

/**
 * Named roles from this slice's spec §3 ("Create reusable fixtures ...
 * for: Authenticated Full Ascend user, CRM-only user, Agency owner,
 * Admin, Collaborator, One-Workspace user, Multiple-Workspace user").
 * Each maps to a `TEST_<NAME>_EMAIL` / `_PASSWORD` / (optional)
 * `_WORKSPACE_ID` env var triple.
 */
export const TEST_ACCOUNTS = {
  fullAscend: () => readAccount("TEST_FULL_ASCEND"),
  crmOnly: () => readAccount("TEST_CRM_ONLY"),
  agencyOwner: () => readAccount("TEST_AGENCY_OWNER"),
  admin: () => readAccount("TEST_ADMIN"),
  collaborator: () => readAccount("TEST_COLLABORATOR"),
  oneWorkspace: () => readAccount("TEST_ONE_WORKSPACE"),
  multiWorkspace: () => readAccount("TEST_MULTI_WORKSPACE"),
  noWorkspace: () => readAccount("TEST_NO_WORKSPACE"),
} as const;

export type TestAccountRole = keyof typeof TEST_ACCOUNTS;

/**
 * Standalone workspace ids for cases that don't need full login credentials
 * of their own — they're exercised through one of the accounts above.
 * Missing = the dependent spec skips.
 */
export const TEST_WORKSPACES = {
  archived: process.env.TEST_ARCHIVED_WORKSPACE_ID ?? null,
  inactive: process.env.TEST_INACTIVE_WORKSPACE_ID ?? null,
  rolloutEnabled: process.env.TEST_ROLLOUT_ENABLED_WORKSPACE_ID ?? null,
  rolloutDisabled: process.env.TEST_ROLLOUT_DISABLED_WORKSPACE_ID ?? null,
  /** A REAL workspace id the logged-in test account does NOT belong to —
   *  used only to prove Flow's existing per-route authorization (Slice 5,
   *  unmodified) still rejects it. Never a workspace with real customer
   *  data if avoidable. */
  unauthorized: process.env.TEST_UNAUTHORIZED_WORKSPACE_ID ?? null,
} as const;

export function accountOrSkip(role: TestAccountRole): TestAccount {
  const account = TEST_ACCOUNTS[role]();
  if (!account) {
    throw new Error(
      `TEST_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}_EMAIL/_PASSWORD not set — see e2e/README.md. This should be guarded by test.skip(), not reached.`,
    );
  }
  return account;
}
