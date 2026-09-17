import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { phoneIdentity, suppressionKey, toE164 } from "@/lib/comms/phone-identity";
import type { Contact } from "@/types/contacts";

/**
 * SUPPRESSION BELONGS TO THE TENANT AND THE PHONE LINE, NOT TO A CONTACT ROW.
 *
 * `contact.smsOptedOut` was the only record that someone had said STOP, which
 * made permission to text them an accident of how a document happened to look.
 * Delete the contact and re-import the CSV, and they are sendable again. Import
 * the same person a second time with different formatting, and the duplicate is
 * sendable. Reformat the number, and the flag still says opted-out while the
 * new row says nothing at all. None of that is a decision anyone made; it is
 * the storage model leaking into a consent question.
 *
 * So the authoritative record is a document keyed by workspace + E.164 line, in
 * `subAccounts/{id}/smsSuppression/{digits}`, which no contact operation can
 * disturb: creating, duplicating, reformatting, deleting and re-importing a
 * contact all leave it exactly where it is. `contact.smsOptedOut` stays as the
 * mirror the UI reads, and is kept in step best-effort, but it is no longer
 * what decides whether a message goes out.
 *
 * Scoped per sub-account on purpose. A STOP is a statement to one business, not
 * a global blocklist across every tenant that happens to hold the same number.
 */

/** Where the opt-out came from. Kept for the audit trail, never inferred. */
export type SmsSuppressionSource =
  /** An inbound STOP-family keyword from the recipient themselves. */
  | "inbound_keyword"
  /** A workspace operator suppressed the contact by hand. */
  | "operator";

export interface SmsSuppressionRecord {
  e164: string;
  subAccountId: string;
  suppressed: boolean;
  source: SmsSuppressionSource;
  /** The exact keyword, when a recipient sent one. */
  keyword: string | null;
  actorUid: string | null;
  suppressedAt: FirebaseFirestore.Timestamp | FieldValue | null;
  /** Set when a later explicit re-subscribe lifted it. History is kept. */
  liftedAt: FirebaseFirestore.Timestamp | FieldValue | null;
  liftedSource: SmsSuppressionSource | null;
  liftedKeyword: string | null;
  /** Every transition, appended, never rewritten. */
  history: {
    action: "suppressed" | "lifted";
    source: SmsSuppressionSource;
    keyword: string | null;
    actorUid: string | null;
    at: string;
  }[];
}

function suppressionRef(subAccountId: string, e164: string) {
  return getAdminDb()
    .doc(`subAccounts/${subAccountId}/smsSuppression/${suppressionKey(e164)}`);
}

/**
 * Record that this line must not be texted by this workspace.
 *
 * Idempotent, and additive: re-suppressing an already-suppressed line appends
 * to the history rather than overwriting when or why it first happened.
 */
export async function suppressSms(opts: {
  subAccountId: string;
  e164: string;
  source: SmsSuppressionSource;
  keyword?: string | null;
  actorUid?: string | null;
}): Promise<void> {
  const ref = suppressionRef(opts.subAccountId, opts.e164);
  const entry = {
    action: "suppressed" as const,
    source: opts.source,
    keyword: opts.keyword ?? null,
    actorUid: opts.actorUid ?? null,
    at: new Date().toISOString(),
  };
  await ref.set(
    {
      e164: opts.e164,
      subAccountId: opts.subAccountId,
      suppressed: true,
      source: opts.source,
      keyword: opts.keyword ?? null,
      actorUid: opts.actorUid ?? null,
      suppressedAt: FieldValue.serverTimestamp(),
      liftedAt: null,
      liftedSource: null,
      liftedKeyword: null,
      history: FieldValue.arrayUnion(entry),
    },
    { merge: true },
  );
}

/**
 * Lift a suppression after an explicit re-subscribe.
 *
 * The document is NOT deleted: the original opt-out, when it happened and what
 * word caused it stay readable, because "they opted out and later opted back
 * in" and "they never opted out" are different facts and only one of them is
 * defensible in a dispute.
 */
export async function liftSmsSuppression(opts: {
  subAccountId: string;
  e164: string;
  source: SmsSuppressionSource;
  keyword?: string | null;
  actorUid?: string | null;
}): Promise<void> {
  const ref = suppressionRef(opts.subAccountId, opts.e164);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.set(
    {
      suppressed: false,
      liftedAt: FieldValue.serverTimestamp(),
      liftedSource: opts.source,
      liftedKeyword: opts.keyword ?? null,
      history: FieldValue.arrayUnion({
        action: "lifted" as const,
        source: opts.source,
        keyword: opts.keyword ?? null,
        actorUid: opts.actorUid ?? null,
        at: new Date().toISOString(),
      }),
    },
    { merge: true },
  );
}

export async function isSmsSuppressed(subAccountId: string, e164: string): Promise<boolean> {
  const snap = await suppressionRef(subAccountId, e164).get();
  return snap.exists && (snap.data() as SmsSuppressionRecord).suppressed === true;
}

/* ─────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * THREE SEPARATE FACTS, NEVER COLLAPSED INTO ONE.
 *
 * A contact HAVING a phone number is not consent to text it. A consent record
 * EXISTING is not the same as consent having been given. And neither is the
 * same as whether the line is currently suppressed. The old model had only the
 * last of the three, so ten contact-creation paths wrote `smsOptedOut: false`
 * and every one of them read as "this person agreed to receive texts".
 */
export type SmsConsentState =
  /** They ticked a disclosure box and we kept the evidence. */
  | "recorded"
  /** They were shown a disclosure box and did not tick it. */
  | "declined"
  /** No evidence either way. Most existing contacts are here. */
  | "unknown";

