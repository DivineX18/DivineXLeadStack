/**
 * A SERVICE AREA IS NOT AN ORGANISATION.
 *
 * A generated Summit Roofing page shipped the trust badge "Locally owned in
 * Houston". Houston was verified — the business says it serves Houston
 * homeowners. Local ownership was never stated by anyone. The model reached it
 * by treating a service-area fact as evidence of an ownership structure, which
 * is the same move as inferring tenure from an established-looking brand.
 *
 * Blocking the word "owned" was not the fix. The next generation of the same
 * business produced "Local Houston crew" — the identical inference from the
 * identical fact, wearing a different noun. What the model is actually reaching
 * for is a claim about WHO THE BUSINESS IS: how it is owned, and where its
 * people are. Serving a city establishes neither; a company may subcontract it,
 * dispatch into it regionally, or run the work remotely.
 *
 * That class of claim is worth more to a buyer than almost anything else on the
 * page, which is exactly why it cannot be inferred. "Family owned", "veteran
 * owned", "woman owned", "independently owned", "founder led" all carry legal,
 * demographic or governance meaning that a location, a service area or a tone
 * of voice cannot establish, and "our local crew" carries an operational one.
 *
 * So these are stripped rather than argued with. The existing fabrication rules
 * in this codebase already take this shape: write the page WITHOUT the claim and
 * let the operator add the real fact in the builder, because an honest page that
 * converts slightly less beats a fabricated one every time. An operator who IS
 * veteran-owned loses nothing but a form field; a buyer misled by an invented
 * one loses their trust in everything around it.
 *
 * Prompt instructions were not enough here — the tool description already bans
 * inventing organizational status and the claim shipped anyway, so the rule
 * lives in code where it cannot be talked around.
 */

/**
 * Ownership, governance, affiliation and staffing-location claims. Each needs
 * an explicit statement from the business; none can be derived from anything
 * the generator has access to.
 *
 * Matched as whole phrases so ordinary copy survives: "we own the problem",
 * "locally sourced materials" and "family bathroom" are not ownership claims,
 * and a rule that caught them would quietly delete real content.
 */
const UNSUPPORTED_CLAIM_PATTERNS: RegExp[] = [
  // "<qualifier> owned/operated/run" — the whole family in one shape.
  /\b(local(?:ly)?|family|families|veteran|minority|women?|woman|black|indigenous|native|independent(?:ly)?|privately|employee|community)[\s-]+(owned|operated|run|led)\b/i,
  // The reverse construction: "owned and operated locally".
  /\b(owned|operated)\s+(and\s+(owned|operated)\s+)?(locally|independently|privately)\b/i,
  // Only ever applied to short trust LABELS, where there is no context to
  // tell "we are founder-led" from "for businesses past the founder-led
  // stage". In running prose the second is ordinary, verified audience
  // description — see the scoping note in verify-real-path-render.mts.
  /\bfounder[\s-]+(led|owned|run)\b/i,
  /\bfamily[\s-]+business\b/i,
  // Employment/location of the business stated outright, with no noun needed.
  /\blocal(?:ly)?[\s-]+(based|staffed|employed|hired)\b/i,
  /\b(?:100%|wholly|fully)\s+(?:australian|american|british|canadian|local)[\s-]*owned\b/i,
];

/* ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE PEOPLE ARE IS NOT A SERVICE AREA EITHER.
 *
 * The first attempt at this listed the people nouns it had seen — crew, team,
 * staff, technicians, installers. Production then generated "Local Houston
 * roofers", and the list was the defect: trade nouns are PRODUCTIVE. Adding
 * roofers invites plumbers, then electricians, glaziers, locksmiths,
 * conveyancers, and the rule loses to English.
 *
 * So this asks a structural question instead: does location phrasing modify a
 * PERSON, or a service? "Local roofers" claims where the people are and needs a
 * fact nobody has stated. "Houston roofing services" and "Serving Houston
 * homeowners" describe a market and are ordinary verified copy.
 *
 * Agents are recognised by MORPHOLOGY — the -er/-or/-ist/-ian/-ant families
 * that English uses to turn a verb or a domain into the person who does it —
 * plus a small closed set of people words that carry no such suffix (crew,
 * team, staff). That covers every trade without naming one.
 * ──────────────────────────────────────────────────────────────────────────── */

/** People words with no agent suffix to recognise them by. */
const CLOSED_AGENTS = new Set([
  "crew", "crews", "team", "teams", "staff", "people", "folks", "workforce",
  "employee", "employees", "tradespeople", "tradesmen", "pro", "pros", "tech",
  "techs", "hands", "personnel", "guys", "crewmembers",
]);

/**
 * Words that wear an agent suffix without naming a person.
 *
 * Bounded by construction: it only has to cover what can plausibly follow
 * "local" in a trust label, not every noun in English. This is a list of
 * MORPHOLOGICAL FALSE FRIENDS, which is a closed problem — unlike a list of
 * trades, which is not.
 */
const NOT_AGENTS = new Set([
  // -er
  "offer", "offers", "other", "cover", "power", "water", "matter", "number",
  "order", "orders", "newsletter", "filter", "quarter", "manner", "banner",
  "voucher", "weather", "summer", "winter", "corner", "center", "centre",
  "flyer", "poster", "folder", "register", "transfer", "container", "calendar",
  "character", "computer", "server", "servers", "after", "over", "under",
  "delivery", "discover", "whenever", "wherever", "however",
  // -or
  "door", "doors", "floor", "floors", "color", "colors", "colour", "colours",
  "error", "errors", "sensor", "sensors", "monitor", "monitors", "indoor",
  "outdoor", "mirror", "prior", "major", "minor", "motor", "humor", "humour",
  "favor", "favour", "anchor", "for",
  // -ist
  "list", "lists", "checklist", "checklists", "assist", "exist", "twist", "wrist",
  // -ant
  "restaurant", "restaurants", "plant", "plants", "grant", "grants", "want",
  "wants", "instant", "important", "relevant", "elegant", "pleasant", "warrant",
  "variant", "constant", "quadrant", "vacant", "distant",
  // -ian / -man
  "median", "human", "humans", "german", "roman",
]);

