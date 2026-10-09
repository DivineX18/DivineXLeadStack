import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyOnboardingToken } from "@/lib/onboarding/token";
import { PLATFORM_CATALOG, divinexAccessEmail, platformByKey } from "@/lib/onboarding/platforms";
import {
  getOnboarding,
  listAccess,
  recordOnboardingEvent,
  refreshCompletion,
  syncOnboardingTags,
} from "@/lib/server/client-onboarding-service";
import {
  CLIENT_SETTABLE_ACCESS_STATES,
  ONBOARDING_SECTION_KEYS,
  type ClientOnboardingDoc,
  type OnboardingSectionKey,
  type PlatformAccessState,
} from "@/types/client-onboarding";

/**
 * THE CLIENT SIDE OF ONBOARDING, reached by invite token only.
 *
 * Everything here is written for someone with no account and no reason to
 * trust us yet. Two rules shape the whole module:
 *
 *   The token proves which onboarding, and nothing else. It is not a session,
 *   it carries no role, and it can never reach another record.
 *
 *   The client sees only their own side. Internal notes, the account owner,
 *   the audit trail and every other client are invisible, because the view
 *   model below simply never contains them. There is no filtering step to
 *   forget.
 */

const ONBOARDINGS = "clientOnboardings";

export type PortalResolution =
  | { ok: true; onboarding: ClientOnboardingDoc }
  | { ok: false; reason: "invalid" | "expired" | "cancelled" };

/**
 * Resolve a token to its onboarding.
 *
 * Three checks, all required: the signature proves we minted it, the hash
 * proves it is the CURRENT one (a rotated invite must die), and the expiry
 * proves it is still live. A signature-only check would leave every
 * previously-emailed link working forever.
 */
export async function resolvePortalToken(token: string): Promise<PortalResolution> {
  const verified = verifyOnboardingToken(token);
  if (!verified) return { ok: false, reason: "invalid" };

  const snap = await getAdminDb().doc(`${ONBOARDINGS}/${verified.onboardingId}`).get();
  if (!snap.exists) return { ok: false, reason: "invalid" };
  const onboarding = { id: snap.id, ...(snap.data() as Omit<ClientOnboardingDoc, "id">) };

  if (onboarding.inviteTokenHash !== verified.hash) return { ok: false, reason: "invalid" };
  if (onboarding.status === "cancelled") return { ok: false, reason: "cancelled" };

  const expiresAt = onboarding.inviteExpiresAt as unknown as { toDate?: () => Date } | Date | null;
  const expiry =
    expiresAt instanceof Date
      ? expiresAt
      : typeof expiresAt?.toDate === "function"
        ? expiresAt.toDate()
        : null;
  if (expiry && expiry.getTime() < Date.now()) return { ok: false, reason: "expired" };

  return { ok: true, onboarding };
}

/* ------------------------------ view model ----------------------------- */

export interface PortalPlatformView {
  key: string;
  label: string;
  instructions: string;
  permissionLevel: string;
  required: boolean;
  state: PlatformAccessState;
  /** True once staff confirmed. The client can see it, not set it. */
  verified: boolean;
}

export interface PortalView {
  businessName: string;
  packageName: string;
  status: ClientOnboardingDoc["status"];
  accessEmail: string;
  sections: OnboardingSectionKey[];
  sectionsComplete: OnboardingSectionKey[];
  intake: Partial<Record<OnboardingSectionKey, Record<string, unknown>>>;
  requiredAssets: string[];
  uploadedAssetKeys: string[];
  platforms: PortalPlatformView[];
  completion: ClientOnboardingDoc["completion"];
  submitted: boolean;
}

/**
 * What the client is allowed to see. Built by naming fields explicitly rather
 * than by stripping an internal object, so a field added to the record later
 * cannot leak by default.
 */
export async function buildPortalView(onboarding: ClientOnboardingDoc): Promise<PortalView> {
  const [access, assetSnap] = await Promise.all([
    listAccess(onboarding.id),
    getAdminDb().collection(`${ONBOARDINGS}/${onboarding.id}/assets`).get(),
  ]);
  const uploadedAssetKeys = [
    ...new Set(assetSnap.docs.map((d) => String(d.data().key ?? ""))),
  ].filter(Boolean);

  const platforms: PortalPlatformView[] = access
    .filter((a) => a.state !== "not_required")
    .map((a) => {
      const def = platformByKey(a.key);
      return {
        key: a.key,
        label: def?.label ?? a.key,
        instructions: def?.instructions ?? "",
        permissionLevel: a.permissionLevel,
        required: a.required,
        state: a.state,
        verified: a.state === "verified",
      };
    });

  return {
    businessName: onboarding.businessName,
    packageName: onboarding.package.name,
    status: onboarding.status,
    accessEmail: divinexAccessEmail(),
    sections: onboarding.package.intakeSections ?? [],
    sectionsComplete: onboarding.intakeSectionsComplete ?? [],
    intake: onboarding.intake ?? {},
    requiredAssets: onboarding.package.requiredAssets ?? [],
    uploadedAssetKeys,
    platforms,
    completion: onboarding.completion,
    submitted: !!onboarding.intakeSubmittedAt,
  };
}

