/**
 * ONE CONTRACT FOR SHORTENING GENERATED PROSE SHOWN TO A VISITOR.
 *
 * This family of defect has now been found three times, in three components,
 * and each time it was fixed locally and reappeared somewhere else:
 *
 *   badge    "Written recommendation, not a sales quot"   (character cut)
 *   badge    "Application only, we take a limited"        (word-boundary cut)
 *   heading  "…recover the most conversions on your specific"  (word-boundary cut)
 *
 * The third one is the proof that the previous fix was the wrong abstraction. A
 * word-boundary cut guarantees a whole WORD; it does not guarantee a whole
 * THOUGHT, and no list of forbidden final words can close the gap — "specific"
 * is an adjective awaiting its noun, the next one will be a participle, then a
 * comparative, then a word nobody predicted. Chasing them is the same
 * whack-a-mole as an industry blacklist.
 *
 * So the rule is structural: A PREFIX OF A SENTENCE IS NOT A SENTENCE. The only
 * shortenings that are reliably complete are ones that end where the author
 * already ended something — the whole text, or a leading clause terminated by
 * punctuation. Everything else is refused, and the caller falls back to a
 * deterministic label, which is truthful, orienting, and never half-finished.
 *
 * "What you get" is a worse headline than the operator's own sentence. It is a
 * far better headline than a sentence that stops.
 */

/** Clause terminators an author actually wrote, in order of how cleanly they
 *  end a thought. */
const SENTENCE_END = /(?<=[.!?])\s+/;
const CLAUSE_END = /(?<=[,;:])\s+/;

/** Trailing punctuation left behind once a clause is lifted out of a sentence. */
function tidy(text: string): string {
  return text.trim().replace(/[\s,;:]+$/, "");
}

/**
 * The longest COMPLETE thought from `text` that fits inside `maxLen`, or null.
 *
 * Returns the whole string when it already fits. Otherwise takes as many
 * author-terminated units as fit — whole sentences first, then whole clauses —
 * and returns null when not even the first one does.
 *
 * Null is a real answer and the caller must handle it with a label rather than
 * by cutting something shorter itself. That is the entire point: there is no
 * safe way to cut, so the decision is escalated instead of approximated.
 */
export function completeThoughtWithin(text: string, maxLen: number, minLen = 8): string | null {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  if (clean.length <= maxLen) return clean;

  const take = (units: string[]): string | null => {
    if (units.length < 2) return null; // no boundary inside the text at all
    let out = "";
    for (const unit of units) {
      const next = out ? `${out} ${unit}` : unit;
      if (tidy(next).length > maxLen) break;
      out = next;
    }
    const result = tidy(out);
    return result.length >= minLen ? result : null;
  };

  return take(clean.split(SENTENCE_END)) ?? take(clean.split(CLAUSE_END));
}

/**
 * Is this string safe to show as a standalone label?
 *
 * Used to validate text that was NOT produced by shortening — an author's own
 * short line can still arrive truncated from upstream. Cheap and structural: a
 * label that ends on a word which demands a continuation is not standalone.
 * This is a safety net, never the primary mechanism; the primary mechanism is
 * not cutting in the first place.
 */
const DEMANDS_CONTINUATION = new Set([
  "a", "an", "the", "and", "or", "but", "so", "as", "of", "to", "for", "with", "in", "on",
  "at", "by", "from", "into", "than", "that", "which", "who", "your", "our", "their", "its",
  "is", "are", "was", "were", "be", "been", "being", "not", "no", "per", "up", "about",
]);

export function readsAsCompleteLabel(text: string): boolean {
  const words = tidy(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length === 1) return words[0].length >= 4;
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z']/g, "");
  return !DEMANDS_CONTINUATION.has(last);
}
