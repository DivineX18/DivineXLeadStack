/**
 * NO EM DASHES, ANYWHERE A CUSTOMER READS.
 *
 * The em dash is the single most reliable tell that a sentence was written by
 * a language model, and every surface here is either sold as human judgment or
 * published under a customer's own brand. A prompt instruction alone does not
 * hold: models reach for the character under pressure, and a rule that lives
 * only in a prompt is a rule that silently stops applying the moment someone
 * edits the prompt. So it is enforced HERE, at the boundary where generated
 * text enters the product, where nothing downstream can opt out of it.
 *
 * The replacement is grammatical rather than a swap for another dash, because
 * "Get Started, $77/mo" and "run, deals, values and timing are yours" are both
 * worse than what they replaced. Rules, in order:
 *
 *   paired dashes around an aside  ->  parentheses
 *   before a price or figure       ->  a hyphen, because it is a separator
 *   after a bare Yes / No          ->  a comma
 *   before a connector word        ->  a comma
 *   before an independent clause   ->  a full stop, and the clause is capitalised
 *   anything else                  ->  a comma, the appositive default
 */

const CONNECTOR = new Set(
  ("so and but or yet nor because while which who whose that though although " +
   "since unless until plus including with without not rather instead " +
   "especially particularly even just as if when where a an the one two three")
    .split(" "),
);

const IMPERATIVE = new Set(
  ("check see use add pick try open click contact email run set start edit " +
   "choose leave keep tell ask note remember go read visit call send copy " +
   "paste enter type select review book learn download upgrade cancel reply" +
   " export import save share update delete remove install configure connect verify confirm follow find create build write fill drop sign switch turn hit tap scroll expand collapse head swap")
    .split(" "),
);

const NEWCLAUSE = new Set("it they we you he she there this these those".split(" "));

/** A finite verb close to the front means what follows stands alone, so a
 *  comma there would splice two independent clauses. */
const FINITE =
  /^(?:\S+\s+){0,5}(?:is|are|was|were|will|can|could|should|would|has|have|had|do|does|did|stay|stays|come|comes|go|goes|work|works|run|runs|let|lets|means|gets|makes|takes|includes|include|covers|cover|ships|sits|lives|applies|starts|ends|needs|requires|keeps|holds|carries|shows|uses|costs|counts|happens|sends|writes|reads|picks|turns|leaves)\b/i;

const EM_DASH = "\u2014";
/* Assembled rather than written out, so that a sweep of this repo's own text
   can never rewrite the module that defines the rule. It happened once. */
