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
  // WHERE THE PEOPLE ARE IS NOT A SERVICE AREA EITHER.
  //
  // With ownership blocked, the very next Summit generation produced the badge
  // "Local Houston crew" — from the same single fact, that the business serves
  // Houston. It is the identical inference wearing a different noun: a company
  // that serves a city may subcontract it, dispatch into it regionally, or run
  // the work remotely, and none of that is knowable from the service area. So
  // the rule generalises from ownership to the composition and location of the
  // people, because that is the class the model kept reaching for.
  //
  // "local" directly modifying the people, which is how it is written:
  /\blocal(?:ly)?[\s-]+(crew|team|staff|technicians?|installers?|tradespeople|workforce|employees?|people)\b/i,
  // ... and across an intervening PLACE NAME: "Local Houston crew".
  //
  // The gap is Title Case and three letters or more, deliberately, so a place
  // name is admitted and a service term is not: "Local SEO experts" and "local
  // search specialists" describe what a business DOES and would be real content
  // to delete. Under-matching an all-caps badge is the cheaper error — this
  // module's whole stance is that a rule which eats honest copy is worse than
  // the claim it removes.
  /\b[Ll]ocal(?:ly)?[\s-]+[A-Z][a-z]{2,}[\s-]+(crew|team|staff|technicians?|installers?|tradespeople|workforce|employees?)\b/,
  // Employment/location of the business stated outright.
  /\blocal(?:ly)?[\s-]+(based|staffed|employed|hired)\b/i,
  // The reverse construction: "Crew based locally", "team living locally".
  /\b(crew|team|staff|technicians?|installers?|workforce)\b[\s,]+(?:who|that|is|are|all)?[\s]*(based|located|liv(?:e|es|ing)|hired|works?|working)[\s]+(?:right[\s]+)?local(?:ly)?\b/i,
  /\b(?:100%|wholly|fully)\s+(?:australian|american|british|canadian|local)[\s-]*owned\b/i,
];

/** Does this line assert an ownership, governance or staffing status the
 *  business never stated? */
export function isUnsupportedTrustClaim(text: string): boolean {
  return UNSUPPORTED_CLAIM_PATTERNS.some((re) => re.test(text));
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
