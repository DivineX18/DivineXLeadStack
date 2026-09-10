/**
 * Client-side asset upload: check before sending, and never parse an error
 * page as if it were the answer.
 *
 * Both halves come from one live failure. The builder posted an oversized PDF,
 * the platform rejected the body before the route ran and returned an HTML
 * error page, and the client called response.json() on it unconditionally. The
 * operator's upload error read:
 *
 *   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * which says nothing about what went wrong or what to do. The size check
 * means the common case never leaves the browser; the response reader means
 * anything else still produces a sentence a person can act on.
 *
 * Kept free of "server-only" so both upload call sites (the funnel builder and
 * the visual-requirements panel) share exactly one implementation.
 */

/** Mirrors ALLOWED_ASSET_TYPES / MAX_ASSET_BYTES in lib/funnels/assets.ts.
 *  Duplicated deliberately: that module is server-only (it imports the Admin
 *  SDK), and a client-side pre-flight is worth more than avoiding two
 *  constants. The server still enforces both, so a stale copy here can only
 *  ever be over-strict, never permissive. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function describeUploadLimit(): string {
  return `Images (JPEG, PNG, WebP) and PDFs up to ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB.`;
}

/** A human-readable reason this file can't be uploaded, or null if it can. */
export function checkUploadable(file: File): string | null {
  if (!UPLOAD_ACCEPT.includes(file.type)) {
    return `${file.name} is a ${file.type || "file of unknown type"}. ${describeUploadLimit()}`;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name} is ${mb}MB, over the ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB limit. Compress it or split it, then try again.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

export interface UploadedAsset {
  url: string;
  kind?: string;
  assetId?: string;
}

/**
 * POST a file to the funnel asset route and return the parsed result, or
 * throw an Error whose message is worth showing to a person.
 *
 * Reads the body as TEXT first and only then tries to parse it, so a proxy
 * error page, a redirect to the login screen, or a plain-text crash all
 * produce a real explanation instead of a JSON syntax error. Never surfaces
 * the response body itself (it can be a server error page) beyond its status.
 */
export async function uploadFunnelAsset(
  subAccountId: string,
  funnelId: string,
  file: File,
): Promise<UploadedAsset> {
  const rejected = checkUploadable(file);
  if (rejected) throw new Error(rejected);

  const body = new FormData();
  body.append("file", file);

  let res: Response;
  try {
    res = await fetch(`/api/sub-accounts/${subAccountId}/funnels/${funnelId}/assets`, {
      method: "POST",
      body,
    });
  } catch {
    throw new Error("The upload didn't reach the server. Check your connection and try again.");
  }

  type AssetResponse = { url?: string; kind?: string; assetId?: string; error?: string };
  const text = await res.text();
  let parsed: AssetResponse | null;
  try {
    parsed = JSON.parse(text) as AssetResponse;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // An HTML/near-empty body means the request never reached the route, or
    // the route died before it could answer. Name the likely cause rather
    // than echoing markup at the operator.
    if (res.status === 413 || res.status === 502 || res.status === 504) {
      throw new Error(
        `The server rejected this file (${res.status}). It's most likely too large to upload here, even though it's under the stated limit. Try a smaller file.`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Your session expired while uploading. Reload the page and sign in again.");
    }
    throw new Error(`The server returned an unexpected response (${res.status}). The file was not uploaded.`);
  }

  if (!res.ok || !parsed.url) {
    throw new Error(parsed.error ?? `Upload failed (${res.status}).`);
  }
  return { url: parsed.url, kind: parsed.kind, assetId: parsed.assetId };
}