export function smsConsentState(contact: Pick<Contact, "smsConsent"> | null | undefined): SmsConsentState {
  const c = contact?.smsConsent;
  if (!c) return "unknown";
  return c.consented === true ? "recorded" : "declined";
}

export type SmsBlockReason =
  | "invalid_phone"
  | "suppressed"
  | "contact_opted_out"
  | "consent_declined"
  | "consent_unknown"
  | "attestation_required";

export type SmsGateResult =
  | { allowed: true; e164: string; consent: SmsConsentState; basis: SmsSendBasis }
  | { allowed: false; reason: SmsBlockReason; detail: string; consent: SmsConsentState };

/** What authorised a send, recorded on the audit row. */
export type SmsSendBasis =
  /** The recipient's own recorded consent. */
  | "recipient_consent"
  /** The recipient initiated this exchange (inbound SMS or call). */
  | "recipient_initiated";

/**
 * WHO DECIDED TO SEND THIS, AND ON WHAT EVIDENCE.
 *
 * Three postures, because three genuinely different things are happening and
 * collapsing them into one boolean lost the distinction that matters:
 *
 *   automated  — the system decided. Only the recipient's own recorded
 *                consent can justify that, so "unknown" is refused.
 *   manual     — a named operator is typing to one person. Recorded consent
 *                is best; absent it, the operator must affirm once that they
 *                have permission, and that affirmation is stored as theirs.
 *   responsive — the recipient just texted or rang us. Their own action is
 *                the invitation, so no prior record is demanded.
 *
 * Suppression outranks all three. It is checked before any of them.
 */
export type SmsSendPosture = "automated" | "manual" | "responsive";

export async function checkSmsSendAllowed(opts: {
  subAccountId: string;
  to: string | null | undefined;
  contact?: Pick<Contact, "smsOptedOut" | "smsConsent"> | null;
  posture: SmsSendPosture;
}): Promise<SmsGateResult> {
  const consent = smsConsentState(opts.contact);

  const identity = toE164(opts.to);
  if (!identity.ok) {
    return {
      allowed: false,
      reason: "invalid_phone",
      detail:
        identity.reason === "ambiguous_country"
          ? "This number needs a country code before it can be texted. Enter it in full, for example +1 415 555 2671."
          : "This doesn't look like a real phone number. Check it and try again, including the country code, for example +1 415 555 2671.",
      consent,
    };
  }

  if (opts.contact?.smsOptedOut === true) {
    return { allowed: false, reason: "contact_opted_out", detail: "this contact is marked opted out of SMS", consent };
  }

  if (await isSmsSuppressed(opts.subAccountId, identity.e164)) {
    return { allowed: false, reason: "suppressed", detail: "this number has opted out of SMS from this workspace", consent };
  }

  // A recipient who was shown the disclosure and did not tick it has answered
  // the question. The one exception is a message they themselves triggered:
  // refusing to answer someone who just texted you is not a kindness, and
  // their inbound is a fresh act, not the one they declined.
  if (consent === "declined" && opts.posture !== "responsive") {
    return {
      allowed: false,
      reason: "consent_declined",
      detail: "this contact was asked for SMS consent and declined, so they are not messaged",
      consent,
    };
  }

  if (consent === "recorded") {
    return { allowed: true, e164: identity.e164, consent, basis: "recipient_consent" };
  }
  if (opts.posture === "responsive") {
    return { allowed: true, e164: identity.e164, consent, basis: "recipient_initiated" };
  }
  if (opts.posture === "automated") {
    return {
      allowed: false,
      reason: "consent_unknown",
      detail: "no SMS consent is recorded for this contact, so automated messages are not sent to them",
      consent,
    };
  }

  // Manual, unknown consent. Refused for now; the operator-attestation path
  // that lets a named human vouch for permission lands next.
  return {
    allowed: false,
    reason: "attestation_required",
    detail: "no SMS consent is recorded for this number. Confirm you have permission to text them before sending.",
    consent,
  };
}

/** Thrown by the transport when a send is refused. Carries the machine reason. */
export class SmsSuppressedError extends Error {
  readonly reason: SmsBlockReason;
  constructor(result: Extract<SmsGateResult, { allowed: false }>) {
    super(result.detail);
    this.name = "SmsSuppressedError";
    this.reason = result.reason;
  }
}

/**
 * Every contact in a workspace whose stored phone names this line.
 *
 * Matches the canonical `phoneE164` first, then the raw `phone` for contacts
 * written before that field existed. Scoped to one sub-account and NOT capped:
 * the previous `.limit(5)` meant a number appearing on a sixth contact row
 * stayed sendable after its owner had said STOP.
 */
export async function findContactsByPhoneIdentity(
  subAccountId: string,
  e164: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const db = getAdminDb();
  const [canonical, legacy] = await Promise.all([
    db.collection("contacts").where("subAccountId", "==", subAccountId).where("phoneE164", "==", e164).get(),
    db.collection("contacts").where("subAccountId", "==", subAccountId).where("phone", "==", e164).get(),
  ]);
  const seen = new Set<string>();
  const out: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const d of [...canonical.docs, ...legacy.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/**
 * The canonical identity to stamp on a contact at write time, when there is
 * one. Additive: `phone` keeps exactly what the operator or lead typed, so no
 * display value is rewritten and nothing is lost.
 */
export function phoneE164Field(rawPhone: string | null | undefined): { phoneE164: string | null } {
  return { phoneE164: phoneIdentity(rawPhone) };
}
