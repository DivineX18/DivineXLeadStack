/**
 * THE HOST A CUSTOMER IS ALLOWED TO SEE.
 *
 * A lead-magnet download link arrived in a real customer's inbox reading
 * `https://flow-growth-scan-staging.onrender.com/api/funnel-asset/…`. Two
 * things were wrong with it and they are independent.
 *
 * The host was the deployment's hosting URL. `NEXT_PUBLIC_APP_URL` is where
 * the app happens to run, which on Render is a `*.onrender.com` name; the
 * brand's own domain is `CUSTOM_BRAND.primaryDomain`. Everything internal
 * can use the former. Anything a lead reads should carry the latter, both
 * because a hosting hostname tells people where their PDF really lives and
 * because an unfamiliar domain in a mail is what a recipient reports as
 * phishing.
 *
 * The link was also FROZEN. It was written into the stored email body when
 * the PDF was uploaded, so the body kept whichever host did the upload for
 * the rest of its life, and changing the env var later fixed nothing. The
 * unsubscribe link never had this problem because it is built at send time.
 * So the host is now re-resolved at send time too, which repairs every email
 * already carrying a hosting URL without anyone re-uploading anything.
 */
import { CUSTOM_BRAND } from "@/config/landing";

/** Hosts that are where the app RUNS, never where a brand lives. */
const PLATFORM_HOST = /(^|\.)(onrender\.com|vercel\.app|netlify\.app|fly\.dev|herokuapp\.com)$/i;

/** The base URL to put in front of a customer. */
export function publicLinkBase(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const brand = (CUSTOM_BRAND.primaryDomain ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  if (configured) {
    let host = "";
    try { host = new URL(configured).hostname; } catch { host = ""; }
    // A real domain that someone deliberately configured wins outright.
    if (host && !PLATFORM_HOST.test(host)) return configured;
  }
  // Either nothing is configured, or what is configured is a hosting URL.
  if (brand) return `https://${brand}`;
  return configured;
}

/**
 * Any asset link in this body, re-pointed at the public base.
 *
 * Matches the path rather than the host, so a link baked in by an older
 * deployment is corrected rather than left alone.
 */
const ASSET_URL = /https?:\/\/[^\s"'<>)\]]*?(\/api\/funnel-asset\/[A-Za-z0-9_-]+)/g;

export function withPublicAssetHost(body: string, base: string = publicLinkBase()): string {
  if (!base) return body;
  return body.replace(ASSET_URL, (_m, path: string) => `${base}${path}`);
}
