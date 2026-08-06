import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  computeAddSecondary,
  computeAttachPrimary,
  computePromoteSecondaryToPrimary,
  computeRemoveSecondary,
  dedupeSecondaryProfileIds,
  nextMappingVersion,
  validateNoPrimarySecondaryOverlap,
} from "@/lib/workspace/workspace-mapping-invariants";
import type {
  WorkspaceMappingDoc,
  WorkspaceMappingResult,
  WorkspaceMappingStatus,
  WorkspaceMappingProvisioningStatus,
  ReconciliationResult,
} from "@/types/workspace-mappings";

/**
 * Ascend OS Phase 2, Slice 4 — Workspace Mapping v2 core service layer.
 *
 * Storage: workspaceMappings/{workspaceId} (main doc, workspaceId is a
 * generated UUID — NOT derived from flowSubAccountId), plus
 * workspaceMappingsBySubAccount/{flowSubAccountId} -> {workspaceId} (reverse
 * index, doc-ID-as-uniqueness-constraint gives flowSubAccountId uniqueness
 * for free, same trick Slice 3's identityLinks uses), plus append-only
 * workspaceMappingAttempts/{auto} for every create/conflict/relink/status
 * change/archive/restore/reconciliation event.
 *
 * This is the SERVICE-TO-SERVICE layer — no function here checks human
 * session authorization. Callers acting on behalf of a logged-in user MUST
 * go through workspace-mappings-authz.ts instead, which wraps the relevant
 * functions with Flow's existing requireSubAccountMember/-Admin checks
 * before delegating here. Migration/reconciliation scripts call this file
 * directly with an explicit `actingAsUid` audit marker (e.g.
 * "system:migration-tool") — that split is deliberate, not an oversight.
 *
 * Never links/matches by email anywhere in this file.
 */

function mappingsCol() {
  return getAdminDb().collection("workspaceMappings");
}
function reverseIndexCol() {
  return getAdminDb().collection("workspaceMappingsBySubAccount");
}

