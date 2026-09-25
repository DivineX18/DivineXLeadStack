import "server-only";

import { headers } from "next/headers";
import { CUSTOM_BRAND } from "@/config/landing";

/**
 * WHICH SITE IS THIS, ON THIS REQUEST?
 *
 * One deployment answers on more than one hostname: Flow on crm.divinex.io
 * and Ascend on app.divinex.io, served by the same Next.js app. Every piece
 * of host-dependent SEO was pinned to a single environment variable, so the
 * consequences compounded:
 *
 *   - Not one page emitted a canonical tag, while both hosts served the same
 *     pages. To a crawler that is two complete copies of the marketing site
 *     competing with each other, and the one that wins is not ours to pick.
 *   - app.divinex.io/robots.txt advertised crm.divinex.io/sitemap.xml, and
 *     that sitemap listed crm URLs. The Ascend host had no sitemap of its own
 *     and pointed every crawler at the other brand.
 *
 * So the host is read from the request, exactly as resolveProductSurface()
 * already does for branding, and everything downstream follows from it.
 *
 * THE HOST HEADER IS ATTACKER-CONTROLLED, so it is checked against a list of
 * hostnames this deployment actually answers on. A canonical tag built from
 * an unvalidated Host header lets anyone who can reach the origin point our
 * canonical at a domain they own, which hands them the ranking. An unknown
 * host falls back to the configured URL rather than trusting what it was
 * handed.
 */

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** The configured public URL, used as the fallback and for the allowlist. */
export function configuredSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return `https://${CUSTOM_BRAND.primaryDomain}`;
}

/** Hostnames this deployment legitimately answers on. */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const candidate of [
    configuredSiteUrl(),
    process.env.NEXT_PUBLIC_ASCEND_APP_URL,
    `https://${CUSTOM_BRAND.primaryDomain}`,
  ]) {
    const h = hostOf(candidate);
    if (h) hosts.add(h);
  }
  return hosts;
}

/**
 * The origin to build absolute URLs from on THIS request. Falls back to the
 * configured URL for an unrecognised host, and never to the raw header.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const host = forwarded.split(",")[0].trim().toLowerCase();
  if (!host) return configuredSiteUrl();
  // Local development is not a public host, but it must still produce working
  // absolute URLs rather than silently claiming to be production.
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  if (!allowedHosts().has(host)) return configuredSiteUrl();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
  return `${proto}://${host}`;
}

/** Absolute, canonical URL for a path on the current host. */
export async function canonicalFor(path = "/"): Promise<string> {
  const origin = await siteOrigin();
  if (!path || path === "/") return `${origin}/`;
  const clean = `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return `${origin}${clean}`;
}

/**
 * Metadata fragment to spread into any public page's `generateMetadata`.
 * Sets BOTH the canonical and og:url, which have to agree: a canonical
 * pointing at one host while og:url points at the other is the same
 * duplicate-content problem wearing a different hat.
 */
export async function canonicalMetadata(path = "/"): Promise<{
  metadataBase: URL;
  alternates: { canonical: string };
  openGraph: { url: string };
}> {
  const origin = await siteOrigin();
  const url = await canonicalFor(path);
  return {
    metadataBase: new URL(origin),
    alternates: { canonical: url },
    openGraph: { url },
  };
}
