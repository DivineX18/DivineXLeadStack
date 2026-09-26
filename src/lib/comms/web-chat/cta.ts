import type { WebChatCta } from "@/types/ai";

/**
 * Whitelisted links for the public chat. The model may only NAME a link by id
 * ([[cta id="growth-assessment"]]); the URL always comes from the channel's
 * configured list, so a model that has been talked into anything still cannot
 * emit an arbitrary link. Pure module: no server-only import so it can be unit
 * tested directly.
 */

const CTA_MARKER_RE = /\[\[cta\s+id\s*=\s*"([a-z0-9_-]{1,40})"\s*\]\]/gi;
const MAX_CTAS_PER_REPLY = 2;

export interface ResolvedCta {
  label: string;
  url: string;
}

export function parseCtaMarkers(
  rawText: string,
  ctas: WebChatCta[] | undefined,
): { cleanText: string; ctas: ResolvedCta[] } {
  const byId = new Map((ctas ?? []).map((c) => [c.id.toLowerCase(), c]));
  const out: ResolvedCta[] = [];
  const seen = new Set<string>();
  for (const m of rawText.matchAll(CTA_MARKER_RE)) {
    const id = m[1]!.toLowerCase();
    const cta = byId.get(id);
    if (!cta || seen.has(id)) continue;
    seen.add(id);
    if (out.length < MAX_CTAS_PER_REPLY) out.push({ label: cta.label, url: cta.url });
  }
  const cleanText = rawText.replace(CTA_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanText, ctas: out };
}

/** Validates a configured CTA list: https absolute URLs only, sane ids/labels. */
export function sanitiseCtas(raw: unknown): WebChatCta[] {
  if (!Array.isArray(raw)) return [];
  const out: WebChatCta[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!/^[a-z0-9_-]{1,40}$/.test(id) || !label || seen.has(id)) continue;
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === "https:" && !u.username && !u.password;
    } catch {
      ok = false;
    }
    if (!ok) continue;
    seen.add(id);
    out.push({ id, label, url });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Reduce the (untrusted, client-supplied) page URL to a safe path string for the
 * prompt. Only accepted when its hostname is on the channel's allowlist; the
 * query string and hash are discarded; the character set is restricted so it
 * cannot carry instructions.
 */
export function sanitisePagePath(
  pageUrl: string | null | undefined,
  allowedHosts: string[],
): string | null {
  if (!pageUrl) return null;
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const hosts = allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!hosts.includes(u.hostname.toLowerCase())) return null;
  const path = u.pathname.slice(0, 120);
  return /^[a-zA-Z0-9/_\-.]*$/.test(path) && path.startsWith("/") ? path : null;
}