const ENTITY = "&" + "mdash;";

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function nextWord(after: string): string {
  const m = after.match(/^\s*([A-Za-z']+)/);
  return m ? m[1] : "";
}

function replaceOne(before: string, after: string): [string, string] {
  const w = nextWord(after);
  const lw = w.toLowerCase();
  const rest = after.replace(/^\s+/, "");
  const head = before.replace(/\s+$/, "");
  if (!rest) return [head, rest];
  // A template expression is not a figure: `${name}` must not become "- ".
  if (/^[$£€\d]/.test(rest) && !rest.startsWith("${"))
    return [head + " - ", rest];
  if (/(^|[\s">])(Yes|No|Yep|Nope|Sure)$/i.test(head)) return [head + ", ", rest];
  if (CONNECTOR.has(lw)) return [head + ", ", rest];
  if (FINITE.test(rest) || IMPERATIVE.has(lw) || NEWCLAUSE.has(lw)) {
    const b = /[.!?:;]$/.test(head) ? head : head.replace(/,$/, "") + ".";
    return [b + " ", cap(rest)];
  }
  if (/^[A-Z]/.test(w) && w.length > 1) {
    return [(/[.!?:;]$/.test(head) ? head : head + ".") + " ", rest];
  }
  return [head + ", ", rest];
}

/**
 * A dash standing alone between delimiters is not punctuation, it is a
 * placeholder glyph: the "no value yet" cell in a table, `{"-"}` in JSX. It
 * has no sentence around it to re-punctuate, so it becomes a plain hyphen and
 * keeps whatever spacing it had.
 */
function glyphDashes(s: string): string {
  return s.replace(
    /(["'`>}])([ \t]*)\u2014([ \t]*)(["'`<{])/g,
    (_m, open: string, a: string, b: string, close: string) => `${open}${a}-${b}${close}`,
  );
}

/**
 * Turn a genuine aside into a parenthesis.
 *
 * Done as an explicit scan rather than a global replace, because a rejected
 * candidate must not consume its dashes. With `String.replace` the pair
 * (1,2) was tested, rejected for containing a finite verb, and the scan
 * resumed past dash 2, so the real aside between dashes 2 and 3 could never
 * be found.
 *
 * An aside is short, has no sentence punctuation in it, has no finite verb,
 * and is followed by lower-case text that continues the sentence.
 */
function pairAsides(s: string): string {
  const at: number[] = [];
  for (let i = 0; i < s.length; i++) if (s[i] === EM_DASH) at.push(i);
  let out = "";
  let idx = 0;
  let p = 0;
  while (p + 1 < at.length) {
    const a = at[p];
    const b = at[p + 1];
    if (a < idx) { p += 1; continue; }
    const mid = s.slice(a + 1, b).trim();
    const after = s.slice(b + 1);
    const pre = s.slice(idx, a).replace(/[ \t]+$/, "");
    if (
      mid.length >= 2 && mid.length <= 70 &&
      !/[.!?\n]/.test(mid) && !FINITE.test(mid) &&
      /^[ \t]*[a-z]/.test(after) && /\S$/.test(pre)
    ) {
      out += `${pre} (${mid}) `;
      idx = b + 1 + (after.match(/^[ \t]*/)?.[0].length ?? 0);
      p += 2;
    } else {
      p += 1;
    }
  }
  return out + s.slice(idx);
}

/** Rewrite every em dash in a block of text. Safe on JSON: it only ever
 *  replaces the dash character itself, and never introduces a quote or a
 *  brace. */
export function stripEmDashes(input: string): string {
  if (!input || (!input.includes(EM_DASH) && !input.includes(ENTITY))) return input;
  let s = input.split(ENTITY).join(EM_DASH);
  // An aside fenced by two dashes inside one sentence becomes a parenthesis.
  s = glyphDashes(s);
  s = pairAsides(s);
  let guard = (s.match(/\u2014/g) || []).length + 1;
  while (s.includes(EM_DASH) && guard-- > 0) {
    const i = s.indexOf(EM_DASH);
    const [b, a] = replaceOne(s.slice(0, i), s.slice(i + 1));
    s = b + a;
  }
  // Only a stray space before a comma or full stop is cleaned. An earlier
  // version also collapsed runs of spaces and stripped the space before "?"
  // and ":", which silently reformatted ternaries and aligned code on every
  // line that happened to contain a dash.
  return s.replace(/(\S)[ \t]+([.,;])/g, "$1$2")
}

/**
 * Streaming variant.
 *
 * A chunk can end mid-sentence, and the rule for a given dash depends on the
 * word AFTER it, which may not have arrived yet. So a short tail is held back
 * until either more text arrives or the stream ends. Holding back a few
 * characters is invisible to a reader; guessing at the rule is not.
 */
export class EmDashStream {
  private buf = "";

  push(chunk: string): string {
    this.buf += chunk;
    // The rule reads the text on BOTH sides of a dash, so an unresolved dash
    // holds back the words before it as well. Emitting those early produced
    // "the plan . It starts" instead of "the plan. It starts".
    //
    // The hold-back point is the FIRST dash in the buffer, not the last. With
    // several dashes in flight, backing off 64 characters from the last one
    // lands in the middle of the text belonging to an earlier one, which is
    // the same bug in a quieter form.
    const first = this.buf.indexOf(EM_DASH);
    const last = this.buf.lastIndexOf(EM_DASH);
    const safeUntil =
      first === -1 || this.buf.length - last > 48
        ? this.buf.length
        : Math.max(0, first - 64);
    if (safeUntil <= 0) return "";
    let out = this.buf.slice(0, safeUntil);
    // Trailing whitespace is never emitted. With one-character chunks the
    // space before a dash would otherwise already be gone downstream, and the
    // full stop that replaces the dash lands after it: "the plan . It starts".
    // Holding the space back is enough to keep the join clean.
    const held = out.match(/\s+$/)?.[0] ?? "";
    if (held) out = out.slice(0, out.length - held.length);
    this.buf = held + this.buf.slice(safeUntil);
    return stripEmDashes(out);
  }

  flush(): string {
    const out = this.buf;
    this.buf = "";
    return stripEmDashes(out);
  }
}
