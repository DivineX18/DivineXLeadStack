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

/** Does this line assert an ownership, governance or staffing status the
 *  business never stated? */
export function isUnsupportedTrustClaim(text: string): boolean {
  return UNSUPPORTED_CLAIM_PATTERNS.some((re) => re.test(text)) || assertsLocalPeople(text);
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