/** Suffixes English uses to name the person who performs an action or trade. */
const AGENT_SUFFIX = /(?:ers?|ors?|ists?|ians?|ants?|m[ae]n|wom[ae]n|smiths?|wrights?)$/;

/**
 * Words that name people in the plural and modify a service in the singular.
 *
 * "Local experts" claims where the staff are. "Local expert advice" and "local
 * professional service" use the same word as an ADJECTIVE, and the thing being
 * described is the service. The number carries the distinction reliably — an
 * attributive use is singular — so these count as people only when plural or
 * when nothing follows them.
 */
const ATTRIBUTIVE_AGENTS = new Set(["expert", "experts", "professional", "professionals", "specialist", "specialists"]);

/** Is this token the name of a PERSON (or group of people)? */
function isAgentNoun(token: string, isFinalToken = true): boolean {
  const w = token.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 3) return false;
  if (ATTRIBUTIVE_AGENTS.has(w)) return w.endsWith("s") || isFinalToken;
  if (CLOSED_AGENTS.has(w)) return true;
  if (NOT_AGENTS.has(w)) return false;
  // Five letters before it counts, so "user"/"over" style short words cannot
  // reach agenthood on a two-letter ending alone.
  return w.length >= 5 && AGENT_SUFFIX.test(w);
}

/**
 * Does this token read as a PLACE rather than a service?
 *
 * Title Case with a lower-case tail. This is what separates "Local Houston
 * roofers" (strip) from "Local SEO experts" and "local search specialists"
 * (keep): a proper noun names where, an acronym or a lower-case word names
 * what. Imperfect on a badge typed in full Title Case, and deliberately so —
 * dropping an ambiguous label is the conservative outcome, and inventing a
 * gazetteer to be sure would be the fragile dependency this avoids.
 */
function looksLikePlace(token: string): boolean {
  return /^[A-Z][a-z]{2,}$/.test(token.replace(/[^A-Za-z]/g, ""));
}

/**
 * Words that make the following people the MARKET rather than the advertiser's
 * own staff. "Serving local homeowners" is who the business sells to; "local
 * homeowners" on its own would be a claim about who works there.
 */
const MARKET_FRAME = new Set(["serving", "serves", "serve", "for", "helping", "helps", "help", "to", "with", "trusted", "by"]);

/** Split on whitespace, keeping hyphenated compounds as separate tokens so
 *  "Houston-based" is seen as "Houston" then "based". */
function tokenize(text: string): string[] {
  return text.split(/[\s\-–—]+/).filter(Boolean);
}

/**
 * Does this label claim the business's PEOPLE are local?
 *
 * Three shapes, which is all this claim takes in practice:
 *   local <agent>                 "local roofers", "local crew", "local experts"
 *   local <Place> <agent>         "Local Houston roofers"
 *   <Place>-based <agent>         "Houston-based crew"
 * plus the mirrored "<agent> … locally" / "<agent> local to <Place>".
 */
