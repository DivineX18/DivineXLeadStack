import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listWorkspacesForAgency } from "@/lib/server/command-center-service";

/**
 * Ascend Command Center — read-only workspace list for the agency owner's
 * own agency. Write actions (create/rename/delete/gates/billing) are
 * deliberately NOT duplicated here — the Command Center UI calls the
 * existing /api/agency/sub-accounts* routes directly, same auth model,
 * same service functions, zero drift.
 */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const workspaces = await listWorkspacesForAgency(caller.agencyId!);
  return NextResponse.json({ workspaces });
}
