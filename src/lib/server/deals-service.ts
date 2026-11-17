import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import {
  serializeDealForApi,
  type DealApiObject,
} from "@/lib/api/serializers/deals";
import { getStage, type DealPriority, type PipelineStageId } from "@/types/deals";
import type { WebhookEventType } from "@/types/webhooks";
import type { CustomFieldValue } from "@/types/custom-fields";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side Deal write service — the single chokepoint where a deal is
 * created/moved/updated/deleted AND the matching webhook fires. Mirrors
 * `contacts-service.ts`; see that file's header for the why.
 *
 * Stage semantics match `PATCH /api/v1/deals/:id`: every write emits
 * `deal.updated`; a stage change additionally emits `deal.stage.changed`
 * plus the terminal-specific `deal.won` / `deal.lost`, and logs a
 * `pipeline_moved` activity on the contact's timeline.
 */

type Mode = "live" | "test";

/**
 * The contact fields embedded inline in every deal webhook payload, so
 * subscribers get the email/phone/name without a follow-up lookup. `null`
 * on the payload when the deal has no contact or it couldn't be read.
 */
export interface DealContactSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function summaryFromContactData(
  contactId: string,
  data: FirebaseFirestore.DocumentData,
): DealContactSummary {
  return {
    id: contactId,
    name: cleanStr(data.name),
    email: cleanStr(data.email),
    phone: cleanStr(data.phone),
  };
}

/**
 * Look up a deal's contact for the inline webhook summary. Returns null when
 * the deal has no contact or the contact can't be read.
 */
export async function fetchDealContactSummary(
  contactId: string | null | undefined,
): Promise<DealContactSummary | null> {
  if (!contactId) return null;
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    if (!snap.exists) return null;
    return summaryFromContactData(contactId, snap.data()!);
  } catch {
    return null;
  }
}

/**
 * Fire one or more deal webhook events, enriching each payload with the
 * deal's contact summary (`contact: { id, name, email, phone } | null`).
 * Fire-and-forget: the contact is resolved ONCE and reused across every
 * event in this operation. Pass `contact` to skip the lookup (e.g. the
 * contact was already read, or has been deleted in a cascade).
 *
 * This is the single chokepoint for deal webhook emission — both the
 * dashboard service functions below and the public `/api/v1/deals` routes
 * call it, so every deal event carries the same enriched shape.
 */
export function emitDealEvents(opts: {
  subAccountId: string;
  agencyId: string;
  mode: Mode;
  deal: DealApiObject;
  events: { type: WebhookEventType; extra?: Record<string, unknown> }[];
  contact?: DealContactSummary | null;
}): void {
  void (async () => {
    try {
      const contact =
        opts.contact !== undefined
          ? opts.contact
          : await fetchDealContactSummary(opts.deal.contact_id);
      for (const e of opts.events) {
        await emitWebhookEvent({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          mode: opts.mode,
          type: e.type,
          payload: { deal: opts.deal, contact, ...(e.extra ?? {}) },
        });
      }
    } catch (err) {
      console.warn("[deals-service] emitDealEvents failed", err);
    }
  })();
}

/** Write a `pipeline_moved` activity to the contact's timeline (Admin SDK). */
async function writePipelineActivity(
  contactId: string,
  payload: {
    content: string;
    createdBy: string;
    meta: Record<string, unknown>;
  },
): Promise<void> {
  await getAdminDb()
    .collection("contacts")
    .doc(contactId)
    .collection("activities")
    .add({
      type: "pipeline_moved",
      content: payload.content,
      createdBy: payload.createdBy,
      meta: payload.meta,
      createdAt: FieldValue.serverTimestamp(),
    });
}

export interface CreateDealInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  value: number;
  currency: string;
  contactId: string;
  stageId: PipelineStageId;
  priority: DealPriority;
  territoryId?: string | null;
  customFields?: Record<string, CustomFieldValue> | null;
}

export interface DealWriteResult {
  id: string;
  deal: DealApiObject;
}

/**
 * gRPC/Firestore's ALREADY_EXISTS status (code 6) — what `DocumentReference
 * .create()` throws when the target doc id already has a document. This is
 * a stable, long-documented part of the gRPC status-code spec that
 * Firestore's Admin SDK surfaces as-is, not something specific to one SDK
 * version; the message check is a defensive fallback only.
 */