function assertsLocalPeople(text: string): boolean {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const bare = tokens[i].toLowerCase().replace(/[^a-z]/g, "");

    if (bare === "local" || bare === "locally") {
      // "Serving local homeowners" describes the market, not the staff.
      const before = i > 0 ? tokens[i - 1].toLowerCase().replace(/[^a-z]/g, "") : "";
      if (MARKET_FRAME.has(before)) continue;
      const next = tokens[i + 1];
      if (next && isAgentNoun(next, i + 2 >= tokens.length)) return true;
      // One token of separation is allowed ONLY for a place name; anything
      // else there is the service being described ("local SEO experts").
      if (next && looksLikePlace(next) && tokens[i + 2] && isAgentNoun(tokens[i + 2], i + 3 >= tokens.length)) return true;
      continue;
    }

    // "<Place>-based crew" / "Houston based team".
    if ((bare === "based" || bare === "headquartered") && i > 0 && looksLikePlace(tokens[i - 1])) {
      if (tokens[i + 1] && isAgentNoun(tokens[i + 1])) return true;
      // "Crew, Houston-based" — the agent can also precede the place.
      if (i >= 2 && isAgentNoun(tokens[i - 2])) return true;
    }

    // The mirrored construction: "crew based locally", "roofers local to Houston".
    if (isAgentNoun(tokens[i])) {
      const tail = tokens.slice(i + 1, i + 5).map((t) => t.toLowerCase().replace(/[^a-z]/g, ""));
      const localAt = tail.findIndex((t) => t === "local" || t === "locally");
      if (localAt === -1) continue;
      const between = tail.slice(0, localAt);
      const LINKERS = new Set(["who", "that", "is", "are", "all", "based", "located", "live", "lives", "living", "hired", "work", "works", "working", "right", "here", "and", "stay", "stays"]);
      if (between.every((t) => LINKERS.has(t)) && between.some((t) => t !== "and")) return true;
      // "roofers local to Houston"
      if (between.length === 0 && tail[localAt + 1] === "to") return true;
    }
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SCARCITY IS A FACT ABOUT THE BUSINESS, NOT A TONE OF VOICE.
 *
 * A generated Operations Strategy Review page shipped the fold badge
 * "Application only, we take a limited" — the visible half of "we take a
 * limited number each quarter". Nothing in that business's stated facts caps
 * anything. The model reached for scarcity because scarcity converts, the
 * tool description already bans it (fabrication class (d): cohort caps,
 * limited spots, application windows), and it shipped anyway. Same lesson as
 * ownership: a prompt rule with no enforcement is a suggestion.
 *
 * Worse than an ordinary invention, because a truncation HID it. The badge was
 * cut to fit and the surviving fragment read as a harmless qualifier, so the
 * fabricated cap reached the fold wearing a shorter coat. That is why claim
 * integrity now runs on the FULL text before any shortening can happen.
 *
 * Structural, not a phrase list. What the model is reaching for is "there is
 * less of this than you would like", which English expresses as a QUANTIFIER
 * against an AVAILABILITY noun ("limited spots", "only 10 clients"), a closing
 * WINDOW ("applications close Friday"), or a depletion signal ("almost full",
 * "while places last"). The availability nouns are a genuinely closed set —
 * unlike trades, nobody invents a new word for a seat.
 *
 * An operator who really does cap at ten clients loses a badge and re-adds it
 * in the builder, with the fact behind it. A buyer who books because they
 * believed an invented cap has been manipulated.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Nouns that name a UNIT OF AVAILABILITY — a thing there can be fewer of.
 *
 * Widened once, deliberately and with an audit rather than a bug report. A
 * certification page shipped "By application, limited engagements" because
 * `engagements` was not on this list, and adding that one word would have been
 * the wrong fix: testing the family first showed SIXTEEN of twenty-nine honest
 * phrasings of the same claim slipping through, including "only two openings
 * this month", "accepting three new clients", "availability is limited" and
 * "nearly booked". The class was under-enumerated, not one word short.
 *
 * `business`/`company` are PLURAL-ONLY here on purpose: "limited business
 * hours" is an ordinary fact about opening times, not a capacity claim.
 */
const AVAILABILITY_NOUNS = [
  "spot", "spots", "seat", "seats", "slot", "slots", "place", "places",
  "space", "spaces", "opening", "openings", "position", "positions",
  "client", "clients", "customer", "customers", "member", "members",
  "application", "applications", "cohort", "cohorts", "intake", "intakes",
  "enrolment", "enrollment", "registration", "booking", "bookings",
  "session", "sessions", "appointment", "appointments", "project", "projects",
  // Added after the audit above.
  "engagement", "engagements", "account", "accounts", "consultation", "consultations",
  "placement", "placements", "businesses", "companies", "retainer", "retainers",
].join("|");

/**
 * HOW MANY, however the sentence happens to count.
 *
 * Digits were the only thing recognised, so "only 2 openings" was refused and
 * "only two openings" was not — a distinction no reader makes. Vague
 * quantifiers belong here for the same reason: "a few", "a handful" and "a
 * small number" are scarcity claims that simply decline to name the number.
 */
const QUANTIFIER =
  "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|" +
  "a\\s+few|a\\s+handful|a\\s+small\\s+number|a\\s+limited\\s+number|" +
  "only\\s+a\\s+few|just\\s+a\\s+few|handful)";

/**
 * Scarcity and capacity assertions.
 *
 * Each asks a structural question. "Unlimited" is safe by word boundary, and
 * "limited warranty"/"limited edition" do not match because neither noun is a
 * unit of availability — the claim class is about how MANY are obtainable, not
 * about how much of something is guaranteed.
 */
const SCARCITY_PATTERNS: RegExp[] = [
  // "limited spots", "limited availability", "limited number of clients",
  // "limited engagements", "limited time".
  new RegExp(`\\blimited\\s+(?:number\\s+of\\s+|amount\\s+of\\s+)?(?:${AVAILABILITY_NOUNS}|availability|capacity|time|number)\\b`, "i"),
  // The mirrored form: "availability is limited", "capacity is full".
  new RegExp(`\\b(?:availability|capacity|${AVAILABILITY_NOUNS})\\s+(?:is|are)\\s+(?:limited|capped|full|tight|running\\s+low)\\b`, "i"),
  // "only 10 clients", "only two openings", "only a few spots".
  new RegExp(`\\b(?:only|just)\\s+${QUANTIFIER}\\s+(?:\\w+\\s+){0,2}?(?:${AVAILABILITY_NOUNS})\\b`, "i"),
  // "3 seats left", "three openings remaining", "few appointments remaining".
  new RegExp(`\\b(?:${QUANTIFIER}|few)\\s+(?:\\w+\\s+){0,2}?(?:${AVAILABILITY_NOUNS})\\s+(?:left|remaining|available|open)\\b`, "i"),
  // "we only take a limited number", "we can only accept a few".
  // A quantifier is REQUIRED after the verb, so "we only take card payments"
  // and "we only work with dentists" stay — those restrict KIND, not QUANTITY.
  new RegExp(`\\bwe\\s+(?:can\\s+)?only\\s+(?:take|accept|work\\s+with|onboard|see|serve|book|fit)\\s+(?:${QUANTIFIER}|so\\s+many)\\b`, "i"),
  // "accepting three new clients", "taking on a handful of clients",
  // "taking a small number of businesses".
  new RegExp(`\\b(?:accepting|taking(?:\\s+on)?|onboarding|enrolling|booking)\\s+${QUANTIFIER}(?:\\s+of)?\\s+(?:\\w+\\s+){0,2}?(?:${AVAILABILITY_NOUNS})\\b`, "i"),
  // "capped at 10", "maximum of 12 clients", "max 8 per cohort".
  new RegExp(`\\b(?:capped\\s+at|cap\\s+of|maximum\\s+of|max(?:imum)?)\\s+\\d+`, "i"),
  new RegExp(`\\b(?:${AVAILABILITY_NOUNS})\\s+(?:are\\s+)?(?:capped|limited)\\b`, "i"),
  // A closing WINDOW: "applications close", "doors close Friday".
  new RegExp(`\\b(?:${AVAILABILITY_NOUNS}|doors|enrol?ment)\\s+(?:are\\s+|is\\s+)?(?:close|closes|closing|closed)\\b`, "i"),
  // Depletion and first-come urgency.
  /\bwhile\s+(?:\w+\s+)?(?:last|lasts|remain|available)\b/i,
  /\bfirst[\s-]+come[,\s]+first[\s-]+(?:served|serve)\b/i,
  /\b(?:almost|nearly|filling\s+up|selling)\s+(?:full|fast|out)\b/i,
  // "nearly booked", "almost fully booked", "booked out", "booked up".
  /\b(?:almost|nearly|fully|completely)\s+(?:fully\s+)?booked\b/i,
  /\bbooked\s+(?:out|up|solid)\b/i,
  // "per quarter"/"per month" attached to an intake unit is a cap in disguise.
  new RegExp(`\\b(?:${AVAILABILITY_NOUNS})\\s+(?:per|each|a)\\s+(?:quarter|month|week|year|cohort|intake)\\b`, "i"),
];

/** Does this line assert a restriction on how much is available? */
export function assertsUnverifiedScarcity(text: string): boolean {
  return SCARCITY_PATTERNS.some((re) => re.test(text));
}

/** Does this line assert an ownership, governance, staffing or availability
 *  status the business never stated? */
export function isUnsupportedTrustClaim(text: string): boolean {
  return (
    UNSUPPORTED_CLAIM_PATTERNS.some((re) => re.test(text)) ||
    assertsLocalPeople(text) ||
    assertsUnverifiedScarcity(text)
  );
}

/**
 * Remove any line asserting an unverifiable ownership or staffing status.
 *
 * Returns the surviving lines and what was dropped, because a silent strip is
 * how a rule like this rots: the caller logs the removal so a generation that
 * keeps reaching for the claim is visible rather than invisibly patched.
 *
 * Never rewrites. A claim is either admissible as written or it is gone —
 * substituting a weaker phrasing would be inventing a different claim.
 */
export function stripUnsupportedClaims(lines: readonly string[]): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const line of lines) {
    if (isUnsupportedTrustClaim(line)) dropped.push(line);
    else kept.push(line);
  }
  return { kept, dropped };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A NUMBER IS A FACT, AND A FACT NEEDS A SOURCE.
 *
 * Certification shipped a roofing page whose before-panel read "You called a
 * roofer once and got a $18k quote before they were even off the ladder." The
 * operator never mentioned $18k, never mentioned a quote the visitor received,
 * and never mentioned a competitor's pricing. Every detector above is about
 * badges and scarcity; nothing looked at a number sitting in narrative prose,
 * and the only dollar rule (`OUTCOME_CLAIM` in capabilities.ts) needed a verb
 * like "save" in front of it.
 *
 * Banning numbers is not the fix: "a free 25-point inspection", "$49",
 * "written findings in ten working days" and "parents of 1 to 3 year olds" were
 * all on certified pages and all came from the operator. So the question is
 * not "is there a number" but "did anyone who knows the business say it". A
 * figure is admissible when it is GROUNDED — stated by the operator in their
 * own messages, or carried by a typed channel that exists to hold it (the
 * price, a supplied rating, the event time) — or when it is STRUCTURAL rather
 * than a claim (Step 2, 1-on-1, a phone number).
 *
 * The unit a number counts matters as much as the value. A lead-magnet brief
 * that says "1 to 3 year olds" grounds the 3 in "3 year olds", not "repairs
 * take 3 weeks". So a figure that counts TIME, PEOPLE or MONEY must match what
 * the operator counted, not merely the digits they typed.
 *
 * Remedy is removal of the sentence, never a rewrite in code: substituting a
 * vaguer figure would be inventing a different claim. The rest of the
 * paragraph stands, which is exactly what the Summit page needed.
 * ──────────────────────────────────────────────────────────────────────────── */

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
// "one" is deliberately absent: it is a determiner far more often than a count
// ("one call", "the one thing"), and a single unit is not a quantity claim.

