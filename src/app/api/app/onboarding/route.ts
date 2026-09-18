import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ascend } from "@/lib/divinex/ascend-client";
import { recordProfileBinding } from "@/lib/divinex/contract";
import { resolveAuthorizedBusinessProfileId, sameProfileId } from "@/lib/divinex/profile-authorization";
import { linkAscendBusinessProfile } from "@/lib/workspace/link-ascend-business-profile";

/**
 * Unified onboarding API (Slice 4) — the ONE server endpoint the /app
 * onboarding experience talks to. Everything canonical is written through
 * Ascend (this route never stores business/brand truth in Flow); the Flow
 * snapshot is only read for fast prefill.
 *
 * Actions: start | answer | discover | review_assets | confirm_brand |
 *          complete
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: {
    action?: string;
    subAccountId?: string;
    businessProfileId?: number;
    field?: string;
    value?: unknown;
    websiteUrl?: string;
    decisions?: { id: number; status: "approved" | "rejected"; classification?: string }[];
    brandVisual?: Record<string, unknown>;
    business?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const subAccountId = body.subAccountId ?? "";
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  // THE PROFILE ID IS RESOLVED SERVER-SIDE. THE CLIENT DOES NOT CHOOSE IT.
  //
  // This route previously took `body.businessProfileId` straight from the
  // request and ran getProfile / patchProfile / discover / reviewAssets /
  // publish against it, having checked only that the caller belonged to their
  // OWN workspace. Profile ids are small sequential integers, so membership in
  // any workspace granted read and write access to every business profile on
  // the platform — including re-scanning one against an arbitrary URL, which is
  // how a profile's website, brand tokens and assets get overwritten.
  //
  // The snapshot fallback that used to sit here was a second way in: a stored
  // snapshot can carry a FOREIGN profile id (that is the live DivineX state,
  // mapped to one profile and holding another), so trusting it would launder
  // the wrong id into an authorized-looking one.
  //
  // Authority is now Flow's canonical workspace mapping and nothing else.
  const auth = await resolveAuthorizedBusinessProfileId(subAccountId);
  let businessProfileId: number | null = auth.authorized ? auth.businessProfileId : null;

  // Bootstrap ONLY when the workspace genuinely has no mapped profile yet.
  // ascend.resolve is keyed on the workspace id alone — no client input reaches
  // it — so find-or-create cannot be steered at someone else's profile.
  if (businessProfileId === null) {
    const resolved = await ascend.resolve({ flowSubAccountId: subAccountId });
    if (!resolved.ok || !resolved.data?.businessProfileId) {
      return NextResponse.json({ error: resolved.error ?? "resolve_failed" }, { status: 502 });
    }
    businessProfileId = resolved.data.businessProfileId;
  }

  // A client-supplied id is a CLAIM to be checked, never a selector. Kept for
  // compatibility with existing callers; a mismatch is refused rather than
  // silently corrected, because a caller asking for a profile it may not have
  // is something an operator should see, not something to paper over.
  if (
    body.businessProfileId !== undefined &&
    body.businessProfileId !== null &&
    !sameProfileId(body.businessProfileId, businessProfileId)
  ) {
    return NextResponse.json(
      { error: "forbidden_profile", message: "That business profile does not belong to this workspace." },
      { status: 403 },
    );
  }

  // The id above is what the intelligence layer needs and never had. Writing it
  // to the workspace mapping is what turns Home's Growth Score, the Recommended
  // Next Step and the in-app Growth Scan on for this customer; without it they
  // all resolve to "no_linked_business_profile". Deliberately awaited but never
  // checked: a bookkeeping write must not be able to fail onboarding.
  await linkAscendBusinessProfile({
    subAccountId,
    businessProfileId,
    actingAsUid: access.uid,
    agencyId: access.agencyId,
  });

  // THIS IS THE MOMENT OWNERSHIP IS ACTUALLY ASSERTED. A verified member of
  // this workspace is standing here asking for this business to be analysed,
  // which is the only evidence of ownership the system ever gets — and until
  // now it was thrown away, leaving generation to infer ownership later from
  // data that could not carry it. Recorded rather than re-derived.
  // Best-effort, like the link above: bookkeeping must not fail onboarding.
  await recordProfileBinding(subAccountId, {
    method: "scan_requested_in_workspace",
    requestedByUid: access.uid,
    requestedAt: new Date().toISOString(),
    ...(typeof body.websiteUrl === "string" && body.websiteUrl
      ? { declaredWebsiteUrl: body.websiteUrl }
      : typeof body.business?.websiteUrl === "string"
        ? { declaredWebsiteUrl: body.business.websiteUrl }
        : {}),
  });

  switch (body.action) {
    case "start": {
      const profile = await ascend.getProfile(businessProfileId);
      return NextResponse.json({ businessProfileId, profile: profile.data ?? null });
    }
    case "answer": {
      // field is "business.x" | "brandVisual.x" | "brandVoice.x"
      const [group, key] = (body.field ?? "").split(".");
      if (!group || !key) return NextResponse.json({ error: "bad_field" }, { status: 400 });
      const patch: Record<string, unknown> = {
        provenance: { [key]: { status: "supplied" } },
      };
      patch[group] = { [key]: body.value };
      const res = await ascend.patchProfile(businessProfileId, patch);
      return NextResponse.json({ ok: res.ok, businessProfileId });
    }
    case "discover": {
      const res = await ascend.discover(businessProfileId, body.websiteUrl);
      return NextResponse.json({ ok: res.ok, ...(res.data ?? {}), error: res.error }, { status: res.ok ? 200 : 502 });
    }
    case "confirm_brand": {
      // Customer confirmation flips extracted/inferred → confirmed.
      const provenance: Record<string, { status: string }> = {};
      for (const key of Object.keys(body.brandVisual ?? {})) provenance[key] = { status: "confirmed" };
      for (const key of Object.keys(body.business ?? {})) provenance[key] = { status: "confirmed" };
      const res = await ascend.patchProfile(businessProfileId, {
        business: body.business,
        brandVisual: body.brandVisual,
        provenance: { ...provenance, brandVisual: { status: "confirmed" } },
      });
      return NextResponse.json({ ok: res.ok });
    }
    case "review_assets": {
      const res = await ascend.reviewAssets(businessProfileId, body.decisions ?? []);
      return NextResponse.json({ ok: res.ok, updated: res.data?.updated ?? 0 });
    }
    case "complete": {
      await ascend.patchProfile(businessProfileId, {
        business: { onboardingCompleted: true },
        provenance: { onboardingCompleted: { status: "supplied" } },
      });
      const published = await ascend.publish(businessProfileId);
      return NextResponse.json({ ok: true, profileVersion: published.data?.version ?? null });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
