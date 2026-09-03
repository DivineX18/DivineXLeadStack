import "server-only";

/**
 * ASCEND INTELLIGENCE CLIENT (Unification Slice 4).
 *
 * Flow's `/app` is the unified customer EXPERIENCE; Ascend is the
 * INTELLIGENCE engine. New unified surfaces are built here in Next and
 * call Ascend server-side through this one client — no Vite UI is ported,
 * no second frontend is maintained (Amendment 2).
 *
 * Auth: the existing ASCEND_SSO_SHARED_SECRET as a Bearer (same trust
 * model as the SSO exchange + the Slice 1 contract routes). Every call is
 * server-only; the secret never reaches the browser.
 */

const BASE = () => process.env.ASCEND_API_BASE_URL ?? "https://ascend.divinex.io";
const SECRET = () => process.env.ASCEND_SSO_SHARED_SECRET ?? "";

export function ascendConfigured(): boolean {
  return !!SECRET();
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<{ ok: boolean; data?: T; error?: string }> {
  if (!ascendConfigured()) return { ok: false, error: "ascend_not_configured" };
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${SECRET()}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) return { ok: false, error: `ascend_${res.status}`, data: data as T };
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AscendProfileContract {
  contract: string;
  contractVersion: number;
  profileVersion: number;
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
    sourcePageUrl: string | null;
    classification: string | null;
    confidence: number | null;
    status: string;
  }[];
}

export const ascend = {
  /** Find-or-create the canonical profile for a Flow workspace (identity
   *  seam — Flow-first customers get a profile + mapping in the SAME
   *  linkage authority). */
  resolve: (input: { flowSubAccountId: string; businessName?: string; email?: string }) =>
    call<{ ok: boolean; businessProfileId?: number; created?: boolean }>("/api/divinex/resolve", {
      method: "POST",
      body: input,
    }),

  /** Canonical profile read (also the reconcile source). */
  getProfile: (businessProfileId: number) =>
    call<AscendProfileContract>(`/api/divinex/profile/${businessProfileId}`),

  /** The ONE canonical write path — onboarding answers, confirmations,
   *  extracted facts. Ascend merges provenance and auto-publishes. */
  patchProfile: (
    businessProfileId: number,
    body: {
      business?: Record<string, unknown>;
      brandVisual?: Record<string, unknown>;
      brandVoice?: Record<string, unknown>;
      provenance?: Record<string, { status: string; source?: string; confidence?: number }>;
    },
  ) => call<{ ok: boolean }>(`/api/divinex/profile/${businessProfileId}`, { method: "PATCH", body }),

  /** Website brand discovery — extracted facts + candidate assets. */
  discover: (businessProfileId: number, websiteUrl?: string) =>
    call<{ ok: boolean; discovery?: Record<string, unknown>; error?: string }>(
      `/api/divinex/discover/${businessProfileId}`,
      { method: "POST", body: { websiteUrl }, timeoutMs: 90_000 },
    ),

  /** Customer approval/correction of harvested assets. */
  reviewAssets: (
    businessProfileId: number,
    decisions: { id: number; status: "approved" | "rejected"; classification?: string }[],
  ) =>
    call<{ ok: boolean; updated: number }>(`/api/divinex/assets/${businessProfileId}/review`, {
      method: "POST",
      body: { decisions },
    }),

  /** Explicit publish (used after a batch of writes when we want to be sure
   *  the Flow snapshot is current before a reveal/build). */
  publish: (businessProfileId: number) =>
    call<{ ok: boolean; version?: number }>(`/api/divinex/publish/${businessProfileId}`, { method: "POST" }),

  /** Growth intelligence for the reveal (Slice 5). Truthful subset only —
   *  a miss returns ok:false and the reveal degrades honestly. */
  getIntelligence: (businessProfileId: number) =>
    call<Record<string, unknown>>(`/api/divinex/intelligence/${businessProfileId}`),

  /**
   * ASSET STUDIO — generate one of Ascend's mature deliverables (VSL script,
   * ad/social copy, lead magnet, sales script, proposal, content plan, …)
   * for a Flow workspace, WITHOUT the customer leaving unified DivineX.
   *
   * Identity is the workspace: Ascend resolves flowSubAccountId through
   * divinex_workspace_mappings and fails closed when it isn't linked, so
   * tenancy is enforced on the authoritative side, not asserted here.
   *
   * Generation runs Ascend's existing Asset Studio implementation — Flow is
   * a transport, never a second generator. Longer timeout than the other
   * calls because these are 4k-token longform generations.
   */
  generateAsset: (input: { flowSubAccountId: string; assetType: string; prompt?: string }) =>
    call<{
      ok: boolean;
      asset?: {
        id: number;
        assetType: string;
        title: string;
        content: string;
        businessProfileId: number | null;
        createdAt: string;
      };
    }>("/api/divinex/generate-asset", { method: "POST", body: input, timeoutMs: 120_000 }),

  /** The workspace's generated-asset library, for unified Create. Ascend
   *  enforces the same workspace-linkage rule as generation. */
  listAssets: (flowSubAccountId: string) =>
    call<{
      ok: boolean;
      assets?: { id: number; assetType: string; title: string; content: string; source: string | null; createdAt: string }[];
    }>(`/api/divinex/assets-library/${encodeURIComponent(flowSubAccountId)}`),
};

/** The Asset Studio deliverables unified Create exposes. These are Ascend's
 *  OWN asset-type strings — the contract is the string, so this list stays in
 *  sync by matching what the Asset Factory already offers rather than by
 *  redefining the taxonomy in Flow. */
export const ASCEND_ASSET_TYPES = [
  "Offer",
  "Lead Magnet",
  "Lead Magnet Full Draft",
  "Landing Page Copy",
  "Thank You Page Copy",
  "Sales Page Copy",
  "VSL Script",
  "Webinar Script",
  "9-Email Sequence",
  "Sales Call Script",
  "Discovery Call Script",
  "DM Script",
  "Proposal",
  "Content Plan",
  "90-Day Roadmap",
  "Funnel Workflow Map",
] as const;

export type AscendAssetType = (typeof ASCEND_ASSET_TYPES)[number];