function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: number | string })?.code;
  if (code === 6 || code === "already-exists") return true;
  const message = err instanceof Error ? err.message : "";
  return /already exists/i.test(message);
}

/**
 * Create a deal + log the create activity + emit `deal.created`.
 *
 * `idempotencyKey`, when passed, makes this create-exactly-once: the deal
 * is written to a document whose id IS the key (via `.create()`, which
 * Firestore atomically refuses if that id already has a document), instead
 * of an auto-generated id. A caller whose own request can be delivered more
 * than once for the same logical operation (the workflow engine, keyed on
 * `runId_nodeId`) passes this so a retry or a genuinely concurrent
 * duplicate delivery resolves to the SAME deal document rather than
 * creating a second one — with no separate claim step and therefore no
 * claim-before-effect gap: the create call itself is the atomic check.
 * Ordinary callers (the dashboard's "add deal" action, the public API) omit
 * it and get the previous auto-id behavior, since each of their calls is
 * intentionally a new, distinct deal.
 *
 * On a detected duplicate (the id already exists), the activity write and
 * `deal.created` webhook are skipped — they already fired on whichever
 * attempt created the document — and the existing deal's current data is
 * returned so the caller still gets a valid result.
 */
export async function createDealServerSide(
  input: CreateDealInput,
  opts?: { idempotencyKey?: string },
): Promise<DealWriteResult> {
  const db = getAdminDb();
  const ref = opts?.idempotencyKey
    ? db.collection("deals").doc(opts.idempotencyKey)
    : db.collection("deals").doc();

  const doc = {
    title: input.title,
    value: input.value,
    currency: input.currency,
    contactId: input.contactId,
    stageId: input.stageId,
    priority: input.priority,
    lostReason: null,
    customFields: input.customFields ?? {},
    territoryId: input.territoryId ?? GLOBAL_TERRITORY_ID,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    stageChangedAt: FieldValue.serverTimestamp(),
  };

  if (opts?.idempotencyKey) {
    try {
      await ref.create(doc);
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err;
      const existing = await ref.get();
      const data = existing.data()!;
      return {
        id: ref.id,
        deal: serializeDealForApi(ref.id, data, (data.mode as Mode) ?? input.mode),
      };
    }
  } else {
    await ref.set(doc);
  }

  await writePipelineActivity(input.contactId, {
    content: `Deal "${input.title}" created in ${getStage(input.stageId).label}`,
    createdBy: input.createdByUid,
    meta: { dealId: ref.id, toStageId: input.stageId },
  });

  const now = new Date();
  const deal = serializeDealForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now, stageChangedAt: now },
    input.mode,
  );

  emitDealEvents({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    deal,
    events: [{ type: "deal.created" }],
  });

  return { id: ref.id, deal };
}

/**
 * Patch a deal. Handles plain field edits, contact re-home, and stage moves
 * in one call (the edit dialog sends all of them together; the Kanban drag
 * sends just `stageId` + optional `lostReason`).
 *
 * `userId` is stamped as the author of the move activity. Returns null when
 * the deal doesn't exist.
 */
export interface UpdateDealPatch {
  title?: string;
  value?: number;
  currency?: string;
  priority?: DealPriority;
  contactId?: string;
  territoryId?: string | null;
  stageId?: PipelineStageId;
  /** Only meaningful on a move to "lost". */
  lostReason?: string | null;
  /** "Completed" tick on a Won deal card. Stamps/clears `completedAt`. */
  completed?: boolean;
  /** Full replacement of the custom-field value map (validated by the route). */
  customFields?: Record<string, CustomFieldValue> | null;
}

/**
 * Pure computation of the Firestore patch for a deal update, given the
 * deal's CURRENT data and the requested patch — no I/O. Shared by
 * `updateDealServerSide` (plain read-then-write) and
 * `claimAndMoveDealStageServerSide` (the same computation run inside a
 * transaction) so the two code paths can never drift apart on what
 * "unrelated deal fields are preserved" / "stage validation" / "lost
 * reason handling" actually means.
 */
