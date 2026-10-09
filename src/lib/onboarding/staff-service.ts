import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail } from "@/lib/comms/resend";
import {
  getOnboarding,
  recordOnboardingEvent,
  refreshCompletion,
} from "@/lib/server/client-onboarding-service";
import type { ClientOnboardingDoc, PlatformAccessState } from "@/types/client-onboarding";

/**
 * The staff side: the things a client is structurally unable to do.
 *
 * The important one is access verification. Everywhere else in this feature
 * the client can move their own state forward, because they are the only one
 * who knows. Verification is the exception, because they are NOT the only one
 * who knows: whether we can actually open the account is something only we can
 * answer, and a dashboard that reports readiness on the client's word is a
 * dashboard that will send someone into a build they cannot start.
 */

const ONBOARDINGS = "clientOnboardings";

export async function staffSetAccessState(opts: {
  agencyId: string;
  onboardingId: string;
  key: string;
  state: PlatformAccessState;
  note?: string | null;
  actorUid: string;
}): Promise<{ ok: boolean; error?: string }> {
  const onboarding = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (!onboarding) return { ok: false, error: "That onboarding no longer exists." };

  const ref = getAdminDb().doc(`${ONBOARDINGS}/${opts.onboardingId}/platformAccess/${opts.key}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "That platform is not part of this onboarding." };

  await ref.update({
    state: opts.state,
    // Who confirmed it, kept forever. "Verified" with nobody's name against
    // it is how a stalled build gets blamed on the client.
    ...(opts.state === "verified"
      ? { verifiedAt: FieldValue.serverTimestamp(), verifiedByUid: opts.actorUid }
      : { verifiedAt: null, verifiedByUid: null }),
    ...(opts.note !== undefined ? { note: opts.note?.slice(0, 500) ?? null } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const fresh = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (fresh) await refreshCompletion(fresh);

  await recordOnboardingEvent({
    onboardingId: opts.onboardingId,
    agencyId: opts.agencyId,
    type: opts.state === "verified" ? "onboarding.access.verified" : "onboarding.access.updated",
    actor: opts.actorUid,
    detail: `${opts.key} set to ${opts.state}.`,
  });
  return { ok: true };
}

/* --------------------------- notifications ----------------------------- */

export type OnboardingNotification =
  | "enrolled"
  | "intake_submitted"
  | "assets_received"
  | "access_ready_to_verify"
  | "access_all_verified"
  | "blocked"
  | "no_response"
  | "ready_for_production";

const SUBJECTS: Record<OnboardingNotification, (name: string) => string> = {
  enrolled: (n) => `Onboarding started: ${n}`,
  intake_submitted: (n) => `${n} submitted their intake`,
  assets_received: (n) => `New assets from ${n}`,
  access_ready_to_verify: (n) => `${n} says access is sent, please verify`,
  access_all_verified: (n) => `All access verified for ${n}`,
  blocked: (n) => `Onboarding blocked: ${n}`,
  no_response: (n) => `${n} has gone quiet`,
  ready_for_production: (n) => `${n} is ready for production`,
};

/**
 * Tell the account owner something happened, with a link straight to the
 * record. Best-effort: a notification that fails must never roll back the
 * thing it was describing.
 */
export async function notifyAccountOwner(opts: {
  onboarding: ClientOnboardingDoc;
  kind: OnboardingNotification;
  detail?: string;
}): Promise<void> {
  try {
    const db = getAdminDb();
    const ownerSnap = await db.doc(`users/${opts.onboarding.accountOwnerUid}`).get();
    const email = (ownerSnap.data()?.email as string | undefined)?.trim();
    if (!email) return;

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    const link = `${base}/app/command-center/onboarding/${opts.onboarding.id}`;
    const subject = SUBJECTS[opts.kind](opts.onboarding.businessName);
    const body =
      `${subject}\n\n` +
      `${opts.detail ? `${opts.detail}\n\n` : ""}` +
      `Package: ${opts.onboarding.package.name}\n` +
      `Progress: ${opts.onboarding.completion.overallPct}%\n\n` +
      `Open it: ${link}\n`;

    // "essential": this is internal operational notification to our own
    // staff, not customer marketing, so it must never be metered or blocked
    // by a workspace's monthly allowance.
    await sendEmail({ to: email, subject, text: body, billing: { kind: "essential" } });
  } catch (err) {
    console.error("[onboarding] owner notification failed", err);
  }
}

/** Staff note on the record. Internal, never shown to the client. */
export async function addInternalNote(opts: {
  agencyId: string;
  onboardingId: string;
  note: string;
  actorUid: string;
}): Promise<boolean> {
  const onboarding = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (!onboarding) return false;
  await recordOnboardingEvent({
    onboardingId: opts.onboardingId,
    agencyId: opts.agencyId,
    type: "onboarding.access.updated",
    actor: opts.actorUid,
    detail: `Note: ${opts.note.slice(0, 400)}`,
  });
  return true;
}