async function logAttempt(entry: Record<string, unknown>) {
  try {
    await getAdminDb()
      .collection("workspaceMappingAttempts")
      .add({ ...entry, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.warn("[workspace-mappings] attempt-log write failed", err);
  }
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function getMappingByWorkspaceId(workspaceId: string): Promise<WorkspaceMappingDoc | null> {
  const snap = await mappingsCol().doc(workspaceId).get();
  return snap.exists ? (snap.data() as WorkspaceMappingDoc) : null;
}

export async function getMappingBySubAccountId(
  flowSubAccountId: string,
): Promise<WorkspaceMappingDoc | null> {
  const idxSnap = await reverseIndexCol().doc(flowSubAccountId).get();
  if (!idxSnap.exists) return null;
  const { workspaceId } = idxSnap.data() as { workspaceId: string };
  return getMappingByWorkspaceId(workspaceId);
}

export async function getMappingByPrimaryBusinessProfileId(
  profileId: string,
): Promise<WorkspaceMappingDoc | null> {
  const snap = await mappingsCol()
    .where("primaryAscendBusinessProfileId", "==", profileId)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as WorkspaceMappingDoc);
}

export async function findMappingsWithSecondaryBusinessProfileId(
  profileId: string,
): Promise<WorkspaceMappingDoc[]> {
  const snap = await mappingsCol()
    .where("linkedSecondaryAscendBusinessProfileIds", "array-contains", profileId)
    .get();
  return snap.docs.map((d) => d.data() as WorkspaceMappingDoc);
}

// ── Create ───────────────────────────────────────────────────────────────

export async function createMappingIdempotent(params: {
  flowSubAccountId: string;
  agencyId: string | null;
  ownerFirebaseUid: string;
  primaryAscendBusinessProfileId: string | null;
  linkedSecondaryAscendBusinessProfileIds?: string[];
  actingAsUid: string;
}): Promise<WorkspaceMappingResult<{ created: boolean; mapping: WorkspaceMappingDoc }>> {
  const secondaries = dedupeSecondaryProfileIds(params.linkedSecondaryAscendBusinessProfileIds ?? []);
  const overlapCheck = validateNoPrimarySecondaryOverlap(params.primaryAscendBusinessProfileId, secondaries);
  if (!overlapCheck.ok) {
    return { ok: false, reason: overlapCheck.reason };
  }

  const db = getAdminDb();
  const reverseRef = reverseIndexCol().doc(params.flowSubAccountId);

  const result = await db.runTransaction(async (tx) => {
    const reverseSnap = await tx.get(reverseRef);
    if (reverseSnap.exists) {
      const { workspaceId } = reverseSnap.data() as { workspaceId: string };
      const existingSnap = await tx.get(mappingsCol().doc(workspaceId));
      const existing = existingSnap.exists ? (existingSnap.data() as WorkspaceMappingDoc) : null;
      return { outcome: "conflict" as const, existing };
    }

    const workspaceId = randomUUID();
    const mapping: WorkspaceMappingDoc = {
      workspaceId,
      flowSubAccountId: params.flowSubAccountId,
      agencyId: params.agencyId,
      ownerFirebaseUid: params.ownerFirebaseUid,
      primaryAscendBusinessProfileId: params.primaryAscendBusinessProfileId,
      linkedSecondaryAscendBusinessProfileIds: secondaries,
      status: "pending_provision",
      provisioningStatus: "complete", // this function only ever creates a mapping over an already-real Flow subAccount; there's no separate provisioning step to track
      mappingVersion: 1,
      lastReconciliationResult: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(mappingsCol().doc(workspaceId), mapping);
    tx.set(reverseRef, { workspaceId });
    return { outcome: "created" as const, mapping };
  });

  if (result.outcome === "conflict") {
    await logAttempt({
      flowSubAccountId: params.flowSubAccountId,
      outcome: "conflict",
      actingAsUid: params.actingAsUid,
      existingWorkspaceId: result.existing?.workspaceId ?? null,
    });
    // Idempotent-create semantics: if the existing mapping is for the exact
    // same owner, treat as a no-op success rather than a hard conflict.
    if (result.existing && result.existing.ownerFirebaseUid === params.ownerFirebaseUid) {
      return { ok: true, value: { created: false, mapping: result.existing } };
    }
    return {
      ok: false,
      reason: `flowSubAccountId ${params.flowSubAccountId} is already mapped to a different owner`,
      existing: result.existing ?? undefined,
    };
  }

  await logAttempt({
    flowSubAccountId: params.flowSubAccountId,
    workspaceId: result.mapping.workspaceId,
    outcome: "created",
    actingAsUid: params.actingAsUid,
  });
  return { ok: true, value: { created: true, mapping: result.mapping } };
}

// ── Profile attach/promote helpers (transactional read-modify-write) ──────

/** The mutate callback's own return shape — deliberately distinct from the
 *  outer WorkspaceMappingResult<T> (which also carries an `existing` field
 *  meant for create-conflict results, not relevant here). Keeping this
 *  local and simple is what fixes tsc's generic-inference ambiguity. */
type MutateOutcome<T> = { ok: true; doc: Partial<WorkspaceMappingDoc>; value: T } | { ok: false; reason: string };

async function withMapping<T>(
  workspaceId: string,
  actingAsUid: string,
  eventLabel: string,
  mutate: (m: WorkspaceMappingDoc) => MutateOutcome<T>,
): Promise<WorkspaceMappingResult<T>> {
  const db = getAdminDb();
  const ref = mappingsCol().doc(workspaceId);

  const result: WorkspaceMappingResult<T> = await db.runTransaction(async (tx): Promise<WorkspaceMappingResult<T>> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { ok: false, reason: `No workspaceMappings/${workspaceId} exists` };
    }
    const current = snap.data() as WorkspaceMappingDoc;
    const outcome = mutate(current);
    if (!outcome.ok) {
      return { ok: false, reason: outcome.reason };
    }
    tx.update(ref, {
      ...outcome.doc,
      mappingVersion: nextMappingVersion(current.mappingVersion),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, value: outcome.value };
  });

  await logAttempt({ workspaceId, outcome: result.ok ? "updated" : "rejected", event: eventLabel, actingAsUid });
  return result;
}

export async function attachPrimaryBusinessProfile(
  workspaceId: string,
  profileId: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "attach_primary", (m) => {
    const result = computeAttachPrimary({ primary: m.primaryAscendBusinessProfileId, secondaries: m.linkedSecondaryAscendBusinessProfileIds }, profileId);
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      doc: { primaryAscendBusinessProfileId: result.value.primary, linkedSecondaryAscendBusinessProfileIds: result.value.secondaries },
      value: null,
    };
  });
}

