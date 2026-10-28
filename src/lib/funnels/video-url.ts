/**
 * VIDEO LINK NORMALISATION.
 *
 * Customers paste the URL from their browser's address bar. They should not
 * have to know that an <iframe> needs a different one — asking for a
 * hand-constructed /embed/ URL is a support ticket, not a product.
 *
 * Deliberately conservative: only YouTube and Vimeo are recognised, because
 * those are the two the existing renderer embeds reliably. Anything else is
 * returned unchanged so a link that already works keeps working, and an
 * unsupported host fails visibly rather than being silently mangled.
 */

export type VideoProvider = "youtube" | "vimeo" | "other";

export interface NormalizedVideo {
  /** Ready to use as an iframe src. */
  embedUrl: string;
  provider: VideoProvider;
  /** True when we recognised the link and rewrote it. */
  normalized: boolean;
  /**
   * Bitrupt QA BUG-022 — an operator pasted their own business's plain
   * homepage (https://hunterpest.com) into this field, got only the soft
   * "Using this link as-is. It must be embeddable." note, published anyway,
   * and a real visitor's browser then tried to iframe the live business
   * site and failed (ERR_NAME_NOT_RESOLVED in the network log — the site's
   * own frame-busting/CSP, not a DNS problem, but broken either way).
   * `provider: "other"` legitimately also covers real third-party embed
   * providers this normalizer doesn't special-case (Wistia, Loom, etc.),
   * which this flag must never catch — so it's deliberately narrow: true
   * only for a bare domain root with no path or query at all, which no
   * genuine video-embed URL from any real provider ever looks like, but
   * which is exactly what pasting a homepage by mistake produces.
   */
  looksLikePlainWebsite: boolean;
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (!host.endsWith("youtube.com")) return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/);
  return m ? m[2] : null;
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "player.vimeo.com") {
    const m = u.pathname.match(/^\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  if (host !== "vimeo.com") return null;
  // vimeo.com/123456789 and vimeo.com/channels/x/123456789 both end in the id.
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

export function normalizeVideoUrl(raw: string): NormalizedVideo | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const yt = youtubeId(u);
  if (yt) {
    // Preserve a start time when the customer copied one from the player.
    const t = u.searchParams.get("t") ?? u.searchParams.get("start");
    const start = t ? String(parseInt(t, 10) || 0) : "";
    return {
      embedUrl: `https://www.youtube.com/embed/${yt}${start ? `?start=${start}` : ""}`,
      provider: "youtube",
      normalized: true,
      looksLikePlainWebsite: false,
    };
  }

  const vm = vimeoId(u);
  if (vm) {
    return { embedUrl: `https://player.vimeo.com/video/${vm}`, provider: "vimeo", normalized: true, looksLikePlainWebsite: false };
  }

  // A bare domain root (no path, no query) is what pasting a homepage by
  // mistake produces, never what a real embed URL from any provider looks
  // like. See the field's own doc comment for why this is narrow by design.
  const looksLikePlainWebsite = (u.pathname === "/" || u.pathname === "") && !u.search;
  return { embedUrl: u.toString(), provider: "other", normalized: false, looksLikePlainWebsite };
}
