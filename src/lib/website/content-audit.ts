/**
 * Post-build content audit for gitpage-generated sites.
 *
 * gitpage's generic (non-niche) local template fills empty sections with
 * invented content when it has nothing real to work with: fabricated
 * testimonials attributed to fictional people (the same names recur across
 * unrelated sites), inflated stat badges ("450K+ Readers", "4.8★ Rating"),
 * fake founder/company origin stories, phantom program infrastructure
 * (video modules, coaching calls, a community forum) for products that are
 * just a book or a PDF, invented media mentions ("As seen in Forbes"),
 * award claims ("#1 rated"), and guarantee language implying a policy that
 * was never actually established. None of this comes from our WebsiteConfig
 * payload — gitpage's generator adds it unconditionally, and there is no
 * config flag to suppress it (confirmed against the full payload schema).
 *
 * This module can't safely auto-rewrite content (a regex match doesn't know
 * what honest replacement text should say), so it only FLAGS FOR HUMAN
 * REVIEW — it never deletes. That framing is why the patterns are broad on
 * purpose: a claim that happens to be TRUE for this operator (they really do
 * have 500+ clients) is still worth surfacing so a human can confirm it's
 * real before the page ships, and gitpage's whole failure mode is inventing
 * exactly these claims when it has nothing real to work with. The website
 * builder UI surfaces a warning banner; a human reviews and edits before
 * sharing the link. See CLAUDE.md "Website builder" section for the fix
 * workflow via gitpage's MCP tools.
 */

export type ContentFlagCategory =
  | "fabricated_social_proof"
  | "fabricated_testimonials"
  | "fabricated_credentials"
  | "fabricated_guarantee"
  | "fabricated_media_mentions"
  | "fabricated_awards"
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
  fabricated_media_mentions: "Press/media mentions ('as seen in …') with no real source",
  fabricated_awards: "Award or ranking claims ('#1 rated', 'award-winning')",
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
    regex:
      /\b\d[\d,]*[KM]\+?\s*(?:readers|customers|clients|users|members|students|families|businesses|downloads|subscribers|happy|served)\b|\b\d[\d,]{2,}\+?\s*(?:happy\s+)?(?:customers|clients|users|members|students|families|businesses|reviews)\b|\b\d\.\d\s*(?:★|stars?\b|\/\s*5\b)|★{4,}|\btrusted by (?:thousands|hundreds|millions|\d)|\bjoin (?:thousands|hundreds|millions|over \d) of\b|\b\d{2,}%\s*(?:satisfaction|success|approval)\b|\b(?:rated|reviewed)\s*\d\.\d\b/i,
  },
  {
    category: "fabricated_testimonials",
    regex:
      /<section[^>]*id=["']testimonials["']|class=["'][^"']*testimonial[^"']*["']|\bwhat (?:our|my) (?:customers|clients|students|readers) say\b|["'”][^"'“”]{15,}["'“”]\s*[—–-]\s*[A-Z][a-z]+\s+[A-Z]\.?(?:,|\s)/i,
  },
  {
    category: "fabricated_credentials",
    regex:
      /\b(?:decades|over \w+ (?:years|decades)|\d{2,}\+?\s*years)\s+of\s+(?:experience|expertise)\b|\b(?:our founder|studied extensively|founded by a (?:collective|group)|world-renowned|internationally recognized|leading expert|industry(?:'s)? (?:leading|foremost))\b/i,
  },
  {
    category: "fabricated_guarantee",
    regex:
      /\bmoney-back guarantee\b|\b(?:100%|full|complete)\s+(?:satisfaction|money-back|refund)\b|\brisk-free\b|\b\d+[- ]day\s+guarantee\b|\bno questions asked\b|\bwe stand behind (?:it|our work) completely\b|\bsatisfaction guaranteed\b/i,
  },
  {
    category: "fabricated_media_mentions",
    regex:
      /\bas seen (?:on|in)\b|\bfeatured (?:on|in)\b\s*(?:the\s+)?(?:forbes|inc\.?|entrepreneur|new york times|nyt|wall street journal|wsj|cnn|nbc|abc|cbs|fox|bbc|techcrunch|business insider|huffpost|usa today)\b|\bfeatured in (?:major|leading|top) (?:media|publications|outlets)\b/i,
  },
  {
    category: "fabricated_awards",
    regex:
      /#\s?1\s+(?:rated|ranked|choice|voted|trusted|best)\b|\baward-winning\b|\bwinner of\b|\bvoted (?:best|#?1|top)\b|\bbest[- ]in[- ]class\b|\b(?:multiple|numerous)\s+awards?\b|\brated #?1\b/i,
  },
  {
    category: "phantom_program_features",
    regex:
      /\b(?:video modules?|coaching calls?|community forum|mentorship network|exclusive job board|certification exam|member(?:'s)? portal|private community|live q\s?&\s?a|bonus modules?|downloadable workbook|weekly (?:group )?calls?|accountability group)\b/i,
  },
];

/** Scans generated site HTML for known gitpage fabrication patterns. Cheap (no LLM call) — a handful of regexes over one page's markup. Flags for human review, never deletes. */
export function auditGeneratedContent(html: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  for (const { category, regex } of PATTERNS) {
    const match = html.match(regex);
    if (!match || match.index === undefined) continue;
    const start = Math.max(0, match.index - 40);
    const excerpt = html
      .slice(start, match.index + 120)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    flags.push({ category, excerpt });
  }
  return flags;
}
