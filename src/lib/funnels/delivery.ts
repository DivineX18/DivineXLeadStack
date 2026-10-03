/**
 * HOW A PROMISED DELIVERABLE REACHES THE PERSON WHO ASKED FOR IT.
 *
 * One place decides, for every kind of asset, what the email's button says
 * and where it points. Before this, delivery meant one thing (a PDF link
 * worded "Download your copy") and the wording was written at the call site,
 * so any second kind of deliverable would have arrived describing itself
 * wrongly, with no obvious place to fix it.
 *
 * THE IDENTITY RULE, which is what makes this durable: a deliverable is
 * identified by its ASSET ID, never by where its bytes happen to sit. An
 * uploaded PDF and a hosted video are the same kind of thing here, a
 * `funnelAssets` document with an unguessable id; only the way the bytes are
 * reached differs. So a deployment move, a storage change, or swapping the
 * file behind a deliverable cannot invalidate an automation that was
 * configured months earlier, because the automation refers to the identity
 * and the host is resolved when the mail is sent.
 *
 * WHY VIDEO AND AUDIO ARE REFERENCED RATHER THAN UPLOADED: uploads are
 * stored chunked in Firestore behind a MEASURED 5MB request-body ceiling
 * (see assets.ts). That is comfortable for a PDF and impossible for video.
 * Rather than taking on a storage product, a video or audio deliverable
 * records where it already lives and is PLAYED on a branded page here, so
 * the recipient never sees the provider's URL.
 */

export type DeliveryKind = "pdf" | "video" | "audio" | "file";

/** The asset kinds that are reached by playing rather than downloading. */
const PLAYED: ReadonlySet<DeliveryKind> = new Set<DeliveryKind>(["video", "audio"]);

export function isPlayableKind(kind: string | null | undefined): boolean {
  return PLAYED.has(kind as DeliveryKind);
}

/**
 * What a deliverable of this kind should call itself.
 *
 * A default, not a rule: the operator's own label always wins, because they
 * know what they promised on the page better than a content type does.
 */
export function defaultCtaLabel(kind: DeliveryKind | string | null | undefined): string {
  switch (kind) {
    case "pdf":
      return "Download your copy";
    case "video":
      return "Watch video";
    case "audio":
      return "Listen now";
    default:
      return "Access your file";
  }
}

/** The kind implied by an uploaded file's content type. */
export function kindForContentType(contentType: string | null | undefined): DeliveryKind {
  const t = (contentType ?? "").toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * The path a recipient follows, relative to whatever the branded base is.
 *
 * Downloadables go straight to the delivery route, which streams the bytes.
 * Video and audio go to the branded player, because sending someone to the
 * raw file would both look like nothing and, for a referenced asset, show
 * them the provider's address.
 */
export function deliveryPathFor(assetId: string, kind: DeliveryKind | string | null | undefined): string {
  return isPlayableKind(kind) ? `/d/${assetId}` : `/api/funnel-asset/${assetId}`;
}

/** Every path shape this module hands to a recipient, for send-time repair. */
export const DELIVERY_PATH_RE = /\/(?:api\/funnel-asset|d)\/[A-Za-z0-9_-]+/;