/** Counts of an unstated size — still a claim about how many. */
const VAGUE_MAGNITUDES = new Set(["dozens", "hundreds", "thousands", "millions", "billions"]);

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, hundred: 1e2, m: 1e6, million: 1e6, mm: 1e6, bn: 1e9, billion: 1e9 };

/** A number preceded by one of these is a POSITION in the page's own
 *  structure ("Step 2", "Day 3 of the challenge"), not a claim about the world. */
const STRUCTURAL_LABELS = new Set([
  "step", "phase", "part", "stage", "module", "chapter", "lesson", "question", "option",
  "tier", "section", "session", "episode", "video", "round", "level", "pillar", "principle",
  "rule", "day", "week", "night", "page", "item",
]);

/** Units whose count is a factual claim: time, people, money, reputation. */
const CLAIM_UNITS = new Set([
  "second", "sec", "minute", "min", "hour", "hr", "day", "night", "week", "wk", "weekend",
  "month", "mo", "year", "yr", "decade", "am", "pm", "time",
  "customer", "client", "homeowner", "owner", "patient", "people", "person", "family",
  "business", "company", "user", "member", "subscriber", "student", "parent", "founder",
  "review", "star", "rating", "lead", "sale", "order", "job", "project", "roof", "home",
  "house", "household", "visit", "referral", "download", "follower", "reader", "dollar",
  "buck", "grand", "cent", "installation", "install", "case", "call",
]);

const UNIT_ALIASES: Record<string, string> = { yr: "year", hr: "hour", min: "minute", sec: "second", wk: "week", mo: "month", familie: "family", companie: "company" };

/** Filler between a number and the thing it counts. */
const UNIT_SKIP = new Set([
  "of", "a", "an", "the", "to", "for", "in", "on", "at", "by", "your", "our", "my", "their",
  "more", "new", "extra", "over", "about", "around", "per", "plus", "just", "only", "full",
  "whole", "than", "with", "-",
]);

const BOUNDARY = new Set([",", ".", ";", "!", "?", "/", ":", "(", ")"]);

export type NumericKind = "money" | "percent" | "multiple" | "ratio" | "vague" | "plain";

export interface NumericMention {
  kind: NumericKind;
  value: number;
  /** For ratios, the second term. */
  of?: number;
  /** For vague magnitudes, the word itself. */
  word?: string;
  /** Written as a word ("three") rather than digits. */
  spelled: boolean;
  /** Stems of what the number counts ("working", "day"). */
  unit: string[];
}

