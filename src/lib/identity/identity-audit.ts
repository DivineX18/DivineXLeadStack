import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Ascend OS Phase 2, Slice 7 — same audit philosophy as Slices 5 and 6:
 * meaningful events only, never routine successful resolution logging.
 * `resolveIdentity()` runs on effectively every authenticated request
 * once wired into routes (Slice 8+) — logging every successful
 * resolution would be the exact "noisy session logging" this slice's
 * instructions explicitly warn against, so only these five event types
 * are ever persisted:
 *   - login (a NEW session started -- native or SSO)
 *   - logout
 *   - workspace resolution failure (archived/inactive/not_found)
 *   - identity conflict (e.g. an identityLinks mismatch)
 *   - session anomaly (an unexpected/unrecognized state)
 * A successful, routine "resolved workspace X for uid Y" is NEVER logged
 * anywhere, not even to console — that would fire on every page load.
 */

export type IdentityAuditEvent = "login" | "logout" | "workspace_resolution_failure" | "identity_conflict" | "session_anomaly";

export function logIdentityEvent(event: IdentityAuditEvent, uid: string, detail?: Record<string, unknown>): void {
  console.warn(`[identity] ${event}`, { uid, ...detail });
  getAdminDb()
    .collection("identityAuditEvents")
    .add({ event, uid, ...detail, createdAt: FieldValue.serverTimestamp() })
    .catch((err) => console.warn("[identity] audit write failed", err));
}
