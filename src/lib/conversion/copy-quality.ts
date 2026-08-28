/**
 * Funnel Copy Quality Engine (Conversion Engine, P1 — Milestone 4).
 *
 * The deterministic EVALUATE half of the generate → evaluate → rewrite loop
 * (mandate Phase 11) plus the copy-side anti-fabrication scan (Phase 12). Pure,
 * no LLM: it walks a funnel's section copy and flags
 *   - generic filler (banned buzzwords the copy could be pasted onto any
 *     competitor's page),
 *   - likely fabrication (invented stats / social-proof counts / ungrounded
 *     guarantee claims — the integrity red flags),
 *   - vague CTAs ("Submit", "Learn more"),
 *   - name-swap-generic headlines (true if the business name were swapped out),
 * and produces a 0-100 heuristic score + a weak-section list.
 *
 * Deterministic detection can't WRITE the honest replacement (that needs the
 * LLM rewrite pass, grounded in the real strategy — a later milestone). Like
 * the gitpage content-audit, this FLAGS for rewrite/review; it never fabricates
 * a fix. Precision-favoured over recall: it flags the clearly-wrong so its
 * signal stays trustworthy rather than noisy.
 *
 * Pure + dependency-light (only a type import) so it can run inside
 * create_funnel's execute (attach a report / gate a publish), in a script, or
 * on the client.
 */

import type { FunnelSectionType } from "@/types/funnels";

export type CopyIssueKind =
  | "generic_filler"
  | "possible_fabrication"
  | "name_swap_generic"
  | "vague_cta"
  | "weak_headline";

export type CopyIssueSeverity = "high" | "medium" | "low";

export interface CopyIssue {
  kind: CopyIssueKind;
  severity: CopyIssueSeverity;
  /** Section the issue was found in (e.g. "hero"). */
  sectionType: string;
  /** The config field path, e.g. "headline" or "bullets[1]". */
  field: string;
  /** The offending text (trimmed/capped for display). */
  excerpt: string;
  /** One line: what's wrong + why it matters. */
  note: string;
}

export interface CopyQualityReport {
  /** 0-100 heuristic quality score. NOT a conversion-rate prediction. */
  score: number;
  issues: CopyIssue[];
  /** Distinct section types carrying a high-severity (or repeated) issue. */
  weakSectionTypes: string[];
  /** How many copy fields were actually evaluated. */
  fieldsChecked: number;
}

/** Buzzwords that make copy generic — aligned with create_funnel's own ban
 *  list so the evaluator and the generator agree on what "filler" means. */
const BANNED_BUZZWORDS = [
  "unlock your potential", "unlock", "elevate", "seamless", "seamlessly", "revolutionize",
  "revolutionary", "empower", "unparalleled", "cutting-edge", "cutting edge", "game-changing",
  "game changing", "game-changer", "next-level", "next level", "world-class", "world class",
  "unleash", "supercharge", "effortless", "effortlessly", "holistic", "robust", "dynamic",
  "tailored", "transformative", "comprehensive", "best-in-class", "state-of-the-art",
  "turnkey", "paradigm", "synergy",
];

/** Ultra-generic headline shells that survive a business-name swap unchanged. */
const NAME_SWAP_PATTERNS: RegExp[] = [
  /grow your business/i,
  /transform your (life|business|results)/i,
  /take .{0,20} to the next level/i,
  /unlock your potential/i,
  /achieve your (goals|dreams)/i,
  /reach your (full )?potential/i,
  /your (success|growth) starts here/i,
  /the (smart|better|easy) way to/i,
];

/** CTA labels that state mechanics instead of an outcome. */
const VAGUE_CTAS = new Set([
  "submit", "learn more", "click here", "read more", "continue", "next", "go", "sign up", "get started",
]);

