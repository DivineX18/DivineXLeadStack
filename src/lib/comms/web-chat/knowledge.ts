import "server-only";

/**
 * Loads the public knowledge file for the web-chat bot from the customer's own
 * website, so the bot's facts are generated from the site's canonical content
 * instead of being copied into a second place that goes stale.
 *
 * SSRF / abuse guards: https only, no credentials, hostname must be one of the
 * channel's allowedDomains, redirects are refused, short timeout, size cap.
 * Successful fetches are cached for 10 minutes per instance; if a refresh
 * fails the last good copy is served, and with no copy the bot simply has no
 * knowledge block (its rules then tell it to say it doesn't know).
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_CHARS = 24_000;
const cache = new Map<string, { at: number; text: string }>();

function hostOf(entry: string): string {
  const t = entry.trim().toLowerCase();
  try {
    return t.includes("://") ? new URL(t).hostname : t.split("/")[0]!.split(":")[0]!;
  } catch {
    return t;
  }
}

export function knowledgeUrlAllowed(rawUrl: string, allowedDomains: string[]): URL | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const allowed = allowedDomains.map(hostOf).filter(Boolean);
  return allowed.includes(u.hostname.toLowerCase()) ? u : null;
}

export async function loadKnowledge(
  rawUrl: string | undefined,
  allowedDomains: string[],
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!rawUrl) return null;
  const url = knowledgeUrlAllowed(rawUrl, allowedDomains);
  if (!url) return null;

  const key = url.toString();
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < TTL_MS) return hit.text;

  try {
    const res = await fetch(key, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "text/plain, text/markdown;q=0.9" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^text\//i.test(type)) throw new Error(`bad response ${res.status} ${type}`);
    const text = (await res.text()).slice(0, MAX_CHARS).trim();
    if (!text) throw new Error("empty");
    cache.set(key, { at: nowMs, text });
    return text;
  } catch (err) {
    console.warn(`[web-chat/knowledge] fetch failed for ${url.hostname}:`, err instanceof Error ? err.message : err);
    return hit?.text ?? null;
  }
}

/** Test hook. */
export function _clearKnowledgeCache(): void {
  cache.clear();
}
