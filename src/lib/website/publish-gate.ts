import "server-only";
import { auditGeneratedContent, type ContentFlag } from "./content-audit";

/**
 * A SITE THAT MAY CONTAIN INVENTED FACTS IS NOT A FINISHED DELIVERABLE.
 *
 * gitpage's generic template fills empty sections with fabricated
 * testimonials, stats and program details (see content-audit.ts). That is a
 * third-party generator we do not control and cannot configure, so the audit
 * is the only lever we have on this path.
 *
 * It used to be advisory: the build went to `ready`, the live URL was shown
 * with the celebratory treatment, and a red banner asked the operator to
 * review before sharing. That makes the warning optional in practice, and
 * optional is not a safety mechanism. A trial prospect generating a site
 * during a demo will read "your site is live", copy the link, and send it.
 *
 * So the audit decides the STATUS. Flags found means `needs_review`: the work
 * is preserved, the URL is retained on the document for correction, and the
 * site is not presented as publish-ready. Clean means `ready` exactly as
 * before.
 *
 * Fail-closed on the unknown case too, but only after retrying. A page that
 * cannot be fetched cannot be certified, and GitHub Pages routinely 404s for
 * a few seconds immediately after a publish, so "cannot fetch yet" asks for
 * one more poll rather than a verdict. Only an audit that never managed to
 * run settles as `needs_review` with an honest reason, because silently
 * promoting an unverifiable page to `ready` is the exact hole this closes.
 */

export type PublishIntegrity =
  | { outcome: "ready"; contentFlags: null; integrityReason: null }
  | { outcome: "needs_review"; contentFlags: ContentFlag[]; integrityReason: "fabricated_content" }
  | { outcome: "needs_review"; contentFlags: null; integrityReason: "unverified" }
  | { outcome: "retry"; contentFlags: null; integrityReason: null };

/**
 * Fetch the published page and decide whether it may be called ready.
 *
 * `canRetry` is false on the final attempt, which turns an unfetchable page
 * from "ask again" into "we could not verify this".
 */
export async function assessPublishedSite(
  liveUrl: string | null | undefined,
  opts: { canRetry: boolean },
): Promise<PublishIntegrity> {
  // No URL at all is not an audit failure; there is nothing to show the
  // customer either, so it cannot be mistaken for a finished deliverable.
  if (!liveUrl) {
    return { outcome: "needs_review", contentFlags: null, integrityReason: "unverified" };
  }

  let html: string | null = null;
  try {
    const res = await fetch(liveUrl, { redirect: "follow" });
    if (res.ok) html = await res.text();
  } catch {
    html = null;
  }

  if (html === null) {
    return opts.canRetry
      ? { outcome: "retry", contentFlags: null, integrityReason: null }
      : { outcome: "needs_review", contentFlags: null, integrityReason: "unverified" };
  }

  const flags = auditGeneratedContent(html);
  if (flags.length > 0) {
    return { outcome: "needs_review", contentFlags: flags, integrityReason: "fabricated_content" };
  }
  return { outcome: "ready", contentFlags: null, integrityReason: null };
}
