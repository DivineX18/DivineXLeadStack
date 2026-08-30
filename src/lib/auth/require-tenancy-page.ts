import "server-only";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveAuthedCaller, resolveSubAccountAccess } from "@/lib/auth/require-tenancy";
import type { SubAccountAccess } from "@/lib/auth/require-tenancy";

/**
 * Page-level (RSC) equivalent of requireSubAccountMember, for server
 * components that have a session but no Request object. Reuses the exact
 * same membership resolution — never a parallel authorization path.
 *
 * Returns null on any failure so callers can notFound(): a preview link
 * for another tenant's funnel must be indistinguishable from one that
 * doesn't exist.
 */
export async function requireSubAccountMemberForPage(
  subAccountId: string,
): Promise<SubAccountAccess | null> {
  if (!subAccountId) return null;
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  if (!uid) return null;

  const caller = await resolveAuthedCaller(uid);
  if (!caller.ok) return null;

  const result = await resolveSubAccountAccess(caller.caller, subAccountId);
  return result.ok ? result.access : null;
}
