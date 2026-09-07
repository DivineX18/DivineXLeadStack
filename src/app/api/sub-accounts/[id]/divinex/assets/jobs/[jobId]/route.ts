import "server-only";
import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ascend, ascendConfigured } from "@/lib/divinex/ascend-client";

export const dynamic = "force-dynamic";

/**
 * ASSET GENERATION JOB STATUS — what the Create surface polls.
 *
 * Generation is detached because it takes 100–172s and every ceiling on a
 * synchronous path sits below that (see the POST in ../../route.ts). This is
 * the other half: cheap, repeatable, and safe to call every few seconds.
 *
 * Authenticated per request like every other workspace route, so polling never
 * becomes an unauthenticated read of someone else's deliverable. Ascend
 * independently re-checks that the job belongs to this workspace's business
 * profile, so a guessed job id fails closed on both sides.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, jobId: rawJobId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const jobId = Number.parseInt(rawJobId, 10);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  if (!ascendConfigured()) {
    return NextResponse.json(
      { error: "The DivineX intelligence engine isn't configured on this deployment yet." },
      { status: 503 },
    );
  }

  const res = await ascend.getAssetGenerationJob(subAccountId, jobId);

  if (!res.ok || !res.data) {
    if (res.error === "ascend_404") {
      return NextResponse.json({ error: "No such generation job." }, { status: 404 });
    }
    // A failed STATUS read is not a failed generation — the work may still be
    // running. Saying "still working" here would be a lie, but so would
    // reporting the asset as failed, so the client is told to retry.
    return NextResponse.json(
      { error: "Couldn't check on that just now.", retryable: true },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: res.data.status,
    asset: res.data.asset,
    errorMessage: res.data.errorMessage,
  });
}
