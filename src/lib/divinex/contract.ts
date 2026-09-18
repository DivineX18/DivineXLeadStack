import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * DIVINEX PROFILE CONTRACT — Flow side (Unification Slice 1).
 *
 * Ascend Postgres is canonical; Flow holds READ-ONLY versioned snapshots at
 * divinexProfiles/{subAccountId}. Two independently-contracted event types
 * arrive on the same signed transport (per the approved amendment):
 *   divinex.profile     — workspace-scoped business/brand/offers/assets
 *   divinex.frameworks  — global intelligence library (replaces the manual
 *                         sync script's writes; the script remains an
 *                         operator fallback until this path is proven)
 *
 * Signature: HMAC-SHA256 over `${timestamp}.${rawBody}` with the existing
 * ASCEND_SSO_SHARED_SECRET; stale timestamps (>5 min) rejected. Profile
 * snapshots enforce VERSION MONOTONICITY — an older or duplicate version is
 * acknowledged (200, so Ascend never retry-storms) but ignored, which makes
 * out-of-order and replayed events harmless. Generation keeps working from
 * the last snapshot if Ascend is down; the reconcile pull recovers missed
 * events on demand.
 */

const SECRET = () => process.env.ASCEND_SSO_SHARED_SECRET ?? "";
const MAX_SKEW_MS = 5 * 60 * 1000;

export function divinexContractConfigured(): boolean {
  return !!SECRET();
}