function buildDealUpdateWrite(
  existing: FirebaseFirestore.DocumentData,
  patch: UpdateDealPatch,
): {
  write: Record<string, unknown>;
  stageChanged: boolean;
  previousStage: PipelineStageId | undefined;
} {
  const previousStage = existing.stageId as PipelineStageId | undefined;
  const write: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) write.title = patch.title;
  if (patch.value !== undefined) write.value = patch.value;
  if (patch.currency !== undefined) write.currency = patch.currency;
  if (patch.priority !== undefined) write.priority = patch.priority;
  if (patch.contactId !== undefined) write.contactId = patch.contactId;
  if (patch.territoryId !== undefined) write.territoryId = patch.territoryId;
  if (patch.customFields !== undefined) write.customFields = patch.customFields;
  if (patch.completed !== undefined) {
    write.completed = patch.completed;
    write.completedAt = patch.completed ? FieldValue.serverTimestamp() : null;
  }

  const stageChanged =
    patch.stageId !== undefined && patch.stageId !== previousStage;
  if (patch.stageId !== undefined) {
    write.stageId = patch.stageId;
    if (stageChanged) {
      write.stageChangedAt = FieldValue.serverTimestamp();
      // Mirror the old client `moveDeal`: set the reason moving INTO lost,
      // clear it moving back OUT of lost.
      if (patch.stageId === "lost") {
        write.lostReason = patch.lostReason?.trim() || null;
      } else if (previousStage === "lost") {
        write.lostReason = null;
      }
    }
  }
  return { write, stageChanged, previousStage };
}

/**
 * Side effects of a deal update, run AFTER the core write has committed —
 * pipeline activity, webhooks, and the downstream pipeline.stage.changed
 * trigger. Deliberately never run INSIDE a Firestore transaction: a
 * transaction function can be internally retried by the SDK on write
 * contention before it successfully commits, and these are non-idempotent
 * external effects (an activity row, an outbound webhook, a workflow
 * trigger) that must fire at most once per real commit, not once per
 * attempt.
 */
async function applyDealUpdateSideEffects(opts: {
  dealId: string;
  data: FirebaseFirestore.DocumentData;
  mode: Mode;
  patch: UpdateDealPatch;
  stageChanged: boolean;
  previousStage: PipelineStageId | undefined;
  userId: string;
  subAccountId: string;
  agencyId: string;
}): Promise<DealWriteResult> {
  const deal = serializeDealForApi(opts.dealId, opts.data, opts.mode);

  if (opts.stageChanged && opts.previousStage && opts.patch.stageId) {
    const reasonSuffix =
      opts.patch.stageId === "lost" && opts.data.lostReason
        ? `, ${opts.data.lostReason as string}`
        : "";
    await writePipelineActivity(opts.data.contactId, {
      content: `Deal "${opts.data.title}" moved from ${getStage(opts.previousStage).label} to ${getStage(opts.patch.stageId).label}${reasonSuffix}`,
      createdBy: opts.userId,
      meta: {
        dealId: opts.dealId,
        fromStageId: opts.previousStage,
        toStageId: opts.patch.stageId,
      },
    });
  }

  // Always emit deal.updated; a stage move layers the finer events on top.
  const events: { type: WebhookEventType; extra?: Record<string, unknown> }[] =
    [{ type: "deal.updated" }];
  if (opts.stageChanged) {
    events.push({
      type: "deal.stage.changed",
      extra: { previous_stage: opts.previousStage ?? null },
    });
    if (opts.patch.stageId === "won") events.push({ type: "deal.won" });
    else if (opts.patch.stageId === "lost") events.push({ type: "deal.lost" });
  }
  emitDealEvents({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode: opts.mode,
    deal,
    events,
  });

  // Workflow trigger — a stage move enrolls the deal's contact (workflow runs
  // are contact-scoped). `toStage` lets a workflow narrow to one target stage.
  if (opts.mode === "live" && opts.stageChanged && opts.data.contactId) {
    void fireWorkflowTrigger({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      type: "pipeline.stage.changed",
      contactId: opts.data.contactId as string,
      context: { toStage: opts.patch.stageId },
    });
  }

  return { id: opts.dealId, deal };
}

