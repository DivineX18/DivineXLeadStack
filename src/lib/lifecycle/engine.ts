import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * LIFECYCLE STATE ENGINE — first-class, typed lifecycle state with an
 * explicit transition graph per domain. The canonical answer to "what
 * state is this contact/entity in RIGHT NOW" — tags remain for
 * compatibility/search/UI, but they are a PROJECTION, never the truth.
 *
 * Storage: lifecycleStates/{domain:entityId:contactId} (deterministic id →
 * idempotent writes, one doc read answers the current-state question).
 * Server-only collection (Admin SDK), same trust model as importJobs.
 *
 * INTEGRATION RULE (per the architecture map): where a domain already has
 * a canonical status field — appointments live on events/{id}.status
 * (EventStatus) — that field remains the WRITE authority; this engine
 * records the transition + history and answers reads, it never fights the
 * existing field. Webinar + lead domains have no pre-existing entity, so
 * their lifecycleStates doc IS the authority.
 *
 * HONESTY RULE (the automation no-fabrication law): transitions happen
 * because REAL events occurred. There is deliberately no "infer attended
 * from elapsed time" path — a webinar with no attendance evidence stays
 * in `scheduled` (unresolved) rather than fabricating reality.
 */

export type LifecycleDomain = "appointment" | "webinar" | "lead";

/** Legal transition graph per domain. Key = from-state, values = allowed
 *  to-states. "*" key = allowed initial (seed) states. */
const GRAPHS: Record<LifecycleDomain, Record<string, string[]>> = {
  // Mirrors the REAL EventStatus vocabulary (events/{id}.status) plus the
  // pre-entity "requested" and the transition-not-status "rescheduled":
  // booked ≈ scheduled on the event doc; a reschedule updates startAt in
  // place (which live-recalculates wait_until) and re-enters booked.
  appointment: {
    "*": ["requested", "booked"],
    requested: ["booked"],
    booked: ["confirmed", "completed", "cancelled", "no_show", "rescheduled"],
    confirmed: ["completed", "cancelled", "no_show", "rescheduled"],
    rescheduled: ["booked"],
    // Terminal: completed / cancelled / no_show (a NEW appointment is a
    // new entity — a new event doc — never a resurrection of this one).
    completed: [],
    cancelled: [],
    no_show: [],
  },
  webinar: {
    "*": ["registered", "scheduled"],
    registered: ["scheduled", "attended", "missed"],
    scheduled: ["attended", "missed"],
    attended: ["converted", "not_converted"],
    missed: ["converted", "not_converted"],
    converted: [],
    not_converted: [],
  },
  lead: {
    "*": ["new"],
    new: ["engaged", "qualified", "booked", "converted", "lost"],
    engaged: ["qualified", "booked", "converted", "lost"],
    qualified: ["booked", "converted", "lost"],
    booked: ["converted", "lost"],
    converted: [],
    lost: ["engaged"], // a lost lead can legitimately re-engage
  },
};

export interface LifecycleRecord {
  id: string;
  subAccountId: string;
  agencyId: string;
  domain: LifecycleDomain;
  /** The business entity: event id (appointment), funnel id (webinar), or
   *  contact id (lead journey — the contact is its own entity). */
  entityId: string;
  contactId: string;
  state: string;
  previousState: string | null;
  transitionedAt: unknown;
  /** The REAL business event that caused this ("booking.created",
   *  "operator:mark-status", "webinar.registered"). */
  reason: string;
  sourceEventId: string | null;
  metadata: Record<string, unknown>;
  /** Capped audit trail, newest last. */
  history: { from: string | null; to: string; at: string; reason: string }[];
}

export function lifecycleDocId(domain: LifecycleDomain, entityId: string, contactId: string): string {
  return `${domain}:${entityId}:${contactId}`.slice(0, 900);
}

export class LifecycleTransitionError extends Error {
  constructor(
    public readonly code: "illegal_transition" | "unknown_state" | "tenancy",
    message: string,
  ) {
    super(message);
  }
}

const HISTORY_CAP = 30;

/**
 * The one central transition function. Validates graph legality inside a
 * transaction, is idempotent for same-state repeats (returns unchanged),
 * REJECTS illegal transitions with a typed error (never silently accepts),
 * and appends to the audit history.
 */