export async function addSecondaryBusinessProfile(
  workspaceId: string,
  profileId: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "add_secondary", (m) => {
    const result = computeAddSecondary({ primary: m.primaryAscendBusinessProfileId, secondaries: m.linkedSecondaryAscendBusinessProfileIds }, profileId);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, doc: { linkedSecondaryAscendBusinessProfileIds: result.value.secondaries }, value: null };
  });
}

export async function removeSecondaryBusinessProfile(
  workspaceId: string,
  profileId: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "remove_secondary", (m) => {
    const result = computeRemoveSecondary({ primary: m.primaryAscendBusinessProfileId, secondaries: m.linkedSecondaryAscendBusinessProfileIds }, profileId);
    return { ok: true, doc: { linkedSecondaryAscendBusinessProfileIds: result.secondaries }, value: null };
  });
}

export async function promoteSecondaryToPrimary(
  workspaceId: string,
  profileId: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "promote_secondary", (m) => {
    const result = computePromoteSecondaryToPrimary({ primary: m.primaryAscendBusinessProfileId, secondaries: m.linkedSecondaryAscendBusinessProfileIds }, profileId);
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      doc: { primaryAscendBusinessProfileId: result.value.primary, linkedSecondaryAscendBusinessProfileIds: result.value.secondaries },
      value: null,
    };
  });
}

// ── Status lifecycle ───────────────────────────────────────────────────────

export async function updateMappingStatus(
  workspaceId: string,
  status: WorkspaceMappingStatus,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, `status_${status}`, () => ({ ok: true, doc: { status }, value: null }));
}

export async function archiveMapping(
  workspaceId: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return updateMappingStatus(workspaceId, "archived", actingAsUid);
}

/** Archived mappings are never deleted, so restore is just a status flip —
 *  no data was lost to restore. */
export async function restoreArchivedMapping(
  workspaceId: string,
  restoreToStatus: Exclude<WorkspaceMappingStatus, "archived">,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "restore", (m) => {
    if (m.status !== "archived") {
      return { ok: false, reason: `Workspace ${workspaceId} is not archived (current status: ${m.status})` };
    }
    return { ok: true, doc: { status: restoreToStatus }, value: null };
  });
}

export async function recordPartialFailure(
  workspaceId: string,
  step: string,
  reason: string,
  actingAsUid: string,
): Promise<WorkspaceMappingResult<null>> {
  return withMapping(workspaceId, actingAsUid, "partial_failure", () => ({
    ok: true,
    doc: { provisioningStatus: "partial_failure" as WorkspaceMappingProvisioningStatus },
    value: null,
  })).then(async (result) => {
    await logAttempt({ workspaceId, outcome: "partial_failure", step, reason, actingAsUid });
    return result;
  });
}

// ── Reconciliation ──────────────────────────────────────────────────────────

export interface ReconcileOptions {
  /** Injected so this stays testable without a real Ascend Postgres
   *  connection, and so the "never verified" case is explicit rather than
   *  silently skipped when no checker is supplied. */
  ascendProfileExistenceCheck?: (profileId: string) => Promise<boolean>;
  /** When true, safe deterministic drift (agencyId mismatch only) is
   *  auto-corrected. Ownership/membership drift is NEVER auto-repaired
   *  regardless of this flag. */
  repairSafeDrift?: boolean;
}

