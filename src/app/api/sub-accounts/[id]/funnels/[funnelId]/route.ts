import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteFunnelServerSide,
  FunnelValidationError,
  getFunnel,
  updateFunnelServerSide,
  type FunnelPatch,
} from "@/lib/server/funnels-service";
import type { FunnelSection, FunnelSectionType } from "@/types/funnels";

export const dynamic = "force-dynamic";

const SECTION_TYPES: FunnelSectionType[] = [
  "hero",
  "proof_strip",
  "offer",
  "story",
  "faq",
  "cta_banner",
  "countdown",
  "agenda",
  "ticket_tiers",
  "guarantee",
  "trust_badges",
  "checkout",
];

/** Defensive sanitize of a client-supplied sections array — authed staff,
 *  but keep the shape honest so a malformed save can't poison the renderer. */
function sanitizeSections(raw: unknown): FunnelSection[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FunnelSection[] = [];
  for (const v of raw) {
    const s = v as Partial<FunnelSection>;
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.type !== "string" ||
      !SECTION_TYPES.includes(s.type as FunnelSectionType) ||
      !s.config ||
      typeof s.config !== "object"
    ) {
      return null;
    }
    out.push({ id: s.id, type: s.type as FunnelSectionType, config: s.config });
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ funnel });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: FunnelPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.status === "draft" || body.status === "published") {
    patch.status = body.status;
  }
  if (body.theme === "light" || body.theme === "dark") patch.theme = body.theme;
  if (typeof body.accentColor === "string") patch.accentColor = body.accentColor;
  if (body.sections !== undefined) {
    const sections = sanitizeSections(body.sections);
    if (sections === null) {
      return NextResponse.json({ error: "Invalid sections" }, { status: 400 });
    }
    patch.sections = sections;
  }

  let ok: boolean;
  try {
    ok = await updateFunnelServerSide({ subAccountId, funnelId, patch });
  } catch (err) {
    if (err instanceof FunnelValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ok = await deleteFunnelServerSide(subAccountId, funnelId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
