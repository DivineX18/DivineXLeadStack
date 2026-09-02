import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ResolutionProvenance } from "@/lib/funnels/resolve-visual-requirement";

/**
 * PROVENANCE VERIFICATION — P0.5.
 *
 * A claimed provenance is not a provenance. The resolve endpoint previously
 * trusted whatever the client sent, which meant any caller could post an
 * arbitrary URL with `provenance: "brand_library"` and have it recorded as
 * authentic first-party evidence. That is exactly the laundering the locked
 * rule forbids, approached from the other direction: instead of a generated
 * image becoming evidence, an unknown image would.
 *
 * So provenance is DERIVED FROM THE SOURCE, never accepted as an assertion:
 *
 *   first_party_upload  the URL must address an asset this workspace actually
 *                       stored, and it must be an image.
 *   brand_library       the URL must appear in the workspace's APPROVED
 *                       visual candidates. The asset's real classification
 *                       travels with it rather than being re-invented.
 *
 * Verification is a read, deliberately performed BEFORE the resolution
 * transaction: a rejected source must never leave a half-written page.
 */

export class ResolutionSourceError extends Error {}

export interface VerifiedSource {
  /** The asset's own classification at discovery time (hero | photo | team …).
   *  Null for uploads, which have no discovery classification — the operator
   *  chose the file deliberately, which is its own strong signal. */
  sourceClassification: string | null;
}

/** `/api/funnel-asset/{assetId}` — the shape storeFunnelAsset() returns. */
const UPLOAD_URL = /^\/api\/funnel-asset\/([A-Za-z0-9_-]{6,64})$/;

async function verifyUpload(subAccountId: string, url: string): Promise<VerifiedSource> {
  const match = UPLOAD_URL.exec(url);
  if (!match) {
    throw new ResolutionSourceError("That upload link isn't recognised. Please upload the photo again.");
  }
  const snap = await getAdminDb().doc(`funnelAssets/${match[1]}`).get();
  if (!snap.exists) throw new ResolutionSourceError("That upload is no longer available.");
  const meta = snap.data() as { subAccountId?: string; kind?: string };
  // Tenancy: an asset id is unguessable but not an authorization. A funnel in
  // this workspace must never be able to mount another workspace's asset.
  if (meta.subAccountId !== subAccountId) throw new ResolutionSourceError("That upload is no longer available.");
  if (meta.kind !== "image") throw new ResolutionSourceError("Only image files can fill a photo slot.");
  return { sourceClassification: null };
}

async function verifyBrandLibrary(subAccountId: string, url: string): Promise<VerifiedSource> {
  const { resolveProfileInputs } = await import("@/lib/divinex/consume-profile");
  const inputs = await resolveProfileInputs(subAccountId);
  // `visualCandidates` is already approved-only by construction. Matching
  // against it — rather than the full asset list — is what makes "approved
  // assets only" a property of the system instead of a property of the UI.
  const found = inputs?.assets.visualCandidates.find((c) => c.url === url);
  if (!found) {
    throw new ResolutionSourceError("That image isn't in your approved brand library.");
  }
  return { sourceClassification: found.classification ?? null };
}

export async function verifyResolutionSource(input: {
  subAccountId: string;
  provenance: ResolutionProvenance;
  url: string;
}): Promise<VerifiedSource> {
  if (input.provenance === "first_party_upload") return verifyUpload(input.subAccountId, input.url);
  if (input.provenance === "brand_library") return verifyBrandLibrary(input.subAccountId, input.url);
  // `generated` remains in the type as a deliberate seam: the provenance
  // model already knows a generated visual is not evidence. But no image
  // generation capability exists in this product, so accepting the value
  // here would let an arbitrary URL enter under a label nothing produced.
  throw new ResolutionSourceError("Image generation isn't available yet.");
}
