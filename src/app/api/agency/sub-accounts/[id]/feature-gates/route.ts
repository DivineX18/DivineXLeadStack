import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { metaAppConfigured } from "@/lib/comms/meta";
import {
  applyFeatureGates,
  type AgencyGateField,
} from "@/lib/server/feature-gates-service";

/**
 * Agency-only feature gates per sub-account. Each gate is a boolean toggle
 * the agency owner controls. The payload is shaped as an object so
 * gates can be set independently (only the fields you send get applied)
 * or together in one round-trip from the Manage dialog.
 *
 * Today's gates:
 *   - `emailDomainEnabled` — dedicated Resend sending domain. Disabling
 *     tears down the verified domain (frees the Resend slot) and clears
 *     `resendConfig` so sends fall back to EMAIL_FROM immediately.
 *   - `apiAccessEnabled` — the public API (v1). Disabling 403s every
 *     `/api/v1/*` request and blocks new key / webhook mints, but
 *     PRESERVES existing keys + subscriptions so re-enabling resumes
 *     them instantly (no painful re-rotation of Zapier integrations).
 *   - `metaInboxEnabled` — BETA master switch for the Facebook Messenger +
 *     Instagram DM inbox channels. Pure toggle today (no consumer slices
 *     yet) so the feature stays inert + invisible while off.
 *
 * Auth: agency owner only (requireSubAccountMember + role check). Sub-account
 * admins can NOT flip their own gates — the whole point is that the agency
 * controls what its tenants can do.
 */