/** Likely-fabrication signals in generated copy (see note per pattern). */
const FABRICATION = [
  // Invented social-proof COUNTS — the clearest integrity red flag. Matches a
  // sizeable number (3+ digits, or any number with a "+") within a couple of
  // words of a people/usage noun, so "10,000+ happy customers" and "500+
  // satisfied clients" are caught, not just "500 customers". A bare small
  // literal ("3 clients") is left alone to keep the HIGH signal precise.
  { re: /\b(?:\d[\d,]{2,}\+?|\d+\+)\s*(?:[a-z]+\s+){0,2}(customers|clients|users|members|businesses|companies|people|students|patients|families|subscribers|downloads|reviews)\b/i, severity: "high" as const, note: "Looks like an invented customer/usage count — only use real, supplied numbers." },
  // Star ratings.
  { re: /\b\d(\.\d)?\s?(?:\/\s?5\s?)?(?:star|stars|★)\b/i, severity: "medium" as const, note: "Star-rating claim — must be a real, verifiable rating, not generated." },
  // Bare statistic percentages (excluding pricing discounts, handled below).
  { re: /\b\d{1,3}(\.\d+)?\s?%/, severity: "medium" as const, note: "Percentage/statistic claim — verify it's a real, sourced number, not fabricated." },
  // Unverified authority/proof phrases.
  { re: /\b(as seen (on|in)|featured (on|in)|trusted by|voted (the )?(#?1|best|number one))\b/i, severity: "medium" as const, note: "Unverified proof/authority claim — only include if genuinely true and supplied." },
  // Guarantee/refund claims — elevated to HIGH after the 10-customer stress
  // test shipped an invented "7-day money-back guarantee" on a page whose
  // brief explicitly supplied none. A fabricated refund promise is a legal
  // commitment the business never made; it must trip the review flag.
  { re: /\b(100%\s?guarantee|guaranteed results|money[- ]back guarantee|full refund|we(?:'ll| will)? refund)\b/i, severity: "high" as const, note: "Guarantee/refund claim — only state a guarantee the business actually offers, with terms." },
  // Legal/organizational status — tax-deductibility, charity registration,
  // licensure. Invented org status is a compliance violation, not weak copy.
  { re: /\b(tax[- ]deductible|501\s?\(?c\)?\s?\(?3\)?|registered (?:charity|nonprofit)|licensed (?:and|&) insured)\b/i, severity: "high" as const, note: "Legal/organizational status claim — only include if the business actually stated it." },
  // Clinical/professional endorsement claims.
  { re: /\b(dermatologist|clinically|doctor|physician|fda)[- ](tested|approved|recommended|endorsed)\b/i, severity: "high" as const, note: "Clinical/professional endorsement — only include if genuinely supplied by the business." },
  // Invented capacity/scarcity mechanics (cohort caps, application windows).
  { re: /\b(only \d+ (?:spots|seats|places|openings)|\d+ (?:participants|spots|seats|clients) maximum|one application per (?:quarter|month|year)|limited (?:spots|seats|availability))\b/i, severity: "high" as const, note: "Capacity/scarcity claim — never invent caps or windows the business didn't state." },
  // Invented impact ratios ("$25/month funds one child's program").
  { re: /\$\d+(?:\/(?:mo|month))?\s+(?:funds|provides|feeds|educates|sponsors|buys)\s+(?:one|a|an|\d+)\b/i, severity: "high" as const, note: "Impact-ratio claim — only use a real, supplied program figure." },
];

/** Config keys that never hold marketing copy — skipped during extraction. */
const NON_COPY_KEY = /(^|[._])(url|href|src|id|ids|color|colors|slug|token|provider|position|layout|style|mediatype|formid|accent|theme|align|variant|icon|type|sid|phone|email|interval|amount|price|cents|count|order|index|width|height|target|platform|status|kind|role|mode|font|radius|gradient)([._]|$)/i;

function looksNonCopyValue(v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) return true; // URL
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true; // hex color
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return true; // uuid
  if (/^\+?\d[\d\s()-]{6,}$/.test(s)) return true; // phone
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return true; // snake_case enum token
  if (!/\s/.test(s) && s.length < 4) return true; // tiny single token
  return false;
}

/** Recursively collect copy-bearing strings from a section config. */
function collectCopy(value: unknown, keyPath: string, out: { field: string; text: string }[]): void {
  if (typeof value === "string") {
    if (!NON_COPY_KEY.test(keyPath) && !looksNonCopyValue(value)) out.push({ field: keyPath, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectCopy(v, `${keyPath}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectCopy(v, keyPath ? `${keyPath}.${k}` : k, out);
    }
  }
}

const SEVERITY_PENALTY: Record<CopyIssueSeverity, number> = { high: 18, medium: 8, low: 3 };

function excerpt(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}

function isCtaField(field: string): boolean {
  return /(^|\.)cta|label$|buttontext|button_text/i.test(field);
}

/** Headline-bearing fields (hero + section headers) — the fields the
 *  headline laws below apply to. */
function isHeadlineField(field: string): boolean {
  return /(^|\.)(headline|problemheadline|solutionheadline)$/i.test(field);
}

/** Unreplaced template placeholders — "Serving Phoenix Since [YEAR]" shipped
 *  live in the 10-customer stress test. A bracketed ALL-CAPS token is never
 *  legitimate copy; treated as high-severity so the review flag trips. */
const TEMPLATE_PLACEHOLDER = /\[(?:[A-Z][A-Z0-9 _-]{0,14})\]/;

/** Negative/objection words that must never appear in a HEADLINE — naming
 *  the fear you're dispelling plants it ("Without the Dread", "Isn't a
 *  Gimmick", "Not a Scam"). The pain belongs in problem-section BODY copy,
 *  voiced as the prospect's own words — never in the promise line. */
const HEADLINE_NEGATIVES = /\b(dread|gimmick|scam|ripoff|rip-off|not a (?:scam|gimmick|trick)|isn't a (?:scam|gimmick|trick)|without the (?:fear|dread|pain|anxiety))\b/i;

/** Booking-verb openers — "Schedule Your Technical Evaluation", "Book Your
 *  First Visit". The imperative ask is the BUTTON's job; a headline that
 *  opens with it says nothing about the offer's value. */
const BOOKING_VERB_OPENER = /^(schedule|book|request|register|claim|apply|sign up|get started|start|find out|discover|learn|download|take) (your|a|an|the|for|my|now|what|which|how|why)\b/i;

function evaluateField(sectionType: string, field: string, text: string, issues: CopyIssue[]): void {
  const lower = text.toLowerCase();

  // Unreplaced template placeholder — always a shipping bug.
  if (TEMPLATE_PLACEHOLDER.test(text)) {
    issues.push({ kind: "possible_fabrication", severity: "high", sectionType, field, excerpt: excerpt(text), note: "Unreplaced template placeholder (e.g. [YEAR]) — fill in the real fact or delete the claim." });
  }

  // Headline laws (hero headline + section headers only).
  if (isHeadlineField(field)) {
    if (BOOKING_VERB_OPENER.test(text.trim())) {
      issues.push({ kind: "weak_headline", severity: "medium", sectionType, field, excerpt: excerpt(text), note: "Headline opens with the booking action — that's the button's job. Lead with the offer/outcome itself." });
    }
    if (HEADLINE_NEGATIVES.test(text)) {
      issues.push({ kind: "weak_headline", severity: "medium", sectionType, field, excerpt: excerpt(text), note: "Headline names the fear/objection it's dispelling — state the positive promise instead; resolve the fear in body copy." });
    }
  }

  // Generic filler — banned buzzwords.
  for (const w of BANNED_BUZZWORDS) {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lower)) {
      issues.push({ kind: "generic_filler", severity: "medium", sectionType, field, excerpt: excerpt(text), note: `Generic buzzword "${w}" — replace with a specific outcome, number, or mechanism.` });
      break; // one filler flag per field is enough signal
    }
  }

  // Likely fabrication.
  for (const f of FABRICATION) {
    if (f.re.test(text)) {
      // Exclude pricing discounts from the bare-% check ("50% off").
      if (f.note.startsWith("Percentage") && /\b\d{1,3}\s?%\s?(off|discount|save)/i.test(text)) continue;
      issues.push({ kind: "possible_fabrication", severity: f.severity, sectionType, field, excerpt: excerpt(text), note: f.note });
    }
  }

  // Vague CTA.
  if (isCtaField(field)) {
    const norm = lower.trim().replace(/[.!→>]+$/, "").trim();
    if (VAGUE_CTAS.has(norm)) {
      issues.push({ kind: "vague_cta", severity: "medium", sectionType, field, excerpt: excerpt(text), note: `CTA "${text.trim()}" states the mechanic, not the outcome — say what they get.` });
    }
  }

  // Name-swap-generic headline.
  if (/headline/i.test(field)) {
    for (const re of NAME_SWAP_PATTERNS) {
      if (re.test(text)) {
        issues.push({ kind: "name_swap_generic", severity: "medium", sectionType, field, excerpt: excerpt(text), note: "Headline would be true with the business name swapped out — make it specific to this offer/audience." });
        break;
      }
    }
  }
}

/**
 * Evaluate a funnel's copy. Accepts the section list shape create_funnel writes
 * (`{ type, config }`), so it can run on a just-generated funnel before it's
 * shown/published. Returns a heuristic quality report.
 */
export function evaluateFunnelCopy(
  sections: { type: FunnelSectionType | string; config: Record<string, unknown> }[],
): CopyQualityReport {
  const issues: CopyIssue[] = [];
  let fieldsChecked = 0;

  for (const section of sections) {
    const copy: { field: string; text: string }[] = [];
    collectCopy(section.config ?? {}, "", copy);
    for (const { field, text } of copy) {
      fieldsChecked++;
      evaluateField(String(section.type), field, text, issues);
    }
  }

  // Weak sections: any high-severity issue, or 2+ issues of any severity.
  const bySection = new Map<string, CopyIssue[]>();
  for (const i of issues) {
    const list = bySection.get(i.sectionType) ?? [];
    list.push(i);
    bySection.set(i.sectionType, list);
  }
  const weakSectionTypes = [...bySection.entries()]
    .filter(([, list]) => list.some((i) => i.severity === "high") || list.length >= 2)
    .map(([type]) => type);

  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { score, issues, weakSectionTypes, fieldsChecked };
}

/** True when the report has any integrity red flag (a high-severity possible
 *  fabrication) — the signal that a funnel must not be shared until reviewed. */
export function hasFabricationRisk(report: CopyQualityReport): boolean {
  return report.issues.some((i) => i.kind === "possible_fabrication" && i.severity === "high");
}
