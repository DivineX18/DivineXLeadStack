import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  addCustomDomain,
  listCustomDomains,
} from "@/lib/server/custom-domains-service";

export const dynamic = "force-dynamic";

async function requireGates(subAccountId: string): Promise<
  | { ok: true; agencyId: string; subAccountData: Record<string, unknown> }
  | { ok: false; res: NextResponse }
> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const data = snap.data() ?? {};
  if (data.funnelsEnabledByAgency !== true) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Funnels aren't enabled for this workspace. Ask your agency owner." },
        { status: 403 },
      ),
    };
  }
  if (data.customDomainsEnabledByAgency !== true) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error:
            "Custom domains aren't enabled for this workspace. Ask your agency owner.",
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, agencyId: (data.agencyId as string) ?? "", subAccountData: data };
}

/** GET — list domains registered to a funnel. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const gate = await requireGates(subAccountId);
  if (!gate.ok) return gate.res;

  const domains = (await listCustomDomains(subAccountId)).filter(
    (d) => d.funnelId === funnelId,
  );
  return NextResponse.json({ domains });
}

/** POST — register a new domain for this funnel. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const gate = await requireGates(subAccountId);
  if (!gate.ok) return gate.res;

  let body: { domain?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.domain || typeof body.domain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const result = await addCustomDomain({
    subAccountId,
    agencyId: gate.agencyId,
    funnelId,
    domain: body.domain,
    subAccountData: gate.subAccountData,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ domain: result.domain });
}
