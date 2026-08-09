import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";

export async function GET(request: Request, ctx: { params: Promise<{ id: string; jobId: string }> }) {
  const { id: subAccountId, jobId: jobIdParam } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const jobId = parseInt(jobIdParam, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const mapping = await getMappingBySubAccountId(subAccountId);
  if (!mapping?.primaryAscendBusinessProfileId) {
    return NextResponse.json({ error: "No Ascend business profile is linked to this workspace." }, { status: 409 });
  }

  const client = createAscendIntelligenceClient();
  const result = await client.getGrowthScanJobStatus(String(mapping.primaryAscendBusinessProfileId), jobId);

  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result);
}