function stemUnit(w: string): string {
  let s = w.toLowerCase().replace(/'s$/, "");
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.length > 2 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return UNIT_ALIASES[s] ?? s;
}

const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

function tokenizeNumeric(text: string): string[] {
  const withoutPhones = text.replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? " . " : m));
  return withoutPhones.toLowerCase().replace(/[–—]/g, "-").match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[a-z]+(?:'[a-z]+)?|[$£€%#,.;!?/:()+-]/g) ?? [];
}

const isDigits = (t: string | undefined): t is string => !!t && /^\d/.test(t);
const isNumberToken = (t: string | undefined): t is string => isDigits(t) || (!!t && t in NUMBER_WORDS);

function readNumber(tokens: string[], i: number): { value: number; spelled: boolean; next: number } | null {
  const t = tokens[i];
  if (isDigits(t)) {
    const v = Number(t.replace(/,/g, ""));
    return Number.isFinite(v) ? { value: v, spelled: false, next: i + 1 } : null;
  }
  if (t && t in NUMBER_WORDS) {
    let v = NUMBER_WORDS[t];
    let next = i + 1;
    // "twenty five"
    if (v >= 20 && v % 10 === 0 && tokens[next] && tokens[next] in NUMBER_WORDS && NUMBER_WORDS[tokens[next]] < 10) {
      v += NUMBER_WORDS[tokens[next]];
      next++;
    }
    return { value: v, spelled: true, next };
  }
  return null;
}

/**
 * Every numeric claim in a line of copy, with structural numbering, phone
 * numbers, ordinals and "1-on-1" already excluded.
 */
export function extractNumericMentions(text: string): NumericMention[] {
  const tokens = tokenizeNumeric(text);
  const out: NumericMention[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (VAGUE_MAGNITUDES.has(tok)) {
      out.push({ kind: "vague", value: 0, word: tok, spelled: true, unit: collectUnit(tokens, i + 1) });
      i++;
      continue;
    }

    const first = readNumber(tokens, i);
    if (!first) {
      i++;
      continue;
    }
    const prev = tokens[i - 1];
    let j = first.next;

    // STRUCTURAL: "Step 2", "Day 3".
    if (prev && STRUCTURAL_LABELS.has(prev)) {
      i = j;
      continue;
    }
    // ORDINAL: "3rd", "21st" — a position, not a quantity.
    if (!first.spelled && ["st", "nd", "rd", "th"].includes(tokens[j] ?? "")) {
      i = j + 1;
      continue;
    }
    // FORMAT: "1-on-1", "1:1".
    if (first.value === 1 && !first.spelled) {
      const end =
        tokens[j] === "on" || tokens[j] === ":" ? j + 2 : tokens[j] === "-" && tokens[j + 1] === "on" && tokens[j + 2] === "-" ? j + 4 : -1;
      if (end > 0 && tokens[end - 1] === "1") {
        i = end;
        continue;
      }
    }

    const currencyBefore = prev === "$" || prev === "£" || prev === "€";
    let value = first.value;
    if (tokens[j] && tokens[j] in SCALE && (tokens[j] !== "m" || currencyBefore)) {
      value *= SCALE[tokens[j]];
      j++;
    }

    // RATIO: "9 out of 10", "1 in 3".
    if ((tokens[j] === "out" && tokens[j + 1] === "of" && isNumberToken(tokens[j + 2])) || (tokens[j] === "in" && isNumberToken(tokens[j + 1]))) {
      const at = tokens[j] === "out" ? j + 2 : j + 1;
      const second = readNumber(tokens, at)!;
      out.push({ kind: "ratio", value, of: second.value, spelled: first.spelled, unit: collectUnit(tokens, second.next) });
      i = second.next;
      continue;
    }

    // RANGE: "1 to 3", "$300-$800" — both ends share a kind and a unit.
    const values = [value];
    let spelled = first.spelled;
    if (["to", "-", "or", "and"].includes(tokens[j] ?? "")) {
      const at = tokens[j + 1] === "$" || tokens[j + 1] === "£" || tokens[j + 1] === "€" ? j + 2 : j + 1;
      const second = readNumber(tokens, at);
      if (second) {
        let v2 = second.value;
        let k = second.next;
        if (tokens[k] && tokens[k] in SCALE && (tokens[k] !== "m" || currencyBefore)) {
          v2 *= SCALE[tokens[k]];
          k++;
        }
        values.push(v2);
        spelled = spelled && second.spelled;
        j = k;
      }
    }

    let kind: NumericKind = "plain";
    if (currencyBefore) kind = "money";
    if (tokens[j] === "%" || tokens[j] === "percent" || (tokens[j] === "per" && tokens[j + 1] === "cent")) {
      kind = "percent";
      j += tokens[j] === "per" ? 2 : 1;
    } else if (tokens[j] === "x") {
      kind = "multiple";
      j++;
    } else if (tokens[j] === "dollar" || tokens[j] === "dollars" || tokens[j] === "bucks" || tokens[j] === "usd" || tokens[j] === "aud") {
      kind = "money";
    }

    const unit = collectUnit(tokens, j);
    for (const v of values) out.push({ kind, value: v, spelled, unit });
    i = Math.max(j, i + 1);
  }
  return out;
}

