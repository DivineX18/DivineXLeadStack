/**
 * Post-build content audit for gitpage-generated sites.
 *
 * gitpage's generic (non-niche) local template fills empty sections with
 * invented content when it has nothing real to work with: fabricated
 * testimonials attributed to fictional people (the same names recur across
 * unrelated sites), inflated stat badges ("450K+ Readers", "4.8★ Rating"),
 * fake founder/company origin stories, phantom program infrastructure
 * (video modules, coaching calls, a community forum) for products that are
 * just a book or a PDF, and guarantee language implying a policy that was
 * never actually established. None of this comes from our WebsiteConfig
 * payload — gitpage's generator adds it unconditionally, and there is no
 * config flag to suppress it (confirmed against the full payload schema).
 *
 * This module can't safely auto-rewrite content (a regex match doesn't know
 * what honest replacement text should say), so it only flags. The website
 * builder UI surfaces a warning banner; a human reviews and edits before
 * sharing the link. See CLAUDE.md "Website builder" section for the fix
 * workflow via gitpage's MCP tools.
 */

export type ContentFlagCategory =
  | "fabricated_social_proof"
  | "fabricated_testimonials"
  | "fabricated_credentials"
  | "fabricated_guarantee"
  | "phantom_program_features";

export interface ContentFlag {
  category: ContentFlagCategory;
  /** Short snippet of the matched text, for the operator to recognize the spot. */
  excerpt: string;
}

const CATEGORY_LABELS: Record<ContentFlagCategory, string> = {
  fabricated_social_proof: "Inflated stats or customer-count claims",
  fabricated_testimonials: "A testimonials/reviews section (often reused fake names)",
  fabricated_credentials: "Invented founder/author credentials",
  fabricated_guarantee: "Guarantee or refund language implying a real policy",
  phantom_program_features: "References to a course/program that doesn't exist for this product",
};

export function contentFlagCategoryLabel(category: ContentFlagCategory): string {
  return CATEGORY_LABELS[category];
}

interface Pattern {
  category: ContentFlagCategory;
  regex: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    category: "fabricated_social_proof",
    regex: /\b\d+[KM]\+\b|\b\d\.\d★|\btrusted by (?:thousands|hundreds)\b|\bjoin (?:thousands|hundreds) of\b/i,
  },
  {
    category: "fabricated_testimonials",
    regex: /<section[^>]*id=["']testimonials["']|class=["']testimonial-card["']/i,
  },
  {
    category: "fabricated_credentials",
    regex: /\b(?:decades|over \w+ (?:years|decades)) of\b[^.]{0,120}\b(?:our founder|studied extensively|founded by a (?:collective|group))\b/i,
  },
  {
    category: "fabricated_guarantee",
    regex: /\bmoney-back guarantee\b|\bwe stand behind it completely\b|\bwe want to know about it\b/i,
  },
  {
    category: "phantom_program_features",
    regex: /\b(?:video modules|coaching calls?|community forum|mentorship network|exclusive job board|certification exam)\b/i,
  },
];

/** Scans generated site HTML for known gitpage fabrication patterns. Cheap (no LLM call) — a handful of regexes over one page's markup. */
export function auditGeneratedContent(html: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  for (const { category, regex } of PATTERNS) {
    const match = html.match(regex);
    if (!match || match.index === undefined) continue;
    const start = Math.max(0, match.index - 40);
    const excerpt = html
      .slice(start, match.index + 120)
      .replace(/\s+/g, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
    flags.push({ category, excerpt });
  }
  return flags;
}
