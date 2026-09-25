import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { diagnoseDomain, diagnosisAdvice } from "@/lib/domains/diagnose";
import type { CustomDomainDoc } from "@/types/custom-domains";

/**
 * Read-only DNS diagnosis for one connected domain. Changes nothing; it exists
 * so "Failed" can become an instruction the customer can act on.
 *
 * Tenancy: the caller must be a member of the sub-account that owns the
 * domain, checked against the stored doc rather than the URL, so a member of
 * one workspace cannot probe another's domain.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; funnelId: string; domain: string }> },
) {
  const { id: subAccountId, domain: raw } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const domain = decodeURIComponent(raw).trim().toLowerCase();
  const snap = await getAdminDb().doc(`customDomains/${domain}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Domain not found." }, { status: 404 });

  const d = snap.data() as CustomDomainDoc;
  if (d.subAccountId !== subAccountId) {
    // Same 404 a stranger gets: never confirm a domain exists in someone
    // else's workspace.
    return NextResponse.json({ error: "Domain not found." }, { status: 404 });
  }

  const expected = d.verificationRecords?.[0]?.value ?? null;
  const diagnosis = await diagnoseDomain(domain, expected);
  return NextResponse.json({
    diagnosis,
    advice: diagnosisAdvice(diagnosis),
    status: d.status,
  });
}
