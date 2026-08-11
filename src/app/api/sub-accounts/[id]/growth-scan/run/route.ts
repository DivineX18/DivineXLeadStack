import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { evaluateWorkspaceEntitlements } from "@/lib/entitlements/evaluate-workspace-entitlements";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";

/**
 * Orchestration only — never duplicates the scan engine. This route's job
 * is entirely: verify the caller can act on this workspace, verify the
 * workspace is genuinely entitled to Full Ascend (a CRM-only workspace
 * must never be able to trigger a scan, regardless of what the caller
 * passes), resolve the workspace's linked Ascend business profile, then
 * delegate to the Intelligence Bridge client's triggerGrowthScan() — the
 * one function in this codebase allowed to call the Ascend service.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const entitlements = await evaluateWorkspaceEntitlements({ workspaceId: subAccountId, module: "growth_scan" }, access.subAccountRole === "agencyOwner");
  if (!entitlements.requestedModuleDecision?.allowed) {
    return NextResponse.json(
      { error: "This workspace is not entitled to run a Growth Scan.", reason: entitlements.requestedModuleDecision?.reason ?? "not_entitled" },
      { status: 403 },
    );
  }

  const mapping = await getMappingBySubAccountId(subAccountId);
  if (!mapping?.primaryAscendBusinessProfileId) {
    return NextResponse.json({ error: "No Ascend business profile is linked to this workspace yet." }, { status: 409 });
  }

  let body: { websiteUrl?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — the scan falls back to the linked profile's saved website URL
  }
  let websiteUrl: string | undefined;
  if (typeof body.websiteUrl === "string" && body.websiteUrl.trim()) {
    const candidate = body.websiteUrl.trim();
    try {
      new URL(candidate);
    } catch {
      return NextResponse.json({ error: "Invalid website URL." }, { status: 400 });
    }
    websiteUrl = candidate;
  }

  const client = createAscendIntelligenceClient();
  const result = await client.triggerGrowthScan(String(mapping.primaryAscendBusinessProfileId), websiteUrl);

  if (!result.ok) {
    const status =
      result.code === "conflict" ? 409 :
      result.code === "rate_limited" ? 429 :
      result.code === "invalid_request" ? 400 :
      result.code === "business_not_found" ? 404 :
      result.code === "not_configured" ? 503 :
      502;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ jobId: result.jobId, status: "processing" }, { status: 202 });
}
