/**
 * OWNERSHIP IS NOT A PLACE.
 *
 * A generated Summit Roofing page shipped the trust badge "Locally owned in
 * Houston". Houston was verified — the business says it serves Houston
 * homeowners. Local ownership was never stated by anyone. The model reached it
 * by treating a service-area fact as evidence of an ownership structure, which
 * is the same move as inferring tenure from an established-looking brand.
 *
 * That class of claim is worth more to a buyer than almost anything else on the
 * page, which is exactly why it cannot be inferred. "Family owned", "veteran
 * owned", "woman owned", "independently owned", "founder led" all carry legal,
 * demographic or governance meaning that a location, a service area or a tone
 * of voice cannot establish.
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
 * Ownership, governance and affiliation claims. Each needs an explicit
 * statement from the business; none can be derived from anything the generator
 * has access to.
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
  /\b(?:100%|wholly|fully)\s+(?:australian|american|british|canadian|local)[\s-]*owned\b/i,
];

/** Does this line assert an ownership or governance status? */
export function isUnsupportedOwnershipClaim(text: string): boolean {
  return UNSUPPORTED_CLAIM_PATTERNS.some((re) => re.test(text));
}

/**
 * Remove any line asserting an unverifiable ownership status.
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
    if (isUnsupportedOwnershipClaim(line)) dropped.push(line);
    else kept.push(line);
  }
  return { kept, dropped };
}