/* -------------------------------- writes ------------------------------- */

/** Values are capped and coerced: this is unauthenticated input. */
function sanitiseAnswers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (!/^[A-Za-z0-9_]{1,60}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 5000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) {
      out[k] = v.filter((x) => typeof x === "string").slice(0, 40).map((x) => String(x).slice(0, 500));
    }
  }
  return out;
}

export async function savePortalSection(opts: {
  onboarding: ClientOnboardingDoc;
  section: string;
  answers: unknown;
  markComplete: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const section = opts.section as OnboardingSectionKey;
  if (!(ONBOARDING_SECTION_KEYS as readonly string[]).includes(section)) {
    return { ok: false, error: "Unknown section." };
  }
  // A package that never asked for social must not accept a social section.
  if (!(opts.onboarding.package.intakeSections ?? []).includes(section)) {
    return { ok: false, error: "That section is not part of this onboarding." };
  }
  if (opts.onboarding.status === "paused" || opts.onboarding.status === "cancelled") {
    return { ok: false, error: "This onboarding is not accepting changes right now." };
  }

  const complete = new Set(opts.onboarding.intakeSectionsComplete ?? []);
  if (opts.markComplete) complete.add(section);
  else complete.delete(section);

  await getAdminDb().doc(`${ONBOARDINGS}/${opts.onboarding.id}`).update({
    [`intake.${section}`]: sanitiseAnswers(opts.answers),
    intakeSectionsComplete: [...complete],
    // The first client action moves a draft forward. A paused or blocked
    // record keeps its status: only staff clear those.
    ...(opts.onboarding.status === "draft" || opts.onboarding.status === "invited"
      ? { status: "in_progress" }
      : {}),
    lastClientActivityAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const fresh = await getOnboarding(opts.onboarding.agencyId, opts.onboarding.id);
  if (fresh) await refreshCompletion(fresh);

  await recordOnboardingEvent({
    onboardingId: opts.onboarding.id,
    agencyId: opts.onboarding.agencyId,
    type: "onboarding.intake.section_saved",
    actor: "client",
    detail: `Section "${section}" saved${opts.markComplete ? " and marked complete" : ""}.`,
  });
  return { ok: true };
}

export async function submitPortalIntake(
  onboarding: ClientOnboardingDoc,
): Promise<{ ok: boolean; error?: string }> {
  const required = onboarding.package.intakeSections ?? [];
  const done = new Set(onboarding.intakeSectionsComplete ?? []);
  const missing = required.filter((s) => !done.has(s));
  if (missing.length > 0) {
    return { ok: false, error: `Still to finish: ${missing.join(", ")}.` };
  }
  await getAdminDb().doc(`${ONBOARDINGS}/${onboarding.id}`).update({
    intakeSubmittedAt: FieldValue.serverTimestamp(),
    lastClientActivityAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await syncOnboardingTags(onboarding.id, onboarding.agencyId);
  await recordOnboardingEvent({
    onboardingId: onboarding.id,
    agencyId: onboarding.agencyId,
    type: "onboarding.intake.submitted",
    actor: "client",
    detail: "Client submitted their intake.",
  });
  return { ok: true };
}

/**
 * The client reports that they sent an invitation.
 *
 * THIS CAN NEVER REACH `verified`. Self-reporting and confirmed access fail in
 * completely different ways: "I sent it" can be wrong about the address, the
 * permission level, or the asset, and only someone who has actually opened the
 * account knows. Allowing the client to set verified would make the readiness
 * dashboard lie, which is worse than having no dashboard.
 */
export async function clientSetAccessState(opts: {
  onboarding: ClientOnboardingDoc;
  key: string;
  state: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!CLIENT_SETTABLE_ACCESS_STATES.includes(opts.state as PlatformAccessState)) {
    return { ok: false, error: "Our team confirms access once the invitation arrives." };
  }
  const ref = getAdminDb().doc(`${ONBOARDINGS}/${opts.onboarding.id}/platformAccess/${opts.key}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "That platform is not part of this onboarding." };

  await ref.update({
    state: opts.state,
    ...(opts.state === "invited_by_client" ? { invitedAt: FieldValue.serverTimestamp() } : {}),
    ...(typeof opts.note === "string" ? { note: opts.note.slice(0, 500) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await getAdminDb().doc(`${ONBOARDINGS}/${opts.onboarding.id}`).update({
    lastClientActivityAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const fresh = await getOnboarding(opts.onboarding.agencyId, opts.onboarding.id);
  if (fresh) await refreshCompletion(fresh);

  await recordOnboardingEvent({
    onboardingId: opts.onboarding.id,
    agencyId: opts.onboarding.agencyId,
    type: "onboarding.access.updated",
    actor: "client",
    detail: `Client set ${opts.key} to ${opts.state}.`,
  });
  return { ok: true };
}

export { PLATFORM_CATALOG };
