import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  BillingError,
  normalizePlanGates,
  setDefaultPlanForAgency,
  updatePlanForAgency,
  validatePlanPricing,
} from "@/lib/server/billing-service";

function billingErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof BillingError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ planId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { planId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof updatePlanForAgency>[0] = {
    agencyId: caller.agencyId!,
    planId,
  };

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 60) {
      return NextResponse.json(
        { error: "Plan name must be 1–60 characters." },
        { status: 400 },
      );
    }
    patch.name = name;
  }
  if (typeof body.description === "string" || body.description === null) {
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 300) {
      return NextResponse.json(
        { error: "Description must be 300 characters or fewer." },
        { status: 400 },
      );
    }
    patch.description = description || null;
  }
  if (body.priceMonthlyCents !== undefined) {
    try {
      // Currency is fixed after creation; validate the amount with a
      // placeholder currency.
      const { priceMonthlyCents } = validatePlanPricing(
        body.priceMonthlyCents,
        "usd",
      );
      patch.priceMonthlyCents = priceMonthlyCents;
    } catch (err) {
      const res = billingErrorResponse(err);
      if (res) return res;
      throw err;
    }
  }
  if (body.gates !== undefined) {
    patch.gates = normalizePlanGates(body.gates);
  }
  if (body.status === "active" || body.status === "archived") {
    patch.status = body.status;
  }
  if (typeof body.publicSelfServeEnabled === "boolean") {
    patch.publicSelfServeEnabled = body.publicSelfServeEnabled;
  }

  try {
    let plan = await updatePlanForAgency(patch);
    if (typeof body.setDefault === "boolean") {
      await setDefaultPlanForAgency({
        agencyId: caller.agencyId!,
        planId: body.setDefault ? planId : null,
      });
      plan = { ...plan, isDefault: body.setDefault };
    }
    return NextResponse.json({ plan });
  } catch (err) {
    const res = billingErrorResponse(err);
    if (res) return res;
    console.error("[api/agency/plans] update failed", err);
    return NextResponse.json(
      { error: "Failed to update the plan." },
      { status: 500 },
    );
  }
}

/** DELETE = archive (plans referenced by live subscriptions are never hard-deleted). */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ planId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { planId } = await ctx.params;

  try {
    const plan = await updatePlanForAgency({
      agencyId: caller.agencyId!,
      planId,
      status: "archived",
    });
    return NextResponse.json({ plan });
  } catch (err) {
    const res = billingErrorResponse(err);
    if (res) return res;
    console.error("[api/agency/plans] archive failed", err);
    return NextResponse.json(
      { error: "Failed to archive the plan." },
      { status: 500 },
    );
  }
}