function collectUnit(tokens: string[], from: number): string[] {
  const unit: string[] = [];
  for (let k = from; k < tokens.length && unit.length < 2; k++) {
    const t = tokens[k];
    if (BOUNDARY.has(t) || isNumberToken(t)) break;
    if (UNIT_SKIP.has(t) || !/^[a-z]/.test(t)) continue;
    unit.push(stemUnit(t));
  }
  return unit;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A PRICE OF ZERO IS A FACT TOO.
 *
 * Certification shipped a dental page whose fold read "Free first assessment",
 * and whose closing band read "A free first assessment." The brief said the
 * first visit is assessment only with no treatment on the day. It never said
 * what the visit costs. The model converted LOW COMMITMENT into ZERO PRICE:
 * a different promise, made at the exact point the reader decides to book.
 *
 * This is the same shape as the numeric rule above and shares its machinery: a
 * claim about money needs a source, and the source is what the operator said.
 * What zero-price adds is the OBJECT. "Free" is not a property of a business,
 * it is a property of one thing the business hands over, so a brief that
 * offers a free guide has not said the consultation is free. The grounding
 * therefore carries what was free, and a claim must match it.
 *
 * Deliberately narrow. Absence of pressure is not absence of price: "no
 * obligation", "no commitment", "risk-free", "cancel anytime", "no credit
 * card", "no hidden fees" and "no treatment on the day" are all left alone,
 * because none of them says what anything costs. Nor is "free" a price word
 * when it means release: "stress-free", "hands-free", "free from the lecture"
 * and "frees up your evenings" all survive.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Words that can only be modifying a price. */
const ZERO_PRICE_WORDS = new Set(["complimentary", "gratis"]);
/** Nouns that mean money, for the "no/zero <noun>" and "free of <noun>" forms. */
const COST_NOUNS = new Set(["charge", "cost", "fee", "payment", "price"]);
/** Words that end an object phrase. */
const OBJECT_BOUNDARY = new Set([
  ",", ".", ";", ":", "!", "?", "(", ")", "but", "so", "because", "that", "which", "when", "while", "before", "after",
  // A preposition ends the phrase: in "free guide for parents", the object is
  // the guide, not the parents.
  "for", "of", "to", "on", "in", "at", "from", "by", "with", "about",
  "whether", "if", "unless", "than", "as",
]);
/** Determiners and modifiers that are not the object itself. */
const OBJECT_SKIP = new Set([
  "a", "an", "the", "your", "our", "my", "their", "this", "that", "these", "those", "is", "are", "was",
  "be", "get", "gets", "book", "booking", "claim", "download", "downloading", "send", "request", "schedule",
  "start", "take", "receive", "yours", "for", "of", "to", "on", "in", "at", "it", "us", "me", "you", "we",
  "first", "next", "new", "own", "real", "full", "quick", "no", "not", "really", "just", "only", "every",
  // "and"/"or" coordinate two objects of one claim ("the inspection and the
  // written recommendation cost nothing"), so they are stepped over, not
  // stopped at.
  "and", "or",
  "today", "tonight", "tomorrow", "yesterday", "now", "here", "there", "s", "t",
  "anytime", "instantly", "immediately", "always", "still", "ever", "yet", "once", "again", "also",
]);
/**
 * The one preposition that introduces the object rather than ending it: "no
 * charge FOR the first visit". Deliberately not "to": "nothing to buy TO USE
 * IT" states a purpose, not an offer, and reading "use" as the object made the
 * operator's own sentence unsupportable when the page repeated it back.
 */
const OBJECT_LEAD_IN = new Set(["for"]);

/**
 * ONE OFFER, MANY NOUNS. A business that supplied a free "guide" writes "PDF"
 * and "download" on the page for the same thing, and one that supplied a free
 * "inspection" writes "assessment". Grounding is per business, so these groups
 * only ever let an operator's own offer be called by its other name; they
 * never connect two different offers.
 */
const OFFER_SYNONYMS: Record<string, string> = {};
for (const [canonical, words] of Object.entries({
  guide: ["guide", "pdf", "ebook", "book", "download", "report", "checklist", "worksheet", "workbook", "handbook", "template", "resource", "copy"],
  inspection: ["inspection", "assessment", "evaluation", "checkup", "audit", "survey"],
  consultation: ["consultation", "consult", "call", "session", "meeting"],
  trial: ["trial", "demo", "sample", "taster"],
  shipping: ["shipping", "delivery", "postage", "freight"],
  setup: ["setup", "onboarding", "installation", "install", "activation"],
})) {
  for (const w of words) OFFER_SYNONYMS[w] = canonical;
}
const offerNoun = (stem: string) => OFFER_SYNONYMS[stem] ?? stem;

/** A zero-price claim found in a line of copy, with what it says is free. */
export interface ZeroPriceMention {
  /** The words that made it a price claim ("free", "no charge"). */
  marker: string;
  /** Stems of the thing said to be free. Empty = no object named. */
  object: string[];
  /**
   * The HEAD of that phrase — the noun the claim is actually about.
   *
   * Matching on any shared word was too loose: a free roof inspection and a
   * "complimentary roof replacement quote" share "roof" and are not the same
   * offer. English puts the head last in "free roof inspection" and first when
   * walking back from "the inspection is free", so it is taken accordingly.
   */
  head: string | null;
}

/** Is this "free" a price word, or the other kind? */
function freeIsPriceWord(tokens: string[], i: number): boolean {
  const prev = tokens[i - 1];
  // "stress-free", "hands-free", "risk-free", "toll-free".
  if (prev === "-") return false;
  const after = tokens.slice(i + 1, i + 4);
  // "free from the lecture", "free you from the dread".
  if (after.includes("from")) return false;
  // "free of charge" is price; "free of clutter" is not.
  if (tokens[i + 1] === "of") return COST_NOUNS.has(stemUnit(tokens[i + 2] ?? ""));
  // "free up your evenings", "feel free to ask".
  if (tokens[i + 1] === "up" || prev === "feel") return false;
  return true;
}

function collectObject(tokens: string[], from: number, dir: 1 | -1): string[] {
  const out: string[] = [];
  for (let k = from; k >= 0 && k < tokens.length && out.length < 3; k += dir) {
    const t = tokens[k];
    if (OBJECT_BOUNDARY.has(t)) break;
    if (!/^[a-z]/.test(t) || OBJECT_SKIP.has(t)) continue;
    out.push(offerNoun(stemUnit(t)));
  }
  return out;
}

/**
 * Every zero-price claim in a line of copy, with the object each one attaches
 * to. The object is read on BOTH sides of the marker, because English puts it
 * either way round: "free inspection", "the inspection is free".
 */
export function extractZeroPriceMentions(text: string): ZeroPriceMention[] {
  const tokens = tokenizeNumeric(text);
  const out: ZeroPriceMention[] = [];
  const push = (marker: string, i: number, j: number) => {
    // "no charge FOR the first visit" — step over the lead-in preposition.
    const start = OBJECT_LEAD_IN.has(tokens[j + 1] ?? "") ? j + 2 : j + 1;
    // "THE INSPECTION IS free whether or not you hire us": with a copula in
    // front, the thing being priced is behind the marker, and whatever follows
    // belongs to a different clause.
    const copulaBefore = ["is", "are", "was", "were", "be", "been", "'s"].includes(tokens[i - 1] ?? "");
    const after = copulaBefore ? [] : collectObject(tokens, start, 1);
    const before = collectObject(tokens, i - 1, -1);
    out.push({
      marker,
      object: [...after, ...before],
      head: after.length > 0 ? after[after.length - 1] : before.length > 0 ? before[0] : null,
    });
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "free" && freeIsPriceWord(tokens, i)) {
      // "free of charge" carries no object of its own on the right.
      const end = tokens[i + 1] === "of" ? i + 2 : i;
      push(tokens.slice(i, end + 1).join(" "), i, end);
      continue;
    }
    if (ZERO_PRICE_WORDS.has(t)) {
      push(t, i, i);
      continue;
    }
    // "$0", "0 dollars".
    if (t === "0" && (tokens[i - 1] === "$" || tokens[i - 1] === "£" || tokens[i - 1] === "€")) {
      push("$0", i - 1, i);
      continue;
    }
    // "no charge", "no cost", "at no cost", "zero cost", "without charge".
    if ((t === "no" || t === "zero" || t === "without") && COST_NOUNS.has(stemUnit(tokens[i + 1] === "-" ? (tokens[i + 2] ?? "") : (tokens[i + 1] ?? "")))) {
      const noun = tokens[i + 1] === "-" ? i + 2 : i + 1;
      // "no setup fee" / "no hidden fees" say a SPECIFIC extra is absent, not
      // that the thing itself is free — a different claim, left alone.
      const qualifier = tokens[i - 1];
      if (stemUnit(tokens[noun]) === "fee" && (qualifier === "setup" || qualifier === "hidden" || tokens[noun] === "fees")) continue;
      push(`${t} ${tokens[noun]}`, i, noun);
      continue;
    }
    // "it costs you nothing", "the visit costs nothing".
    if (["cost", "costs", "costing"].includes(t) && tokens.slice(i + 1, i + 3).includes("nothing")) {
      push("costs nothing", i, i + 2);
      continue;
    }
    // "nothing to buy", "nothing to pay", "you pay nothing".
    if (t === "nothing" && (tokens[i + 1] === "to" || tokens[i + 1] === "else") && ["buy", "pay"].includes(tokens[i + 2] ?? "")) {
      push("nothing to buy", i, i + 2);
      continue;
    }
    if (["pay", "pays", "paying"].includes(t) && tokens[i + 1] === "nothing") {
      push("pay nothing", i, i + 1);
      continue;
    }
    // "the inspection is on us".
    if (t === "on" && tokens[i + 1] === "us" && ["is", "are", "'s"].includes(tokens[i - 1] ?? "")) {
      push("on us", i - 1, i + 1);
      continue;
    }
  }
  return out;
}

