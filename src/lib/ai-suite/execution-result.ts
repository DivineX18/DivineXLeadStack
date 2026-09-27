import "server-only";

/**
 * THE EXECUTION RESULT CONTRACT.
 *
 * Every consumer downstream of a Zeno action needs the same four facts:
 * what kind of thing changed, which one, what happened to it, and whether
 * it actually happened. The web UI needs them to refresh the record the
 * customer is looking at. An external channel needs them to say what it
 * did. The audit trail needs them to be the same facts the customer was
 * told. Today each of those reads `resultText`, a sentence written for the
 * model, and `ref`, an optional pointer that most capabilities forget to
 * return. Prose is not a contract.
 *
 * THE INVARIANT THIS FILE EXISTS FOR: a capability cannot declare its own
 * success. It returns a MutationDescriptor, which says what it did and
 * carries no status field at all, so "it worked" is unrepresentable in the
 * value a capability controls. The receipt, the thing that says committed,
 * is minted in exactly one place: the confirm route, after `cap.execute()`
 * has returned without throwing. That return IS the commit boundary
 * established in fa8dbbc. A capability that writes nothing and returns a
 * cheerful descriptor still produces a receipt, so the descriptor is a
 * claim about WHAT, never about WHETHER; whether is decided by control
 * flow, which a model cannot influence.
 *
 * The audit row and the receipt are built from the same descriptor by the
 * same function, so the record of what happened and the answer given to the
 * customer cannot drift apart.
 *
 * WHAT IS DELIBERATELY NOT HERE: before and after values. A consumer that
 * needs the new state re-reads the record, which is the source of truth
 * anyway. Field NAMES are enough to know what to refresh, and shipping
 * values would put customer data into audit rows, notification payloads and
 * eventually a third-party chat transport for no benefit.
 */

/**
 * The resources Zeno can act on. Drawn from the `ref.kind` values the
 * registry already emits and the kinds the chat UI already routes on, so
 * this names what exists rather than inventing a taxonomy.
 */
export const RESOURCE_KINDS = [
  "contact",
  "deal",
  "task",
  "event",
  "form",
  "booking_page",
  "workflow",
  "message_template",
  "funnel",
  "website",
  "community",
  "webhook",
  "member",
  "invite",
  "asset",
  "social_post",
  "email_send",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * What happened to it. Kept small and physical: these map onto things a
 * consumer must behave differently about, not onto every verb a capability
 * might use. "sent" and "published" are separate from "updated" because
 * they are irreversible and leave the system.
 */
export const MUTATION_OPERATIONS = [
  "created",
  "updated",
  "deleted",
  "sent",
  "scheduled",
  "published",
] as const;
export type MutationOperation = (typeof MUTATION_OPERATIONS)[number];

/**
 * What a capability returns. Note what is absent: any notion of success.
 */
export interface MutationDescriptor {
  resourceType: ResourceKind;
  resourceId: string;
  operation: MutationOperation;
  /**
   * Field NAMES that changed, never values. Lets a consumer decide whether
   * it cares (a booking editor showing hours can ignore a rename) without
   * anything sensitive leaving the server.
   */
  changedFields?: string[];
  /**
   * One line, safe to show a person. No ids, no internal parameter names.
   * Optional: `completion.outcome` remains the richer customer message when
   * a capability has one, and this never replaces it.
   */
  summary?: string;
  /**
   * Where a consumer can send someone to look at it, relative and
   * same-origin. Built server-side, never from a model-composed string.
   */
  href?: string;
}

/**
 * What the confirm route mints once execution has returned. `status` exists
 * only on this type, and only this module can produce one.
 */
export interface ExecutionReceipt extends MutationDescriptor {
  status: "committed";
  capability: string;
  /** The audit row describing the same event, when it could be written. */
  auditId: string | null;
  at: string;
}

const KINDS = new Set<string>(RESOURCE_KINDS);
const OPS = new Set<string>(MUTATION_OPERATIONS);

/**
 * Accept a descriptor only if it is completely well-formed.
 *
 * A malformed one is dropped rather than repaired. A receipt that names the
 * wrong resource is worse than no receipt: the UI refreshes something the
 * customer did not change, and the audit row records a resource that was
 * never touched. Guessing a kind from a nearby string is exactly how that
 * happens, so nothing here guesses.
 */
export function normalizeMutation(raw: unknown): MutationDescriptor | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const resourceType = typeof m.resourceType === "string" ? m.resourceType : "";
  const resourceId = typeof m.resourceId === "string" ? m.resourceId.trim() : "";
  const operation = typeof m.operation === "string" ? m.operation : "";
  if (!KINDS.has(resourceType) || !OPS.has(operation) || !resourceId) return null;

  const changedFields = Array.isArray(m.changedFields)
    ? [...new Set(m.changedFields.filter((f): f is string => typeof f === "string" && f.length > 0 && f.length <= 64))].slice(0, 32)
    : undefined;
  const summary = typeof m.summary === "string" && m.summary.trim() ? m.summary.trim().slice(0, 300) : undefined;
  // Same-origin only. An absolute URL here would become a link a consumer
  // renders, so anything that is not a relative path is dropped.
  const href = typeof m.href === "string" && /^\/(?!\/)/.test(m.href.trim()) ? m.href.trim().slice(0, 512) : undefined;

  return {
    resourceType: resourceType as ResourceKind,
    resourceId,
    operation: operation as MutationOperation,
    ...(changedFields && changedFields.length > 0 ? { changedFields } : {}),
    ...(summary ? { summary } : {}),
    ...(href ? { href } : {}),
  };
}

/**
 * Mint the receipt. Called from ONE place, after execute() returned.
 *
 * It takes the descriptor as a separate argument rather than reading it off
 * a result object, so a caller cannot accidentally mint one from a value
 * that never crossed the boundary.
 */
export function mintReceipt(input: {
  capability: string;
  mutation: MutationDescriptor;
  auditId: string | null;
  at?: Date;
}): ExecutionReceipt {
  return {
    ...input.mutation,
    status: "committed",
    capability: input.capability,
    auditId: input.auditId,
    at: (input.at ?? new Date()).toISOString(),
  };
}

/**
 * The legacy pointer, derived from the descriptor.
 *
 * `ref` predates this contract and the chat UI still routes on it. Deriving
 * it means a capability migrated to `mutation` keeps working for every
 * existing caller without being touched twice, and the two can never
 * disagree about which record was affected.
 */
export function refFromMutation(m: MutationDescriptor): { kind: string; id: string } {
  return { kind: m.resourceType, id: m.resourceId };
}

/**
 * A readonly lookup must never carry a mutation descriptor.
 *
 * Lookups run inline in the chat route with no confirmation, so a
 * descriptor on one would put an unconfirmed "this changed" into the
 * refresh path and the audit trail. The registry already forbids lookups
 * from mutating; this is the same rule expressed in the result.
 */
export function assertNoMutationOnLookup(capabilityName: string, readonly: boolean | undefined, mutation: unknown): void {
  if (readonly && mutation) {
    throw new Error(
      `${capabilityName} is a readonly lookup but returned a mutation descriptor. A lookup must not report having changed anything.`,
    );
  }
}
