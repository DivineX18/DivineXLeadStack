import { NextResponse } from "next/server";
import { resolveDeployProvenance } from "@/lib/deploy/provenance";

export const dynamic = "force-dynamic";

/**
 * P0.1 / U3 — deployment provenance over HTTP.
 *
 * PUBLIC by design and carrying no secrets (a commit SHA and branch name are
 * not sensitive). Public is the point: verifying which build a service runs
 * must not require a session, because the drift this prevents was found while
 * probing an environment we could not yet authenticate against.
 *
 * `no-store` matters — a cached version response would reintroduce exactly
 * the stale-answer problem.
 */
export async function GET() {
  return NextResponse.json(resolveDeployProvenance(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