/**
 * Is this zero-price claim backed by what the operator said?
 *
 * A claim that names nothing ("Free, no obligation" in a badge row) rides on
 * the business having stated any zero-price fact at all. A claim that names an
 * OFFER has to match an offer the operator actually said was free, so a free
 * guide never authorises a free consultation, and a brief that said only
 * "nothing to buy" never authorises either.
 */
export function isZeroPriceSupported(m: ZeroPriceMention, g: CopyGrounding): boolean {
  if (g.zeroPrice.length === 0) return false;
  if (m.object.length === 0) return true;
  // Asymmetric on purpose. The OPERATOR'S head has to appear somewhere in the
  // copy's phrase, so "what the free inspection gives you" still reads as the
  // inspection, while "a complimentary roof replacement quote" does not become
  // the inspection just because both mention a roof.
  return g.zeroPrice.some((known) => known.includes("*") || known.some((k) => m.object.includes(k)));
}

/** The zero-price claims in one line of copy that nobody supplied. */
export function unsupportedZeroPriceClaims(text: string, g: CopyGrounding): ZeroPriceMention[] {
  return extractZeroPriceMentions(text).filter((m) => !isZeroPriceSupported(m, g));
}

export interface CopyGrounding {
  money: Set<number>;
  percent: Set<number>;
  multiple: Set<number>;
  ratio: Set<string>;
  vague: Set<string>;
  /** value → the units the operator counted with it; `null` = any unit
   *  (a typed channel carries a value, not a phrase). */
  plain: Map<number, (string[] | null)[]>;
  /**
   * WHAT THE OPERATOR SAID WAS FREE, and of what.
   *
   * Each entry holds the object of one zero-price statement. An EMPTY entry is
   * a zero-price fact that named nothing ("there is nothing to buy") and
   * licenses only equally unattached copy, never a claim about a specific
   * offer. `["*"]` is the typed pricing channel stating the offer costs
   * nothing, which licenses any object on that offer. No entries at all means
   * this business never said anything was free.
   */
  zeroPrice: string[][];
}

/** @deprecated The grounding covers more than numbers now. */
export type NumericGrounding = CopyGrounding;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyCopyGrounding(): CopyGrounding {
  return { money: new Set(), percent: new Set(), multiple: new Set(), ratio: new Set(), vague: new Set(), plain: new Map(), zeroPrice: [] };
}

function addPlain(g: CopyGrounding, value: number, unit: string[] | null) {
  const key = round2(value);
  const list = g.plain.get(key) ?? [];
  list.push(unit);
  g.plain.set(key, list);
}