export function verifyDivinexSignature(rawBody: string, timestamp: string, signature: string): boolean {
  if (!SECRET() || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;
  const expected = createHmac("sha256", SECRET()).update(`${timestamp}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export interface DivinexProfileSnapshot {
  contract: "divinex.profile";
  contractVersion: number;
  profileVersion: number;
  publishedAt: string;
  businessProfileId: number;
  flowSubAccountId: string;
  business: Record<string, unknown>;
  offers: { id: string; name: string; kind: string }[];
  brand: Record<string, unknown>;
  assets: {
    id: number;
    fileUrl: string;
    fileType: string;
    purpose: string | null;
    sourcePageUrl?: string | null;
    /** Slice 3: proposed marketing classification (customer-correctable). */
    classification?: string | null;
    confidence?: number | null;
    /** "approved" gates every Flow consumer; discovery writes "candidate". */
    status?: string;
    /** P0.5 — intrinsic pixel dimensions, read from the image bytes by
     *  Ascend discovery. ABSENT on every pre-P0.5 snapshot, so the Image
     *  Director must degrade safely without them (an unknown-size asset is
     *  graded "generic" and never becomes a hero). */
    width?: number | null;
    height?: number | null;
  }[];
  provenance: Record<string, unknown>;
  /**
   * ASCEND'S DIAGNOSIS — optional, additive, and the link that turns two
   * products into one loop. Without it Flow/Zeno knows WHO the business is
   * but not what is holding it back, so it can only give generic advice.
   *
   * Ascend remains the authority; this is a projection of its existing
   * growth_scans fields, not a second intelligence model. Absent on every
   * pre-existing snapshot, so Zeno must degrade to "no diagnosis available"
   * rather than inventing one.
   */
  intelligence?: {
    /** growth_scans.biggestBottleneck — what is most limiting growth. */
    primaryConstraint?: string;
    /** growth_scans.topOpportunities — prioritised, highest first. */
    opportunities?: { title: string; why?: string }[];
    /** growth_scans.recommendedFunnelType / recommendedLeadMagnet. */
    recommendedFunnelType?: string;
    recommendedLeadMagnet?: string;
    /** growth_scans.overallScore / scoreLabel — context, not a headline. */
    overallScore?: number;
    scoreLabel?: string;
    /** When the diagnosis was produced, so staleness is visible. */
    assessedAt?: string;
  };
}

/**
 * WHO SAID THIS PROFILE BELONGS TO THIS WORKSPACE, AND ON WHAT BASIS.
 *
 * Nothing recorded this until now, and the absence had a cost. A profile for a
 * document-legalisation company sat in the DivineX admin workspace, and because
 * every stored signal was internally consistent — the doc is keyed by
 * flowSubAccountId, so it always "matches" — generation had no way to tell that
 * the eleven approved photographs it was handed belonged to somebody else. A
 * school's booking page shipped with their scales-of-justice imagery.
 *
 * The repair is deliberately NOT a cleverer inference. Business names, asset
 * domains and website URLs were all available and all agreed with each other;
 * inferring ownership from them would have produced a confident wrong answer.
 * Ownership is a FACT SOMEBODY ASSERTS, so this records the assertion:
 * who bound this profile to this workspace, when, and by which route.
 *
 * Flow owns this field. Ascend owns the rest of the snapshot and republishes it
 * wholesale, so applyProfileSnapshot carries the binding forward explicitly
 * (see below) rather than letting the next publish erase it.
 */
export interface ProfileBinding {
  /**
   * How the association came about, strongest first:
   *   scan_requested_in_workspace — a member of THIS workspace asked for this
   *     business to be analysed, supplying its website themselves.
   *   operator_confirmed          — a member of THIS workspace affirmed, after
   *     the fact, that the profile describes their business.
   *   imported / seeded           — it arrived from elsewhere. Nobody in this
   *     workspace has ever claimed it.
   */
  method: "scan_requested_in_workspace" | "operator_confirmed" | "imported" | "seeded";
  workspaceId: string;
  requestedByUid?: string;
  requestedAt?: string;
  /** The URL the human typed, which is the whole point: it is what they SAID
   *  their business was, rather than what we guessed from the assets. */
  declaredWebsiteUrl?: string;
  confirmedByUid?: string;
  confirmedAt?: string;
}

/** The profile doc as STORED: Ascend's contract payload plus Flow's binding. */
export type StoredDivinexProfile = DivinexProfileSnapshot & { binding?: ProfileBinding };

/** Methods under which the profile's imagery may be presented as the
 *  business's own. Everything else supplies context but not first-party media. */
const TRUSTED_BINDING_METHODS: ReadonlySet<ProfileBinding["method"]> = new Set([
  "scan_requested_in_workspace",
  "operator_confirmed",
]);

export interface ProfileMediaTrust {
  trusted: boolean;
  /** Operator-facing, and the reason a page has no customer photography. */
  reason: string;
}

/**
 * MAY THIS PROFILE'S IMAGERY BE PRESENTED AS THE CUSTOMER'S OWN?
 *
 * Pure, so the whole rule is testable against the real contaminated fixture.
 * Fails closed on every legacy profile — none has a binding — which is the
 * intended outcome: a page that has never been claimed by anyone in this
 * workspace composes from stock, generated media, or nothing at all, exactly
 * as a workspace with no profile always has. Business CONTEXT is unaffected;
 * only the claim "these photographs are theirs" requires provenance.
 */
export function resolveProfileMediaTrust(
  stored: StoredDivinexProfile | null,
  workspaceId: string,
): ProfileMediaTrust {
  if (!stored) return { trusted: false, reason: "no_profile" };
  const b = stored.binding;
  if (!b) {
    return {
      trusted: false,
      reason: "This profile predates ownership tracking, so its images are not treated as this workspace's own.",
    };
  }
  if (b.workspaceId !== workspaceId) {
    return { trusted: false, reason: "This profile is bound to a different workspace." };
  }
  if (!TRUSTED_BINDING_METHODS.has(b.method)) {
    return {
      trusted: false,
      reason: "Nobody in this workspace has confirmed that this profile describes their business.",
    };
  }
  return { trusted: true, reason: `Bound to this workspace via ${b.method}.` };
}

/**
 * Record a binding. Never DOWNGRADES: an imported profile that a member later
 * confirms becomes confirmed, and a confirmed one is never quietly demoted by a
 * later import. Best-effort by design — bookkeeping must not be able to fail
 * the flow that triggered it.
 */
export async function recordProfileBinding(
  workspaceId: string,
  binding: Omit<ProfileBinding, "workspaceId">,
): Promise<void> {
  try {
    const ref = getAdminDb().doc(`divinexProfiles/${workspaceId}`);
    const snap = await ref.get();
    if (!snap.exists) return;
    const existing = (snap.data() as StoredDivinexProfile).binding;
    if (existing && TRUSTED_BINDING_METHODS.has(existing.method) && !TRUSTED_BINDING_METHODS.has(binding.method)) {
      return;
    }
    await ref.set({ binding: { ...binding, workspaceId } }, { merge: true });
  } catch {
    // Never throw into a caller whose real job is something else.
  }
}

/** Apply an incoming profile contract to the snapshot cache. Returns what
 *  happened (for the receiver's response + logs). */
export async function applyProfileSnapshot(
  payload: DivinexProfileSnapshot,
): Promise<{ result: "applied" | "ignored_stale" | "rejected"; reason?: string }> {
  if (payload.contract !== "divinex.profile" || !payload.flowSubAccountId) {
    return { result: "rejected", reason: "bad_contract" };
  }
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${payload.flowSubAccountId}`).get();
  if (!subSnap.exists) return { result: "rejected", reason: "unknown_sub_account" };

  const ref = db.doc(`divinexProfiles/${payload.flowSubAccountId}`);
  const existing = await ref.get();
  const currentVersion = existing.exists ? ((existing.data()!.profileVersion as number) ?? -1) : -1;
  if (payload.profileVersion <= currentVersion) {
    return { result: "ignored_stale", reason: `have v${currentVersion}, got v${payload.profileVersion}` };
  }
  // BINDING SURVIVES REPUBLISH. Ascend owns the contract payload and resends it
  // whole, so a plain set() would erase Flow's record of who claimed this
  // profile every time the business edited anything in Ascend — silently
  // un-trusting a workspace that had properly confirmed itself. Carried forward
  // explicitly; a profile nobody has claimed is stamped "imported", which is
  // the truth and is not a trusted method.
  const existingBinding = existing.exists ? (existing.data() as StoredDivinexProfile).binding : undefined;
  await ref.set({
    ...payload,
    binding: existingBinding ?? { method: "imported", workspaceId: payload.flowSubAccountId },
    receivedAt: FieldValue.serverTimestamp(),
  });
  return { result: "applied" };
}

/** Read the snapshot for generation-side consumers (Slice 6). Null when the
 *  workspace has never been published — every consumer must degrade to
 *  current certified behavior. */
export async function getDivinexProfileSnapshot(
  subAccountId: string,
): Promise<DivinexProfileSnapshot | null> {
  const snap = await getAdminDb().doc(`divinexProfiles/${subAccountId}`).get();
  if (!snap.exists) return null;
  return snap.data() as DivinexProfileSnapshot;
}

/** Reconcile: PULL the current contract from Ascend (covers missed events;
 *  prevents silent permanent drift). Uses the deployment's existing Ascend
 *  URL + shared secret. */
export async function reconcileProfileFromAscend(
  businessProfileId: number,
): Promise<{ ok: boolean; result?: string; error?: string }> {
  // The Ascend API server is served at ascend.divinex.io (verified:
  // app.divinex.io hosts the unified /app shell and 307s API paths).
  // ASCEND_API_BASE_URL overrides for staging/local.
  const base = process.env.ASCEND_API_BASE_URL ?? "https://ascend.divinex.io";
  if (!divinexContractConfigured()) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${base}/api/divinex/profile/${businessProfileId}`, {
      headers: { Authorization: `Bearer ${SECRET()}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `ascend_${res.status}` };
    const payload = (await res.json()) as DivinexProfileSnapshot;
    const applied = await applyProfileSnapshot(payload);
    return { ok: applied.result !== "rejected", result: applied.result, error: applied.reason };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
