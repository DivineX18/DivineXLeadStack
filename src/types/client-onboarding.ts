import type { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * CLIENT ONBOARDING — the DIVINEX managed-services intake pipeline.
 *
 * An onboarding record is an ENGAGEMENT, not a workspace. A prospect who pays
 * and then goes quiet should leave a CRM contact and a stalled onboarding
 * record behind, not an empty Flow workspace with its own billing, rules and
 * sidebar. So `subAccountId` stays null until Ready for Production, and the
 * workspace is created once, at handoff (see PHASE 7).
 *
 * Everything else here is a thin record over infrastructure that already
 * exists: contacts, tasks, workflows, Resend, Firebase Storage. This file
 * adds the shape of the engagement, not a second CRM.
 */

/* ------------------------------ packages ------------------------------- */

/**
 * What a client bought, and therefore what we need from them.
 *
 * PRICE NEVER DRIVES LOGIC. It is recorded for display and reconciliation
 * only. Eligibility is decided by `stripePriceIds` (an explicit allowlist) and
 * by the operator picking a package by hand, never by an amount or a product
 * name, because an amount can collide across unrelated products and a name can
 * be edited in the Stripe dashboard by someone who has no idea it is load
 * bearing.
 */
export interface OnboardingPackageDoc {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  /** Display and reconciliation only. Custom-priced packages carry null. */
  priceCents: number | null;
  currency: string;
  active: boolean;
  /** Explicit allowlist. A price absent from every package enrolls nobody. */
  stripePriceIds: string[];
  /** Which portal sections this package asks for. */
  intakeSections: OnboardingSectionKey[];
  requiredAssets: string[];
  requiredPlatforms: OnboardingPlatformRequirement[];
  /** Seeds the production task list at handoff. */
  productionChecklist: string[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const ONBOARDING_SECTION_KEYS = [
  "business",
  "brand",
  "website",
  "marketing",
  "social",
] as const;
export type OnboardingSectionKey = (typeof ONBOARDING_SECTION_KEYS)[number];

export interface OnboardingPlatformRequirement {
  /** Stable key, e.g. "ga4". Matches a PLATFORM_CATALOG entry. */
  key: string;
  /** Least privilege for the work, e.g. "Editor", not "Administrator". */
  permissionLevel: string;
  required: boolean;
}

/* ----------------------------- the record ------------------------------ */

export const ONBOARDING_STATUSES = [
  "draft",
  "invited",
  "in_progress",
  "blocked",
  "ready_for_production",
  "completed",
  "paused",
  "cancelled",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type OnboardingSource = "manual" | "stripe";

/**
 * The package AS SOLD, copied onto the record at enrollment.
 *
 * Client Billing already learned this one: editing a plan must not rewrite
 * what a past client was sold. A requirement added to a package next month
 * cannot retroactively make a finished onboarding incomplete.
 */
export interface OnboardingPackageSnapshot {
  packageId: string;
  name: string;
  slug: string;
  priceCents: number | null;
  currency: string;
  intakeSections: OnboardingSectionKey[];
  requiredAssets: string[];
  requiredPlatforms: OnboardingPlatformRequirement[];
  productionChecklist: string[];
}

export interface OnboardingStripeRefs {
  /** The event that enrolled them, for reconciliation. */
  eventId?: string | null;
  checkoutSessionId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
}

export interface OnboardingCompletion {
  intakePct: number;
  assetsPct: number;
  accessPct: number;
  /** The single number the dashboard sorts on. */
  overallPct: number;
}

export interface ClientOnboardingDoc {
  id: string;
  agencyId: string;
  /** NULL until handoff. See the module note: no workspace before it is real. */
  subAccountId: string | null;
  /** The CRM record. Created at enrollment, in the DIVINEX workspace. */
  contactId: string;
  businessName: string;
  contactEmail: string;
  websiteUrl: string | null;
  notes: string | null;

  packageId: string;
  package: OnboardingPackageSnapshot;

  status: OnboardingStatus;
  accountOwnerUid: string;
  source: OnboardingSource;
  stripe: OnboardingStripeRefs | null;

  /** Only the SHA-256 of the live invite token is ever stored. */
  inviteTokenHash: string | null;
  /** A plain Date is written here; Firestore stores it as a Timestamp. */
  inviteExpiresAt: Timestamp | FieldValue | Date | null;

  /** Answers, keyed by section. Saved per section as the client types. */
  intake: Partial<Record<OnboardingSectionKey, Record<string, unknown>>>;
  /** Sections the client has explicitly marked done. */
  intakeSectionsComplete: OnboardingSectionKey[];
  intakeSubmittedAt: Timestamp | FieldValue | null;

  completion: OnboardingCompletion;

  /** Why it is blocked, shown to staff only. Never to the client. */
  blockedReason: string | null;

  lastClientActivityAt: Timestamp | FieldValue | null;
  lastReminderAt: Timestamp | FieldValue | null;
  readyForProductionAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  createdByUid: string;
}

/* ------------------------------- assets -------------------------------- */

export interface OnboardingAssetDoc {
  id: string;
  /** Which requirement this satisfies, e.g. "logo". */
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Firebase Storage object path. Never public; served via signed URL. */
  storagePath: string;
  uploadedAt: Timestamp | FieldValue | null;
  /** "client" when uploaded through the portal token. */
  uploadedBy: string;
}

/* --------------------------- platform access --------------------------- */

/**
 * CLIENT SELF-REPORTING IS NOT VERIFICATION.
 *
 * A client can move a platform as far as `invited_by_client`. Only an
 * authenticated staff member can write `verified`, and the record keeps who
 * did it. The difference matters: "I sent the invite" and "we are actually in
 * the account" fail in completely different ways, and only the second one
 * means work can start.
 */
export const PLATFORM_ACCESS_STATES = [
  "not_required",
  "not_invited",
  "invited_by_client",
  "awaiting_acceptance",
  "verified",
  "blocked",
] as const;
export type PlatformAccessState = (typeof PLATFORM_ACCESS_STATES)[number];

/** The states a client is allowed to set on their own. */
export const CLIENT_SETTABLE_ACCESS_STATES: PlatformAccessState[] = [
  "not_invited",
  "invited_by_client",
];

export interface OnboardingPlatformAccessDoc {
  /** Doc id = the platform key. */
  key: string;
  state: PlatformAccessState;
  permissionLevel: string;
  required: boolean;
  invitedAt: Timestamp | FieldValue | null;
  verifiedAt: Timestamp | FieldValue | null;
  /** Who confirmed we are actually in. Never a client. */
  verifiedByUid: string | null;
  note: string | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* ------------------------------- audit --------------------------------- */

export const ONBOARDING_EVENT_TYPES = [
  "onboarding.created",
  "onboarding.invited",
  "onboarding.intake.section_saved",
  "onboarding.intake.submitted",
  "onboarding.asset.uploaded",
  "onboarding.access.updated",
  "onboarding.access.verified",
  "onboarding.blocked",
  "onboarding.paused",
  "onboarding.resumed",
  "onboarding.cancelled",
  "onboarding.ready_for_production",
  "onboarding.completed",
  "onboarding.reminder_sent",
] as const;
export type OnboardingEventType = (typeof ONBOARDING_EVENT_TYPES)[number];

export interface OnboardingEventDoc {
  id: string;
  onboardingId: string;
  agencyId: string;
  type: OnboardingEventType;
  /** Uid, or "client" for a token-authenticated portal action. */
  actor: string;
  detail: string;
  createdAt: Timestamp | FieldValue | null;
}
