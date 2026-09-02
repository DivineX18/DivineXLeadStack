import { NextResponse, type NextRequest } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { resolveVisualRequirement, VisualRequirementError, type ResolutionProvenance } from "@/lib/funnels/resolve-visual-requirement";
import { ResolutionSourceError, verifyResolutionSource } from "@/lib/funnels/verify-resolution-source";

const PROVENANCES: ResolutionProvenance[] = ["first_party_upload", "brand_library", "generated"];

/**
 * Resolve ONE visual requirement, targeted by its stable id — never "a photo
 * somewhere on the page". Tenancy is enforced here and re-checked inside the
 * transaction, so a funnel id in a URL cannot reach another workspace.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; funnelId: string; requirementId: string }> },
) {
  const { id: subAccountId, funnelId, requirementId } = await params;
  // Matches the established pattern in this repo: the helper returns either
  // access or the response to send.
  const access = await requireSubAccountMember(req, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await req.json().catch(() => null)) as { provenance?: string; url?: string } | null;
  const provenance = body?.provenance as ResolutionProvenance | undefined;
  const url = body?.url?.trim();

  if (!provenance || !PROVENANCES.includes(provenance)) {
    return NextResponse.json({ error: "Pick how this visual was supplied." }, { status: 400 });
  }
  // An uploaded asset is served from a RELATIVE path (`/api/funnel-asset/…`),
  // so an absolute-URL-only check rejected every genuine upload. Both shapes
  // are accepted here; which one is legitimate for a given provenance is
  // decided by verification below, not by this regex.
  if (!url || !/^(https?:\/\/|\/)/i.test(url)) {
    return NextResponse.json({ error: "A valid image URL is required." }, { status: 400 });
  }

  try {
    // Provenance is VERIFIED AGAINST THE SOURCE before anything is written.
    // A client claiming "brand_library" for an arbitrary URL would otherwise
    // launder an unknown image into first-party evidence.
    const source = await verifyResolutionSource({ subAccountId, provenance, url });
    const result = await resolveVisualRequirement({
      funnelId,
      subAccountId,
      requirementId,
      provenance,
      url,
      sourceClassification: source.sourceClassification,
    });
    return NextResponse.json({
      ok: true,
      requirement: result.requirement,
      // Surfaced deliberately: a generated visual handles the slot without
      // becoming evidence, and the caller should be able to see that.
      countsAsAuthenticEvidence: result.countsAsAuthenticEvidence,
    });
  } catch (err) {
    if (err instanceof ResolutionSourceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof VisualRequirementError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[visual-requirements/resolve] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't attach that image. Please try again." }, { status: 500 });
  }
}
