import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { WebhookEventType } from "@/types/webhooks";

/**
 * NATIVE CONVERSION DETECTION — canonical lifecycle states, established by
 * the events that actually PROVE them (the automation equivalent of the
 * copy no-fabrication rule: never infer a stronger lifecycle state than
 * the event proves).
 *
 * Rides the existing outbound-webhook event stream as an internal consumer
 * (the exact pattern lib/push/events.ts uses): every state-proving event —
 * a verified booking, a completed payment, an inbound reply, a won deal —
 * automatically applies its canonical tag to the contact. Because the
 * Automation Strategy Engine's composed workflows gate every touch on a
 * goal tag (has_tag → GOAL/end), this closes the loop with zero operator
 * action:
 *
 *   real-world event → Flow detects it → contact state changes →
 *   running automations react (exit/suppress) automatically
 *
 * The operator can still tag manually (goal reached over the phone, etc.) —
 * this layer just removes "remember to tag them" from the happy paths.
 *
 * WHAT EACH EVENT PROVES (deliberately conservative):
 *   booking.created        → a real appointment exists            → "booked"
 *   funnel.order.completed → payment cleared (Stripe webhook)     → "purchased"
 *   funnel.upsell.accepted → additional payment cleared           → "purchased"
 *   community.purchase.paid→ payment cleared                      → "purchased"
 *   quote.paid             → operator confirmed payment received  → "purchased"
 *   quote.accepted         → recipient accepted (NOT yet paid)    → "accepted"
 *   message.received       → the contact replied on some channel  → "replied"
 *   deal.won               → operator declared the deal won       → "won"
 *   booking.cancelled      → the booking no longer stands         → removes
 *                            "booked", adds "booking-cancelled"
 *                            (the recovery-journey signal)
 *
 * NOT mapped, on purpose: form.submitted (proves details were submitted —
 * intent, not conversion), quote.viewed/sent, contact.created, and every
 * other informational event. A donation/purchase funnel's form submission
 * must never mint "purchased" — only the payment event may.
 */

/** Tags this layer applies automatically. The Automation Strategy Engine
 *  prompts the model to prefer these as goal_tag so sequence exits fire
 *  with zero operator action. */
export const CANONICAL_GOAL_TAGS = ["booked", "purchased", "replied", "accepted", "won"] as const;

const EVENT_STATE_MAP: Partial<Record<WebhookEventType, { add?: string; remove?: string }>> = {
  "booking.created": { add: "booked" },
  "funnel.order.completed": { add: "purchased" },
  "funnel.upsell.accepted": { add: "purchased" },
  "community.purchase.paid": { add: "purchased" },
  "quote.paid": { add: "purchased" },
  "quote.accepted": { add: "accepted" },
  "message.received": { add: "replied" },
  "deal.won": { add: "won" },
  "booking.cancelled": { add: "booking-cancelled", remove: "booked" },
};

/** Payloads across emit sites carry contact identity in a handful of
 *  shapes — resolve leniently, return null (no-op) when absent. */
function resolveContactId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct = p.contactId ?? p.contact_id;
  if (typeof direct === "string" && direct) return direct;
  for (const key of ["contact", "message", "deal", "order", "event", "booking", "quote", "submission"]) {
    const nested = p[key];
    if (nested && typeof nested === "object") {
      const n = nested as Record<string, unknown>;
      const id = n.contact_id ?? n.contactId ?? (key === "contact" ? n.id : undefined);
      if (typeof id === "string" && id) return id;
    }
  }
  return null;
}

/**
 * Internal event-stream consumer — called from emitWebhookEvent for live
 * events (before the no-subscribers early return, like push). Self-guarded
 * fire-and-forget: swallows its own errors, no-ops on unmapped events or
 * unresolvable/foreign contacts.
 */
export async function applyLifecycleStateForEvent(input: {
  subAccountId: string;
  type: WebhookEventType;
  payload: unknown;
}): Promise<void> {
  try {
    const mapping = EVENT_STATE_MAP[input.type];
    if (!mapping) return;
    const contactId = resolveContactId(input.payload);
    if (!contactId) return;

    const ref = getAdminDb().doc(`contacts/${contactId}`);
    const snap = await ref.get();
    // Tenancy guard: never cross-tag a contact outside the event's own
    // sub-account (a forged/foreign id in a payload must be inert).
    if (!snap.exists || snap.data()!.subAccountId !== input.subAccountId) return;

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (mapping.add) {
      update.tags = FieldValue.arrayUnion(mapping.add);
      // Timestamped state record — richer than the tag alone, foundation
      // for time-anchored journeys ("no-show recovery 24h after cancel").
      update[`lifecycleStates.${mapping.add.replace(/[^a-z0-9-]/g, "")}At`] = FieldValue.serverTimestamp();
    }
    await ref.update(update);
    if (mapping.remove) {
      await ref.update({ tags: FieldValue.arrayRemove(mapping.remove) });
    }
  } catch {
    // Fire-and-forget — lifecycle tagging must never break the emitting write.
  }
  // WEBINAR REGISTRATION (Lifecycle State Engine): a form submission on a
  // webinar-genre funnel IS the real registration event — seed the
  // per-registrant lifecycle record. "scheduled" when the funnel carries a
  // real event time; bare "registered" otherwise. Attendance is NEVER
  // inferred — attended/missed require explicit evidence via the
  // transition route; an unresolved webinar stays scheduled.
  try {
    if (input.type === "form.submitted") {
      const contactId = resolveContactId(input.payload);
      const formId =
        (input.payload as { submission?: { form_id?: string }; form?: { id?: string } } | null)?.submission?.form_id ??
        (input.payload as { form?: { id?: string } } | null)?.form?.id ??
        null;
      if (contactId && formId) {
        const db = getAdminDb();
        const funnels = await db
          .collection("funnels")
          .where("subAccountId", "==", input.subAccountId)
          .where("genre", "==", "webinar")
          .get();
        const webinar = funnels.docs.find((d) =>
          ((d.data().sections ?? []) as { config?: { formId?: string } }[]).some((s2) => s2.config?.formId === formId),
        );
        if (webinar) {
          const { transitionLifecycleState } = await import("@/lib/lifecycle/engine");
          const agencyId = (webinar.data().agencyId as string) ?? "";
          await transitionLifecycleState({
            subAccountId: input.subAccountId,
            agencyId,
            domain: "webinar",
            entityId: webinar.id,
            contactId,
            to: webinar.data().eventStartAt ? "scheduled" : "registered",
            reason: "webinar.registered",
          }).catch(() => {});
        }
      }
    }
  } catch {
    // Same fire-and-forget contract.
  }
}
