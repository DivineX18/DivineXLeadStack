import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ascend } from "@/lib/divinex/ascend-client";
import { getDivinexProfileSnapshot } from "@/lib/divinex/contract";

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

  // Resolve the canonical profile id: snapshot first (fast), else ask
  // Ascend to find-or-create it for this workspace.
  let businessProfileId = body.businessProfileId ?? null;
  if (!businessProfileId) {
    const snapshot = await getDivinexProfileSnapshot(subAccountId);
    businessProfileId = snapshot?.businessProfileId ?? null;
  }
  if (!businessProfileId) {
    const resolved = await ascend.resolve({ flowSubAccountId: subAccountId });
    if (!resolved.ok || !resolved.data?.businessProfileId) {
      return NextResponse.json({ error: resolved.error ?? "resolve_failed" }, { status: 502 });
    }
    businessProfileId = resolved.data.businessProfileId;
  }

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