export async function transitionLifecycleState(input: {
  subAccountId: string;
  agencyId: string;
  domain: LifecycleDomain;
  entityId: string;
  contactId: string;
  to: string;
  reason: string;
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; state: string; changed: boolean } | never> {
  const graph = GRAPHS[input.domain];
  const knownStates = new Set([...Object.keys(graph).filter((k) => k !== "*"), ...graph["*"]]);
  if (!knownStates.has(input.to)) {
    throw new LifecycleTransitionError("unknown_state", `"${input.to}" is not a ${input.domain} state`);
  }
  const db = getAdminDb();
  const ref = db.doc(`lifecycleStates/${lifecycleDocId(input.domain, input.entityId, input.contactId)}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      if (!graph["*"].includes(input.to)) {
        throw new LifecycleTransitionError(
          "illegal_transition",
          `${input.domain} cannot START in "${input.to}" (allowed: ${graph["*"].join(", ")})`,
        );
      }
      tx.set(ref, {
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        domain: input.domain,
        entityId: input.entityId,
        contactId: input.contactId,
        state: input.to,
        previousState: null,
        transitionedAt: FieldValue.serverTimestamp(),
        reason: input.reason,
        sourceEventId: input.sourceEventId ?? null,
        metadata: input.metadata ?? {},
        history: [{ from: null, to: input.to, at: new Date().toISOString(), reason: input.reason }],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true as const, state: input.to, changed: true };
    }

    const cur = snap.data()!;
    if (cur.subAccountId !== input.subAccountId) {
      throw new LifecycleTransitionError("tenancy", "entity belongs to a different workspace");
    }
    const from = cur.state as string;
    if (from === input.to) return { ok: true as const, state: from, changed: false }; // idempotent
    const allowed = graph[from] ?? [];
    if (!allowed.includes(input.to)) {
      throw new LifecycleTransitionError(
        "illegal_transition",
        `${input.domain}: "${from}" → "${input.to}" is not a legal transition (allowed: ${allowed.join(", ") || "none — terminal state"})`,
      );
    }
    const history = [
      ...((cur.history ?? []) as LifecycleRecord["history"]),
      { from, to: input.to, at: new Date().toISOString(), reason: input.reason },
    ].slice(-HISTORY_CAP);
    tx.update(ref, {
      state: input.to,
      previousState: from,
      transitionedAt: FieldValue.serverTimestamp(),
      reason: input.reason,
      sourceEventId: input.sourceEventId ?? null,
      metadata: { ...(cur.metadata ?? {}), ...(input.metadata ?? {}) },
      history,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true as const, state: input.to, changed: true };
  }).then(async (result) => {
    // TAG PROJECTION: tags are a PROJECTION of lifecycle state (never the
    // truth) — but composed workflows' goal-tag exits and operator search
    // read tags, so a state change projects its state name onto the
    // contact's tags (fire-and-forget, idempotent arrayUnion). This is how
    // "attended"/"completed" goal tags fire without manual tagging.
    if (result.changed) {
      await getAdminDb()
        .doc(`contacts/${input.contactId}`)
        .update({ tags: FieldValue.arrayUnion(input.to), updatedAt: FieldValue.serverTimestamp() })
        .catch(() => {});
    }
    return result;
  });
}

/**
 * Canonical current-state read. For the APPOINTMENT domain the live event
 * doc's status is the authority (see integration rule): its EventStatus is
 * mapped onto the lifecycle vocabulary and wins over any stale record.
 */
export async function getLifecycleState(input: {
  subAccountId: string;
  domain: LifecycleDomain;
  entityId: string;
  contactId: string;
}): Promise<string | null> {
  const db = getAdminDb();
  if (input.domain === "appointment") {
    const ev = await db.doc(`events/${input.entityId}`).get();
    if (ev.exists && ev.data()!.subAccountId === input.subAccountId) {
      const status = (ev.data()!.status as string | undefined) ?? "scheduled";
      // EventStatus → lifecycle vocabulary (booked umbrella for live slots).
      if (status === "scheduled" || status === "awaiting_payment") return "booked";
      return status; // completed | cancelled | no_show map 1:1
    }
  }
  const snap = await db.doc(`lifecycleStates/${lifecycleDocId(input.domain, input.entityId, input.contactId)}`).get();
  if (!snap.exists || snap.data()!.subAccountId !== input.subAccountId) return null;
  return snap.data()!.state as string;
}

/** Latest state for a (domain, contact) regardless of entity — the read
 *  the workflow condition ops use ("is this contact's webinar journey in
 *  scheduled?"). Most recent transition wins. */
export async function getLatestLifecycleStateForContact(input: {
  subAccountId: string;
  domain: LifecycleDomain;
  contactId: string;
}): Promise<{ state: string; entityId: string } | null> {
  const snap = await getAdminDb()
    .collection("lifecycleStates")
    .where("subAccountId", "==", input.subAccountId)
    .where("domain", "==", input.domain)
    .where("contactId", "==", input.contactId)
    .get();
  if (snap.empty) return null;
  const docs = snap.docs
    .map((d) => d.data())
    .sort((a, b) => {
      const ta = (a.transitionedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      const tb = (b.transitionedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      return tb - ta;
    });
  const top = docs[0];
  return { state: top.state as string, entityId: top.entityId as string };
}
