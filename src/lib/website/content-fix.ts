import "server-only";

import {
  findPageIdForJob,
  readSiteFile,
  editSiteFile,
  validateDraft,
  publishDraft,
  GitpageMcpError,
} from "@/lib/gitpage/mcp-client";
import type { WebsiteTestimonial } from "@/types/website";

/** BUG-011 remediation. The `fabricated_testimonials` flag previously had no
 *  fix path at all short of hand-editing raw HTML in gitpage's own
 *  dashboard (see CLAUDE.md's "Content-fabrication guardrail" section) —
 *  this is that fix path, built in-app. Two outcomes an operator can choose:
 *    - "apply": splice their own real quotes into the published page,
 *      replacing gitpage's invented ones.
 *    - "remove": the operator has no real testimonials yet — strip the
 *      section entirely rather than ship a fabricated one.
 *  Both run the full MCP edit cycle (read -> edit -> validate -> publish),
 *  then re-run the audit against the freshly published HTML so the
 *  WebsiteDoc's contentFlags reflect reality rather than being hand-cleared. */

export class ContentFixError extends Error {}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Depth-aware extraction of a `<section ... id="testimonials" ...> ... </section>`
 *  block, matching nested `<section>` tags so an inner section inside the
 *  testimonials block (unlikely, but not provably absent) doesn't truncate
 *  the match early. Returns null — never a guess — when the structure isn't
 *  the shape content-audit.ts's own pattern says gitpage emits, so a
 *  low-confidence locate can't corrupt a live published page. */
function locateTestimonialsSection(html: string): { start: number; end: number } | null {
  const openTagRe = /<section\b[^>]*\bid=["']testimonials["'][^>]*>/i;
  const openMatch = html.match(openTagRe);
  if (!openMatch || openMatch.index === undefined) return null;

  const start = openMatch.index;
  const sectionTagRe = /<\/?section\b[^>]*>/gi;
  sectionTagRe.lastIndex = start + openMatch[0].length;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = sectionTagRe.exec(html)) !== null) {
    const isClose = m[0].startsWith("</");
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return { start, end: m.index + m[0].length };
    }
  }
  return null;
}

function renderTestimonialsSection(items: WebsiteTestimonial[]): string {
  const cards = items
    .map(
      (t) => `<div class="testimonial-card">
      <p class="testimonial-quote">&ldquo;${escapeHtml(t.quote.trim())}&rdquo;</p>
      <p class="testimonial-author">${escapeHtml(t.name.trim())}${t.detail?.trim() ? `, ${escapeHtml(t.detail.trim())}` : ""}</p>
    </div>`,
    )
    .join("\n    ");
  return `<section id="testimonials">
    <div class="testimonials-grid">
    ${cards}
    </div>
  </section>`;
}

export interface ApplyFixResult {
  liveUrl: string;
}

/**
 * @param action "apply" splices `testimonials` in (must be non-empty);
 *               "remove" deletes the section outright (ignores `testimonials`).
 */
export async function fixFabricatedTestimonials(
  gitpageJobId: string,
  action: "apply" | "remove",
  testimonials: WebsiteTestimonial[],
  liveUrl?: string,
): Promise<ApplyFixResult> {
  if (action === "apply" && testimonials.length === 0) {
    throw new ContentFixError("No testimonials supplied — add at least one real quote, or choose Remove instead.");
  }

  // See findPageIdForJob's own comment: the direct formResponseId match
  // doesn't reflect how gitpage's list_sites actually identifies a site in
  // practice, so the published URL's own path segment (gitpage's own repo
  // name) is passed as a grounded fallback rather than guessing at it.
  const liveUrlSlug = liveUrl ? liveUrl.replace(/\/+$/, "").split("/").pop() : undefined;
  const lookup = await findPageIdForJob(gitpageJobId, liveUrlSlug);
  if (!lookup.pageId) {
    throw new ContentFixError(
      "Couldn't find this site in gitpage. It may still be mid-build, or the job id is stale. " +
        `(list_sites returned ${lookup.totalSites} site(s); looked for job "${gitpageJobId}"` +
        `${liveUrlSlug ? ` / repo "${liveUrlSlug}"` : ""}; sample names: ${lookup.sampleRepoNames.join(", ") || "none"})`,
    );
  }
  const pageId = lookup.pageId;

  const { content: html } = await readSiteFile(pageId, "index.html");
  const bounds = locateTestimonialsSection(html);
  if (!bounds) {
    throw new ContentFixError(
      "Couldn't locate a recognizable testimonials section in the published page — it may use a layout this tool doesn't recognize yet. Edit it directly in gitpage's dashboard.",
    );
  }

  const oldString = html.slice(bounds.start, bounds.end);
  const newString = action === "remove" ? "" : renderTestimonialsSection(testimonials);

  try {
    await editSiteFile(pageId, "index.html", { old_string: oldString, new_string: newString });
    const validation = await validateDraft(pageId);
    if (!validation.valid) {
      throw new ContentFixError(
        `The edit produced an invalid page (${validation.errors?.join("; ") || "unknown validation error"}) — nothing was published.`,
      );
    }
    const published = await publishDraft(pageId);
    // Re-auditing the freshly published page (rather than trusting that this
    // edit cleared every pattern — the operator's own quote text could trip
    // the stats/guarantee patterns too) is the caller's job via
    // assessPublishedSite(), the same function every build settles through.
    // Duplicating that fetch-and-audit logic here would be the second place
    // this codebase decides "is this page clean" — exactly the drift this
    // module's own design note elsewhere warns about.
    return { liveUrl: published.liveUrl };
  } catch (err) {
    if (err instanceof ContentFixError) throw err;
    if (err instanceof GitpageMcpError) {
      throw new ContentFixError(`gitpage couldn't apply the fix: ${err.message}`);
    }
    throw err;
  }
}