/**
 * The figures a page may state: what the OPERATOR wrote, plus the typed
 * channels that exist to carry a number. Model-authored copy is never a source.
 */
export function buildCopyGrounding(sources: {
  operatorStatements?: readonly string[];
  priceCents?: number | null;
  typedValues?: readonly number[];
}): CopyGrounding {
  const g = emptyCopyGrounding();
  for (const s of sources.operatorStatements ?? []) {
    for (const m of extractNumericMentions(s)) {
      if (m.kind === "money") {
        g.money.add(round2(m.value));
        addPlain(g, m.value, m.unit);
      } else if (m.kind === "percent") g.percent.add(round2(m.value));
      else if (m.kind === "multiple") g.multiple.add(round2(m.value));
      else if (m.kind === "ratio") g.ratio.add(`${round2(m.value)}/${round2(m.of ?? 0)}`);
      else if (m.kind === "vague") g.vague.add(m.word ?? "");
      else addPlain(g, m.value, m.unit);
    }
  }
  // THE OPERATOR SAYS IT IN WORDS, THE PAGE SAYS IT IN DIGITS. "Evening
  // appointments twice a week" was restated as "two evenings a week", and "when
  // volume doubles" as "2x volume": the same facts, and refusing them would
  // punish faithful copy. Read on the grounding side only, so an unsupported
  // "twice as fast" in generated copy is not newly refused by this.
  for (const s of sources.operatorStatements ?? []) {
    const tokens = tokenizeNumeric(s);
    tokens.forEach((t, i) => {
      if (t === "twice") addPlain(g, 2, collectUnit(tokens, i + 1));
      if (/^doubl(?:e|es|ed|ing)$/.test(t)) {
        g.multiple.add(2);
        addPlain(g, 2, null);
      }
    });
  }
  // WHAT THE OPERATOR SAID WAS FREE, and of what.
  for (const st of sources.operatorStatements ?? []) {
    for (const m of extractZeroPriceMentions(st)) g.zeroPrice.push(m.head ? [m.head] : []);
  }
  // A typed price of exactly zero is the pricing channel saying the offer
  // costs nothing; it names no object, so it grounds the offer generally.
  if (sources.priceCents === 0) g.zeroPrice.push(["*"]);
  if (typeof sources.priceCents === "number" && Number.isFinite(sources.priceCents) && sources.priceCents > 0) {
    g.money.add(round2(sources.priceCents / 100));
  }
  for (const v of sources.typedValues ?? []) {
    if (Number.isFinite(v)) addPlain(g, v, null);
  }
  return g;
}

/** Is this mention backed by the grounding, or structurally not a claim? */
export function isNumericMentionSupported(m: NumericMention, g: CopyGrounding): boolean {
  switch (m.kind) {
    case "money":
      return g.money.has(round2(m.value));
    case "percent":
      return g.percent.has(round2(m.value));
    case "multiple":
      return g.multiple.has(round2(m.value));
    case "ratio":
      return g.ratio.has(`${round2(m.value)}/${round2(m.of ?? 0)}`);
    case "vague":
      return g.vague.has(m.word ?? "");
    default: {
      const countsClaim = m.unit.some((u) => CLAIM_UNITS.has(u));
      // "the three that matter", "two things": a writer enumerating their own
      // points, not a count of anything in the world.
      if (m.spelled && !countsClaim) return true;
      const entries = g.plain.get(round2(m.value));
      if (!entries || entries.length === 0) return false;
      if (!countsClaim) return true;
      return entries.some((u) => u === null || u.some((x) => m.unit.includes(x)));
    }
  }
}

/** The unsupported numeric claims in one line of copy. */
export function unsupportedNumericClaims(text: string, g: CopyGrounding): NumericMention[] {
  return extractNumericMentions(text).filter((m) => !isNumericMentionSupported(m, g));
}

/**
 * Remove every SENTENCE that states an unsupported figure. Lines and paragraph
 * breaks are kept; a label with no sentence boundary is removed whole.
 */
export function stripUnsupportedNumericClaims(text: string, g: CopyGrounding): { text: string; dropped: string[] } {
  return stripSentencesWhere(text, (s) => unsupportedNumericClaims(s, g).length > 0);
}

/**
 * Remove every SENTENCE stating a fact nobody supplied — an ungrounded figure
 * or an ungrounded price of zero. One pass, because a sentence carrying either
 * is equally unusable, and because the caller should not have to know how many
 * claim families exist.
 */
export function stripUngroundedClaims(text: string, g: CopyGrounding): { text: string; dropped: string[] } {
  return stripSentencesWhere(
    text,
    (s) => unsupportedNumericClaims(s, g).length > 0 || unsupportedZeroPriceClaims(s, g).length > 0,
  );
}

function stripSentencesWhere(text: string, isUngrounded: (sentence: string) => boolean): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const lines = text.split("\n").map((line) => {
    if (!line.trim()) return line;
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => {
      if (!isUngrounded(s)) return true;
      dropped.push(s.trim());
      return false;
    });
    return kept.join(" ");
  });
  if (dropped.length === 0) return { text, dropped };
  const joined = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: joined, dropped };
}

/**
 * The operator's own sentences that carry a figure — the only prose allowed to
 * ground a number. Taken from what the operator TYPED, never from anything the
 * model wrote, and bounded so it cannot bloat the proposal it travels with.
 */
export function operatorFigureStatements(userMessages: readonly string[]): string[] {
  const out: string[] = [];
  for (const msg of userMessages) {
    for (const sentence of msg.split(/(?<=[.!?])\s+|\n+/)) {
      const s = sentence.trim();
      if (
        s &&
        (extractNumericMentions(s).length > 0 ||
          extractZeroPriceMentions(s).length > 0 ||
          /\b(?:twice|doubl(?:e|es|ed|ing))\b/i.test(s))
      ) {
        out.push(s.slice(0, 400));
      }
    }
  }
  return out.slice(-60);
}