export async function reconcileMapping(
  workspaceId: string,
  actingAsUid: string,
  options: ReconcileOptions = {},
): Promise<WorkspaceMappingResult<ReconciliationResult>> {
  const mapping = await getMappingByWorkspaceId(workspaceId);
  if (!mapping) {
    return { ok: false, reason: `No workspaceMappings/${workspaceId} exists` };
  }

  const driftFields: string[] = [];
  const notes: string[] = [];
  const db = getAdminDb();

  const subSnap = await db.doc(`subAccounts/${mapping.flowSubAccountId}`).get();
  if (!subSnap.exists) {
    const result: ReconciliationResult = {
      at: FieldValue.serverTimestamp(),
      outcome: "check_failed",
      driftFields: ["flowSubAccountId"],
      details: `subAccounts/${mapping.flowSubAccountId} does not exist -- underlying Flow SubAccount is missing`,
    };
    await withMapping(workspaceId, actingAsUid, "reconcile_failed", () => ({
      ok: true,
      doc: { lastReconciliationResult: result },
      value: null,
    }));
    return { ok: true, value: result };
  }
  const sub = subSnap.data() as { agencyId: string; status: string };

  let agencyRepaired = false;
  if (mapping.agencyId !== sub.agencyId) {
    driftFields.push("agencyId");
    if (options.repairSafeDrift) {
      agencyRepaired = true;
      notes.push(`agencyId drift auto-repaired: ${mapping.agencyId} -> ${sub.agencyId} (Flow SubAccount is authoritative)`);
    } else {
      notes.push(`agencyId drift detected (mapping: ${mapping.agencyId}, Flow: ${sub.agencyId}) -- not repaired (repairSafeDrift not set)`);
    }
  }

  const memberSnap = await db
    .doc(`subAccounts/${mapping.flowSubAccountId}/subAccountMembers/${mapping.ownerFirebaseUid}`)
    .get();
  if (!memberSnap.exists) {
    driftFields.push("ownerFirebaseUid");
    notes.push(
      `ownerFirebaseUid ${mapping.ownerFirebaseUid} has no subAccountMembers doc on ${mapping.flowSubAccountId} -- NEVER auto-repaired, ownership is never guessed`,
    );
  } else {
    const member = memberSnap.data() as { status: string };
    if (member.status !== "active") {
      driftFields.push("ownerMembershipStatus");
      notes.push(`Owner's membership status is "${member.status}", not "active" -- not auto-repaired`);
    }
  }

  if (mapping.primaryAscendBusinessProfileId && options.ascendProfileExistenceCheck) {
    const exists = await options.ascendProfileExistenceCheck(mapping.primaryAscendBusinessProfileId);
    if (!exists) {
      driftFields.push("primaryAscendBusinessProfileId");
      notes.push(`Primary business profile ${mapping.primaryAscendBusinessProfileId} was not found by the injected checker`);
    }
  } else if (mapping.primaryAscendBusinessProfileId) {
    notes.push("Ascend business profile existence NOT verified -- no checker was provided to this reconciliation run");
  }

  const outcome: ReconciliationResult["outcome"] =
    driftFields.length === 0 ? "clean" : agencyRepaired && driftFields.length === 1 ? "drift_repaired" : "drift_detected";

  const result: ReconciliationResult = {
    at: FieldValue.serverTimestamp(),
    outcome,
    driftFields,
    details: notes.join("; ") || "No drift detected",
  };

  await withMapping(workspaceId, actingAsUid, "reconcile", () => ({
    ok: true,
    doc: {
      lastReconciliationResult: result,
      ...(agencyRepaired ? { agencyId: sub.agencyId } : {}),
    },
    value: null,
  }));

  return { ok: true, value: result };
}
