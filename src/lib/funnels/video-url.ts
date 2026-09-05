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
    };
  }

  const vm = vimeoId(u);
  if (vm) {
    return { embedUrl: `https://player.vimeo.com/video/${vm}`, provider: "vimeo", normalized: true };
  }

  return { embedUrl: u.toString(), provider: "other", normalized: false };
}
