/**
 * PLATFORM ROLES — P0.1.
 *
 * A THIRD, separate axis from the two that already exist. Keeping them
 * distinct matters: conflating "what can this person do" with "what has this
 * account paid for" is how authorization bugs get shipped.
 *
 *   PLATFORM role  — operating DivineX itself (Super Admin, Support, …)
 *   AGENCY/BUSINESS role — what someone may do inside a workspace
 *   PLAN/entitlement — what an account has paid for
 *
 * NOTHING here is ever read from a client-supplied claim. A platform role
 * lives on `users/{uid}.platformRole`, is written only by an admin-SDK path,
 * and is resolved server-side on every check. A browser asserting
 * `platformRole: "super_admin"` must achieve exactly nothing — that is the
 * P0.1 acceptance standard, and it is tested directly.
 */

export const PLATFORM_ROLES = [
  "super_admin",
  "platform_admin",
  "engineering",
  "qa",
  "support",
  "trainer",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/**
 * Platform capabilities. Deliberately coarse for P0.1 — the surfaces these
 * gate (the Super Admin console) do not exist yet, and inventing fine-grained
 * permissions for unbuilt screens produces a matrix nobody can verify.
 */
export const PLATFORM_CAPABILITIES = [
  "platform.admin",
  "platform.users.manage",
  "platform.accounts.manage",
  "platform.plans.manage",
  "platform.flags.manage",
  "platform.audit.read",
  "platform.impersonate",
  "platform.support.read",
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

const PLATFORM_ROLE_CAPABILITIES: Record<PlatformRole, readonly PlatformCapability[]> = {
  super_admin: PLATFORM_CAPABILITIES,
  platform_admin: [
    "platform.admin",
    "platform.users.manage",
    "platform.accounts.manage",
    "platform.plans.manage",
    "platform.flags.manage",
    "platform.audit.read",
    "platform.support.read",
  ],
  engineering: ["platform.admin", "platform.flags.manage", "platform.audit.read", "platform.support.read"],
  qa: ["platform.admin", "platform.flags.manage", "platform.support.read"],
  // Support can read to help a customer, but cannot alter accounts or
  // impersonate without a higher role.
  support: ["platform.support.read"],
  trainer: ["platform.support.read"],
};

export function platformRoleHasCapability(role: PlatformRole | null, capability: PlatformCapability): boolean {
  if (!role) return false;
  return PLATFORM_ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * The bootstrap Super Admin. Seeded server-side by
 * scripts/seed-platform-roles.mts; the constant exists so the seed and any
 * audit check read the same value rather than two copies drifting.
 */
export const BOOTSTRAP_SUPER_ADMIN_EMAIL = "hello@divinex.io";
