import {
  MAX_ASSET_BYTES,
  MAX_AUDIO_DIRECT_BYTES,
  AUDIO_MIME_TYPES,
} from "./asset-limits";

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

/** The limits now live in lib/funnels/asset-limits.ts, which both sides
 *  import. They used to be copied here because assets.ts is server-only,
 *  and the copy went stale: it still said 5MB after the real ceiling was
 *  measured at ~4.5MB, so the pre-flight passed files the platform refused.
 *  One definition means the check the customer sees cannot drift from the
 *  one that enforces. */
export const UPLOAD_MAX_BYTES = MAX_ASSET_BYTES;
export const UPLOAD_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const UPLOAD_KIND_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
};

/**
 * Bitrupt QA BUG-040 — the rejection message interpolated `file.type` raw, so
 * refusing a GIF read "logo.gif is a image/gif." That is the browser's
 * internal identifier, not a thing a person calls a file, and the article in
 * front of it was wrong half the time too.
 *
 * Order matters here. The MIME table is consulted FIRST, because that is what
 * the check actually rejected on; the extension is only a fallback, for the
 * two cases the table cannot answer — a type with no friendly name, and an
 * empty `file.type`, which browsers hand over for anything they do not
 * recognise. Leading with the extension instead would let a file named
 * `.jpg` be described as a JPEG while being refused for being something else.
 */
const FALLBACK_TYPE_LABELS: Record<string, string> = {
  gif: "GIF",
  svg: "SVG",
  heic: "HEIC",
  heif: "HEIF",
  bmp: "BMP",
  tiff: "TIFF",
  tif: "TIFF",
  avif: "AVIF",
  ico: "icon",
  mp4: "video",
  mov: "video",
  webm: "video",
  avi: "video",
  doc: "Word document",
  docx: "Word document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ppt: "slide deck",
  pptx: "slide deck",
  zip: "ZIP archive",
  txt: "text file",
  csv: "CSV file",
};

/**
 * "a SVG" was the first version of this, which is the same defect BUG-040
 * was — a message that reads wrong — one layer down. An acronym is read out
 * letter by letter, and S, F, H, L, M, N, R and X all begin with a vowel
 * sound when you say them, so they take "an": an SVG, an HEIC, an MP3. The
 * spelling of the first letter is not the question; how it is pronounced is.
 */
function articleFor(label: string): "a" | "an" {
  if (/^[aeiou]/i.test(label)) return "an";
  if (/^[A-Z]{2,}/.test(label) && "FHLMNRSX".includes(label[0]!)) return "an";
  return "a";
}

export function describeFileType(file: Pick<File, "name" | "type">): string {
  const known = UPLOAD_KIND_LABELS[file.type];
  if (known) return `${articleFor(known)} ${known}`;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const byExt = FALLBACK_TYPE_LABELS[ext];
  if (byExt) return `${articleFor(byExt)} ${byExt}`;
  // Still nothing recognisable: name the extension rather than the MIME type.
  // "a .psd file" tells the operator which file they picked; "application/
  // octet-stream" tells them nothing they can act on.
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return `a .${ext} file`;
  return "a file of a type we don't accept";
}

export function describeUploadLimit(allowedTypes: readonly string[] = UPLOAD_ACCEPT): string {
  const imageTypes = allowedTypes.filter((t) => t in UPLOAD_KIND_LABELS && t !== "application/pdf");
  const hasPdf = allowedTypes.includes("application/pdf");
  const hasAudio = allowedTypes.some((t) => (AUDIO_MIME_TYPES as readonly string[]).includes(t));
  const parts: string[] = [];
  if (imageTypes.length > 0) {
    const label = imageTypes.map((t) => UPLOAD_KIND_LABELS[t]).join(", ");
    parts.push(`Images (${label})${hasPdf ? " and PDFs" : ""} up to ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB`);
  } else if (hasPdf) {
    parts.push(`PDFs up to ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB`);
  }
  if (hasAudio) parts.push(`audio (MP3, M4A, WAV) up to ${Math.round(MAX_AUDIO_DIRECT_BYTES / 1024 / 1024)}MB`);
  return `${parts.join(", or ")}.`;
}

/**
 * Bitrupt QA BUG-017 — the Visual Requirements Panel's file input declares
 * `accept="image/jpeg,image/png,image/webp"`, but that attribute is only a
 * hint to the OS file picker: drag-and-drop or an explicit "All Files"
 * choice bypasses it entirely in every browser. The real gate was this
 * function, and it used the SAME broad UPLOAD_ACCEPT list the main "Upload
 * image, PDF or audio" lead-magnet button needs (that one legitimately
 * accepts PDFs) — so a PDF dragged into an image-only slot sailed through
 * validation and got attached as if it were a photo, producing a broken
 * render on the canvas. `allowedTypes` lets a narrower call site (an
 * image-only slot) restrict the check without touching the lead-magnet
 * button's own broader default.
 */
export function checkUploadable(file: File, allowedTypes: readonly string[] = UPLOAD_ACCEPT): string | null {
  // Audio has its own, much larger ceiling because it does not travel
  // through the server. See uploadFunnelAudioDirect below. Only reachable
  // for a call site whose allowed-types list includes an audio MIME type.
  if ((AUDIO_MIME_TYPES as readonly string[]).includes(file.type) && allowedTypes.includes(file.type)) {
    if (file.size === 0) return `${file.name} is empty.`;
    if (file.size > MAX_AUDIO_DIRECT_BYTES) {
      return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB, over the ${Math.round(MAX_AUDIO_DIRECT_BYTES / 1024 / 1024)}MB limit for audio.`;
    }
    return null;
  }
  if (!allowedTypes.includes(file.type)) {
    return `${file.name} is ${describeFileType(file)}. ${describeUploadLimit(allowedTypes)}`;
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
  allowedTypes: readonly string[] = UPLOAD_ACCEPT,
): Promise<UploadedAsset> {
  const rejected = checkUploadable(file, allowedTypes);
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


/**
 * Upload audio straight to storage, bypassing this app's request limit.
 *
 * Three steps, because the bytes must not pass through the server: ask for
 * a signed URL, PUT the file to it, then tell the server what landed so it
 * can verify and register it. The customer sees one "Uploading..." state.
 */
export async function uploadFunnelAudioDirect(
  subAccountId: string,
  funnelId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadedAsset> {
  const rejected = checkUploadable(file);
  if (rejected) throw new Error(rejected);

  const base = `/api/sub-accounts/${subAccountId}/funnels/${funnelId}/assets/direct`;
  const readError = async (res: Response, fallback: string) => {
    const text = await res.text();
    try { return (JSON.parse(text) as { error?: string }).error ?? fallback; } catch { return fallback; }
  };

  const mintRes = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
  });
  if (!mintRes.ok) throw new Error(await readError(mintRes, `Could not start the upload (${mintRes.status}).`));
  const { assetId, uploadUrl } = (await mintRes.json()) as { assetId: string; uploadUrl: string };

  // XHR rather than fetch: this is the one upload long enough that a
  // progress bar matters, and fetch cannot report request progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`The upload was rejected by storage (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("The upload didn't reach storage. Check your connection and try again."));
    xhr.send(file);
  });

  const doneRes = await fetch(base, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, filename: file.name, title: file.name.replace(/\.[^.]+$/, "") }),
  });
  if (!doneRes.ok) throw new Error(await readError(doneRes, `The upload could not be completed (${doneRes.status}).`));
  const done = (await doneRes.json()) as { url: string; kind?: string; assetId?: string };
  return { url: done.url, kind: done.kind, assetId: done.assetId };
}
