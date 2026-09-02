import { NextResponse, type NextRequest } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

/**
 * The workspace's APPROVED visual assets — the real source behind "Choose
 * from Brand Library".
 *
 * Approved-only is a property of the DATA PATH, not of the UI: this reads
 * `visualCandidates`, which `resolveProfileInputs` builds exclusively from
 * approved assets. An unapproved asset is therefore not merely hidden from
 * the picker — it is not retrievable through this endpoint at all, so a
 * crafted request cannot reach one.
 *
 * Each asset's own classification is returned so the caller can show what it
 * is, and so resolution can carry that classification across unchanged
 * rather than inventing a new one.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(req, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    const { resolveProfileInputs } = await import("@/lib/divinex/consume-profile");
    const inputs = await resolveProfileInputs(subAccountId);
    const assets = (inputs?.assets.visualCandidates ?? [])
      // Marks and seals are not photography and can never fill a photo slot;
      // offering them would produce a resolution the Director would reject.
      .filter((c) => c.isPhotograph)
      .map((c) => ({
        url: c.url,
        classification: c.classification,
        width: c.width,
        height: c.height,
        alt: c.alt ?? null,
      }));
    return NextResponse.json({ assets });
  } catch (err) {
    console.error("[brand-library] failed:", err instanceof Error ? err.message : err);
    // An empty library is a legitimate state (no brand snapshot yet), so the
    // caller renders "nothing approved yet" rather than an error.
    return NextResponse.json({ assets: [] });
  }
}
