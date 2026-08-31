import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  isPlatformRole,
  platformRoleHasCapability,
  type PlatformCapability,
  type PlatformRole,
} from "@/types/platform-roles";

/**
 * SERVER-SIDE PLATFORM ROLE RESOLUTION — P0.1.
 *
 * The single place a platform role is decided. Two properties matter more
 * than anything else here:
 *
 * 1. It reads `users/{uid}.platformRole` through the Admin SDK. It NEVER
 *    reads a custom claim or anything the client can influence, so a browser
 *    asserting `platformRole: "super_admin"` achieves nothing.
 * 2. It fails CLOSED. Any error — missing doc, unreadable field, unknown
 *    value — resolves to null, i.e. no platform role. An authorization check
 *    that cannot complete must never be treated as a pass.
 *
 * `import "server-only"` makes importing this into a client bundle a build
 * error rather than a silent leak.
 */

export async function resolvePlatformRole(uid: string | null | undefined): Promise<PlatformRole | null> {
  const id = uid?.trim();
  if (!id) return null;
  try {
    const snap = await getAdminDb().doc(`users/${id}`).get();
    if (!snap.exists) return null;
    const raw = (snap.data() as { platformRole?: unknown } | undefined)?.platformRole;
    return isPlatformRole(raw) ? raw : null;
  } catch {
    // Fail closed — see the header. A read failure is not permission.
    return null;
  }
}

export async function callerHasPlatformCapability(
  uid: string | null | undefined,
  capability: PlatformCapability,
): Promise<boolean> {
  return platformRoleHasCapability(await resolvePlatformRole(uid), capability);
}

export async function isSuperAdmin(uid: string | null | undefined): Promise<boolean> {
  return (await resolvePlatformRole(uid)) === "super_admin";
}

/**
 * Guard for platform-only server code. Throws rather than returning a
 * boolean, so a caller cannot accidentally ignore the result — the shape of
 * the API makes the safe usage the easy one.
 */
export async function requirePlatformCapability(
  uid: string | null | undefined,
  capability: PlatformCapability,
): Promise<PlatformRole> {
  const role = await resolvePlatformRole(uid);
  if (!platformRoleHasCapability(role, capability)) {
    throw new Error(`platform_capability_denied:${capability}`);
  }
  return role as PlatformRole;
}