export async function updateDealServerSide(opts: {
  dealId: string;
  patch: UpdateDealPatch;
  userId: string;
  mode?: Mode;
  /**
   * Tenancy guard: when set, the update is refused (returns null, exactly
   * like a missing doc) unless the loaded deal's `subAccountId` matches.
   * This function otherwise mutates ANY deal by id — callers whose dealId
   * comes from an untrusted source (the AI Suite, request payloads) MUST
   * pass this so a foreign id can't cross tenants.
   */
  expectedSubAccountId?: string;
}): Promise<DealWriteResult | null> {
  const db = getAdminDb();
  const ref = db.doc(`deals/${opts.dealId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (
    opts.expectedSubAccountId !== undefined &&
    snap.data()?.subAccountId !== opts.expectedSubAccountId
  ) {
    return null;
  }

  const existing = snap.data()!;
  const mode = opts.mode ?? (existing.mode as Mode) ?? "live";
  const { write, stageChanged, previousStage } = buildDealUpdateWrite(
    existing,
    opts.patch,
  );

  await ref.set(write, { merge: true });

  const fresh = await ref.get();
  const data = fresh.data()!;

  return applyDealUpdateSideEffects({
    dealId: fresh.id,
    data,
    mode,
    patch: opts.patch,
    stageChanged,
    previousStage,
    userId: opts.userId,
    subAccountId: existing.subAccountId as string,
    agencyId: existing.agencyId as string,
  });
}

/**
 * Atomically claims a (runId, nodeId) workflow step AND moves a deal's
 * stage, in ONE Firestore transaction — so a failure on either half can
 * never leave the other behind. This replaces the workflow engine's
 * earlier two-step design (a standalone claim transaction, followed by a
 * separate, non-transactional call to updateDealServerSide): that design
 * closed the double-execution race but opened a narrower one — a
 * transient failure on the deal write, AFTER the claim had already
 * committed, permanently and silently prevented the deal from ever
 * moving, because a retry saw the claim already taken and skipped. Here
 * the claim and the deal mutation are staged in the same transaction, so
 * Firestore only ever commits them together.
 *
 * Side effects (activity, webhooks, the downstream trigger) run AFTER the
 * transaction commits, via the same applyDealUpdateSideEffects()
 * updateDealServerSide uses — see that function's own comment for why
 * they must not run inside the transaction itself.
 */
export async function claimAndMoveDealStageServerSide(opts: {
  runId: string;
  nodeId: string;
  dealId: string;
  stageId: PipelineStageId;
  userId: string;
  /** Same tenancy guard as updateDealServerSide — required here, not
   *  optional, since every caller of this function resolves dealId from
   *  workflow/trigger context, never from a trusted first-party id. */
  expectedSubAccountId: string;
  lostReason?: string | null;
}): Promise<
  | { ok: true; claimed: true; deal: DealApiObject }
  | { ok: true; claimed: false }
  | { ok: false; reason: "deal_not_found" }
> {
  const db = getAdminDb();
  const claimRef = db.doc(
    `workflowRuns/${opts.runId}/dealStageClaims/${opts.nodeId}`,
  );
  const dealRef = db.doc(`deals/${opts.dealId}`);
  const patch: UpdateDealPatch = {
    stageId: opts.stageId,
    lostReason: opts.lostReason,
  };

  type TxResult =
    | { claimed: false; dealMissing?: true }
    | {
        claimed: true;
        mode: Mode;
        stageChanged: boolean;
        previousStage: PipelineStageId | undefined;
        subAccountId: string;
        agencyId: string;
      };

  const txResult = await db.runTransaction<TxResult>(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists) return { claimed: false };

    const dealSnap = await tx.get(dealRef);
    if (
      !dealSnap.exists ||
      dealSnap.data()?.subAccountId !== opts.expectedSubAccountId
    ) {
      return { claimed: false, dealMissing: true };
    }

    const existing = dealSnap.data()!;
    const mode = (existing.mode as Mode) ?? "live";
    const { write, stageChanged, previousStage } = buildDealUpdateWrite(
      existing,
      patch,
    );

    tx.set(claimRef, { claimedAt: FieldValue.serverTimestamp() });
    tx.update(dealRef, write);

    return {
      claimed: true,
      mode,
      stageChanged,
      previousStage,
      subAccountId: existing.subAccountId as string,
      agencyId: existing.agencyId as string,
    };
  });

  if (!txResult.claimed) {
    return txResult.dealMissing
      ? { ok: false, reason: "deal_not_found" }
      : { ok: true, claimed: false };
  }

  // Re-read AFTER the transaction commits to resolve the serverTimestamp
  // sentinels into real values for serialization — the same reason
  // updateDealServerSide re-reads after its own (non-transactional) write.
  const fresh = await dealRef.get();
  const data = fresh.data()!;

  const result = await applyDealUpdateSideEffects({
    dealId: opts.dealId,
    data,
    mode: txResult.mode,
    patch,
    stageChanged: txResult.stageChanged,
    previousStage: txResult.previousStage,
    userId: opts.userId,
    subAccountId: txResult.subAccountId,
    agencyId: txResult.agencyId,
  });

  return { ok: true, claimed: true, deal: result.deal };
}

/**
 * Delete a deal + emit `deal.deleted` (serialized from the pre-delete
 * snapshot). Returns false when the deal didn't exist.
 */
export async function deleteDealServerSide(opts: {
  dealId: string;
  mode?: Mode;
}): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.doc(`deals/${opts.dealId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data()!;
  const mode = opts.mode ?? (data.mode as Mode) ?? "live";
  const deal = serializeDealForApi(snap.id, data, mode);

  await ref.delete();

  emitDealEvents({
    subAccountId: data.subAccountId,
    agencyId: data.agencyId,
    mode,
    deal,
    events: [{ type: "deal.deleted" }],
  });
  return true;
}

/**
 * Emit `deal.deleted` from a pre-delete snapshot. Used by paths that delete
 * a deal outside `deleteDealServerSide` — the contact-delete cascade (which
 * batch-deletes a contact's deals) and the public API's deal DELETE.
 */
export function emitDealDeleted(opts: {
  subAccountId: string;
  agencyId: string;
  dealId: string;
  data: FirebaseFirestore.DocumentData;
  mode?: Mode;
  /**
   * Pre-read contact doc data. The contact-delete cascade deletes the
   * contact BEFORE this fires, so a fresh lookup would miss it — pass the
   * contact data the route already read. Omit to look the contact up.
   */
  contactData?: FirebaseFirestore.DocumentData | null;
}): void {
  const mode = opts.mode ?? (opts.data.mode as Mode) ?? "live";
  const deal = serializeDealForApi(opts.dealId, opts.data, mode);
  const contactId = opts.data.contactId as string | null | undefined;
  const contact =
    opts.contactData !== undefined
      ? contactId
        ? summaryFromContactData(contactId, opts.contactData ?? {})
        : null
      : undefined;
  emitDealEvents({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode,
    deal,
    events: [{ type: "deal.deleted" }],
    contact,
  });
}

/**
 * Emit `deal.created` for a deal already written elsewhere (the public form
 * submit creates a deal inline). Self-guarded so it's safe to `void`.
 */
export async function emitDealCreatedById(opts: {
  subAccountId: string;
  agencyId: string;
  dealId: string;
  mode?: Mode;
}): Promise<void> {
  try {
    const snap = await getAdminDb().doc(`deals/${opts.dealId}`).get();
    if (!snap.exists) return;
    const mode = opts.mode ?? (snap.data()!.mode as Mode) ?? "live";
    const deal = serializeDealForApi(snap.id, snap.data()!, mode);
    emitDealEvents({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode,
      deal,
      events: [{ type: "deal.created" }],
    });
  } catch (err) {
    console.warn("[deals-service] emitDealCreatedById failed", err);
  }
}

/**
 * This workspace's deals, most recently updated first.
 *
 * Scoped by subAccountId, which is the tenancy key on the doc. An equality
 * filter on one field needs no composite index, and the ordering is done in
 * memory for the same reason.
 */
export async function listDealsServerSide(
  subAccountId: string,
  opts: { limit?: number } = {},
): Promise<{ id: string; title: string; stageId: string; value: number; currency: string; contactId: string | null; updatedAt: Date | null }[]> {
  const snap = await getAdminDb()
    .collection("deals")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: String(x.title ?? ""),
        stageId: String(x.stageId ?? ""),
        value: Number(x.value ?? 0),
        currency: String(x.currency ?? "usd"),
        contactId: (x.contactId as string) ?? null,
        updatedAt: x.updatedAt?.toDate?.() ?? null,
      };
    })
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, opts.limit ?? 50);
}
