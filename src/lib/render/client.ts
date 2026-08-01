import "server-only";

/**
 * Render REST API client for custom domains (Funnels — pointing a client's
 * own domain at a page). This deployment runs on Render (confirmed via
 * `render.yaml` + the `x-render-origin-server` response header on
 * production), NOT Vercel — an earlier pass of this feature was built
 * against Vercel's Domains API before that was caught and corrected.
 *
 * API shapes below are taken directly from Render's own API reference
 * (api-docs.render.com/reference/{create,list,retrieve,delete}-custom-domain
 * and /reference/retrieve-service), not guessed.
 */

const API = "https://api.render.com/v1";

export class RenderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RenderError";
    this.status = status;
  }
}

export function renderConfigured(): boolean {
  return (
    !!process.env.RENDER_API_KEY?.trim() && !!process.env.RENDER_SERVICE_ID?.trim()
  );
}

function requireConfig(): { apiKey: string; serviceId: string } {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = process.env.RENDER_SERVICE_ID?.trim();
  if (!apiKey || !serviceId) {
    throw new RenderError(
      "Render is not configured — set RENDER_API_KEY + RENDER_SERVICE_ID.",
    );
  }
  return { apiKey, serviceId };
}

async function renderFetch(path: string, init: RequestInit): Promise<unknown> {
  const { apiKey } = requireConfig();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new RenderError(`Couldn't reach Render: ${(e as Error).message}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body; leave null
  }
  if (!res.ok) {
    const errObj = json as { message?: string } | null;
    const msg = errObj?.message || text || res.statusText;
    throw new RenderError(`Render API ${res.status}: ${msg}`, res.status);
  }
  return json;
}

export interface RenderCustomDomain {
  id: string;
  name: string;
  domainType: "apex" | "subdomain";
  verificationStatus: "verified" | "unverified";
}

/** `POST /services/{serviceId}/custom-domains` */
export async function addServiceCustomDomain(
  domain: string,
): Promise<RenderCustomDomain> {
  const { serviceId } = requireConfig();
  const data = (await renderFetch(`/services/${serviceId}/custom-domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  })) as RenderCustomDomain[] | RenderCustomDomain;
  // Render's docs show the create response as an array; be liberal since
  // some API versions return the object directly.
  return Array.isArray(data) ? data[0] : data;
}

/** `GET /services/{serviceId}/custom-domains/{customDomainIdOrName}` */
export async function getServiceCustomDomain(
  domain: string,
): Promise<RenderCustomDomain | null> {
  const { serviceId } = requireConfig();
  try {
    const data = (await renderFetch(
      `/services/${serviceId}/custom-domains/${encodeURIComponent(domain)}`,
      { method: "GET" },
    )) as RenderCustomDomain;
    return data;
  } catch (e) {
    if (e instanceof RenderError && e.status === 404) return null;
    throw e;
  }
}

/** `DELETE /services/{serviceId}/custom-domains/{customDomainIdOrName}` */
export async function removeServiceCustomDomain(domain: string): Promise<void> {
  const { serviceId } = requireConfig();
  await renderFetch(
    `/services/${serviceId}/custom-domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" },
  );
}

/**
 * The service's own onrender.com hostname (`serviceDetails.url`) — the
 * CNAME target an operator points their subdomain at. Cached per-process
 * (module-level) since it never changes without redeploying to a new
 * service. Returns null on any failure so callers can show a generic
 * fallback instruction rather than throw.
 */
let cachedHostname: string | null = null;
export async function getServiceOnrenderHostname(): Promise<string | null> {
  if (cachedHostname) return cachedHostname;
  try {
    const { serviceId } = requireConfig();
    const data = (await renderFetch(`/services/${serviceId}`, {
      method: "GET",
    })) as { serviceDetails?: { url?: string } };
    const url = data.serviceDetails?.url;
    if (!url) return null;
    cachedHostname = new URL(url).hostname;
    return cachedHostname;
  } catch {
    return null;
  }
}