interface PatchBody {
  emailDomainEnabled?: boolean;
  apiAccessEnabled?: boolean;
  broadcastsEnabled?: boolean;
  outboundVoiceEnabled?: boolean;
  whatsappEnabled?: boolean;
  metaInboxEnabled?: boolean;
  websiteEnabled?: boolean;
  socialPlannerEnabled?: boolean;
  communityEnabled?: boolean;
  missedCallTextBackEnabled?: boolean;
  aiSuiteEnabled?: boolean;
  getLeadsEnabled?: boolean;
  // "Hide instead of lock" overrides for the sidebar-gated features.
  // Only take effect while the matching gate is off. See `*HiddenWhenDisabled`
  // on SubAccountDoc.
  broadcastsHiddenWhenDisabled?: boolean;
  websiteHiddenWhenDisabled?: boolean;
  socialPlannerHiddenWhenDisabled?: boolean;
  communityHiddenWhenDisabled?: boolean;
  getLeadsHiddenWhenDisabled?: boolean;
  aiSuiteHiddenWhenDisabled?: boolean;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (access.subAccountRole !== "agencyOwner") {
    return NextResponse.json(
      { error: "Agency owner only" },
      { status: 403 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wantsEmail = typeof body.emailDomainEnabled === "boolean";
  const wantsApi = typeof body.apiAccessEnabled === "boolean";
  const wantsBroadcasts = typeof body.broadcastsEnabled === "boolean";
  const wantsOutboundVoice = typeof body.outboundVoiceEnabled === "boolean";
  const wantsWhatsapp = typeof body.whatsappEnabled === "boolean";
  const wantsMetaInbox = typeof body.metaInboxEnabled === "boolean";
  const wantsWebsite = typeof body.websiteEnabled === "boolean";
  const wantsSocialPlanner = typeof body.socialPlannerEnabled === "boolean";
  const wantsCommunity = typeof body.communityEnabled === "boolean";
  const wantsMissedCall = typeof body.missedCallTextBackEnabled === "boolean";
  const wantsAiSuite = typeof body.aiSuiteEnabled === "boolean";
  const wantsGetLeads = typeof body.getLeadsEnabled === "boolean";
  const wantsBroadcastsHidden =
    typeof body.broadcastsHiddenWhenDisabled === "boolean";
  const wantsWebsiteHidden =
    typeof body.websiteHiddenWhenDisabled === "boolean";
  const wantsSocialPlannerHidden =
    typeof body.socialPlannerHiddenWhenDisabled === "boolean";
  const wantsCommunityHidden =
    typeof body.communityHiddenWhenDisabled === "boolean";
  const wantsGetLeadsHidden =
    typeof body.getLeadsHiddenWhenDisabled === "boolean";
  const wantsAiSuiteHidden =
    typeof body.aiSuiteHiddenWhenDisabled === "boolean";
  if (
    !wantsEmail &&
    !wantsApi &&
    !wantsBroadcasts &&
    !wantsOutboundVoice &&
    !wantsWhatsapp &&
    !wantsMetaInbox &&
    !wantsWebsite &&
    !wantsSocialPlanner &&
    !wantsCommunity &&
    !wantsMissedCall &&
    !wantsAiSuite &&
    !wantsGetLeads &&
    !wantsBroadcastsHidden &&
    !wantsWebsiteHidden &&
    !wantsSocialPlannerHidden &&
    !wantsCommunityHidden &&
    !wantsGetLeadsHidden &&
    !wantsAiSuiteHidden
  ) {
    return NextResponse.json(
      {
        error:
          "At least one of `emailDomainEnabled`, `apiAccessEnabled`, `broadcastsEnabled`, `outboundVoiceEnabled`, `whatsappEnabled`, `metaInboxEnabled`, `websiteEnabled`, `socialPlannerEnabled`, `broadcastsHiddenWhenDisabled`, `websiteHiddenWhenDisabled`, or `socialPlannerHiddenWhenDisabled` (boolean) is required.",
      },
      { status: 400 },
    );
  }

  // Meta features need app creds on the deployment. Refuse to ENABLE either
  // Meta gate when unconfigured (the UI grays these out; this guards the API).
  // Disabling is always allowed.
  if (
    (body.metaInboxEnabled === true || body.socialPlannerEnabled === true) &&
    !metaAppConfigured()
  ) {
    return NextResponse.json(
      {
        error:
          "Facebook/Instagram isn't configured on this deployment. Set META_APP_ID and META_APP_SECRET to enable the inbox or Social Planner.",
      },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }

  // Gate fields — routed through the shared chokepoint
  // (lib/server/feature-gates-service.ts) so per-gate side effects (the
  // email-domain tear-down, the Meta configured guard) can never drift
  // from the plan-driven application path in Client Billing.
  const gates: Partial<Record<AgencyGateField, boolean>> = {};
  if (typeof body.emailDomainEnabled === "boolean") {
    gates.emailDomainEnabledByAgency = body.emailDomainEnabled;
  }
  if (typeof body.apiAccessEnabled === "boolean") {
    gates.apiAccessEnabledByAgency = body.apiAccessEnabled;
  }
  if (typeof body.broadcastsEnabled === "boolean") {
    gates.broadcastsEnabledByAgency = body.broadcastsEnabled;
  }
  if (typeof body.outboundVoiceEnabled === "boolean") {
    gates.outboundVoiceEnabledByAgency = body.outboundVoiceEnabled;
  }
  if (typeof body.whatsappEnabled === "boolean") {
    gates.whatsappEnabledByAgency = body.whatsappEnabled;
  }
  if (typeof body.metaInboxEnabled === "boolean") {
    gates.metaInboxEnabledByAgency = body.metaInboxEnabled;
  }
  if (typeof body.websiteEnabled === "boolean") {
    gates.websiteEnabledByAgency = body.websiteEnabled;
  }
  if (typeof body.socialPlannerEnabled === "boolean") {
    gates.socialPlannerEnabledByAgency = body.socialPlannerEnabled;
  }
  if (typeof body.communityEnabled === "boolean") {
    gates.communityEnabledByAgency = body.communityEnabled;
  }
  if (typeof body.missedCallTextBackEnabled === "boolean") {
    gates.missedCallTextBackEnabledByAgency = body.missedCallTextBackEnabled;
  }
  if (typeof body.aiSuiteEnabled === "boolean") {
    gates.aiSuiteEnabledByAgency = body.aiSuiteEnabled;
  }
  if (typeof body.getLeadsEnabled === "boolean") {
    gates.getLeadsEnabledByAgency = body.getLeadsEnabled;
  }

  let clearedDomain = false;
  if (Object.keys(gates).length > 0) {
    ({ clearedDomain } = await applyFeatureGates(subAccountId, gates));
  }

  // "Hide instead of lock" overrides. Pure presentation flags — they don't
  // change any runtime enforcement (a disabled feature's routes 403 the same
  // way regardless); they only decide whether the sidebar shows a greyed
  // "Locked" entry or omits it entirely. Persisted independently of the gate
  // so the agency owner can pre-set "hide" before flipping the feature off.
  // Not plan-managed, so they update here rather than in the gate service.
  const hiddenUpdates: Record<string, unknown> = {};
  if (wantsBroadcastsHidden) {
    hiddenUpdates.broadcastsHiddenWhenDisabled =
      body.broadcastsHiddenWhenDisabled;
  }
  if (wantsWebsiteHidden) {
    hiddenUpdates.websiteHiddenWhenDisabled = body.websiteHiddenWhenDisabled;
  }
  if (wantsSocialPlannerHidden) {
    hiddenUpdates.socialPlannerHiddenWhenDisabled =
      body.socialPlannerHiddenWhenDisabled;
  }
  if (wantsCommunityHidden) {
    hiddenUpdates.communityHiddenWhenDisabled =
      body.communityHiddenWhenDisabled;
  }
  if (wantsGetLeadsHidden) {
    hiddenUpdates.getLeadsHiddenWhenDisabled = body.getLeadsHiddenWhenDisabled;
  }
  if (wantsAiSuiteHidden) {
    hiddenUpdates.aiSuiteHiddenWhenDisabled = body.aiSuiteHiddenWhenDisabled;
  }
  if (Object.keys(hiddenUpdates).length > 0) {
    hiddenUpdates.updatedAt = FieldValue.serverTimestamp();
    await subRef.update(hiddenUpdates);
  }

  return NextResponse.json({
    ok: true,
    ...(wantsEmail ? { emailDomainEnabled: body.emailDomainEnabled } : {}),
    ...(wantsApi ? { apiAccessEnabled: body.apiAccessEnabled } : {}),
    ...(wantsBroadcasts ? { broadcastsEnabled: body.broadcastsEnabled } : {}),
    ...(wantsOutboundVoice
      ? { outboundVoiceEnabled: body.outboundVoiceEnabled }
      : {}),
    ...(wantsWhatsapp ? { whatsappEnabled: body.whatsappEnabled } : {}),
    ...(wantsMetaInbox ? { metaInboxEnabled: body.metaInboxEnabled } : {}),
    ...(wantsWebsite ? { websiteEnabled: body.websiteEnabled } : {}),
    ...(wantsSocialPlanner
      ? { socialPlannerEnabled: body.socialPlannerEnabled }
      : {}),
    ...(wantsCommunity ? { communityEnabled: body.communityEnabled } : {}),
    ...(wantsMissedCall
      ? { missedCallTextBackEnabled: body.missedCallTextBackEnabled }
      : {}),
    ...(wantsAiSuite ? { aiSuiteEnabled: body.aiSuiteEnabled } : {}),
    ...(wantsGetLeads ? { getLeadsEnabled: body.getLeadsEnabled } : {}),
    ...(wantsBroadcastsHidden
      ? { broadcastsHiddenWhenDisabled: body.broadcastsHiddenWhenDisabled }
      : {}),
    ...(wantsWebsiteHidden
      ? { websiteHiddenWhenDisabled: body.websiteHiddenWhenDisabled }
      : {}),
    ...(wantsSocialPlannerHidden
      ? {
          socialPlannerHiddenWhenDisabled:
            body.socialPlannerHiddenWhenDisabled,
        }
      : {}),
    ...(wantsCommunityHidden
      ? { communityHiddenWhenDisabled: body.communityHiddenWhenDisabled }
      : {}),
    ...(wantsGetLeadsHidden
      ? { getLeadsHiddenWhenDisabled: body.getLeadsHiddenWhenDisabled }
      : {}),
    ...(wantsAiSuiteHidden
      ? { aiSuiteHiddenWhenDisabled: body.aiSuiteHiddenWhenDisabled }
      : {}),
    ...(clearedDomain ? { clearedDomain: true } : {}),
  });
}
