import "server-only";

/**
 * ASCEND IS BOUGHT BY AN IDENTITY, NOT BY AN EMAIL.
 *
 * `/start` used to post the address from its own form straight to BI's
 * anonymous pay-first checkout. That endpoint has no session, so the webhook
 * completing it resolved the owner by looking the typed address up in Clerk
 * and creating a new account when nothing matched. A customer who already had
 * an Ascend account and typed a different address received a SECOND identity
 * holding the subscription, both entitlements, the Flow workspace and the
 * canonical mapping, while the account they sign in to showed nothing.
 *
 * Flow cannot detect that: Clerk here is a single-domain instance with no
 * satellite or proxy configuration, so a session on the Ascend app is simply
 * not visible to a page served from this one. Rather than guess, `/start`
 * stops selling. It keeps the presentation and hands the visitor to the
 * authenticated Ascend application, which establishes the Clerk identity
 * FIRST and only then creates the subscription against it.
 *
 * The acquisition context travels with them. A claim token is the customer's
 * own Growth Scan, and it must survive the handoff or their diagnosis does
 * not follow them into the product.
 *
 * THE PRODUCT IS NOT IN THIS URL. It is fixed by the destination route's own
 * registration on the Ascend side, so editing this link cannot change what is
 * being bought. Keeping it out of the query string is the whole point.
 */

/** The customer-facing Ascend application. NOT the BI service's raw Render
 *  host: Clerk's production instance is bound to this domain, so sending
 *  someone to the internal hostname would break authentication. Overridable
 *  for non-production deployments; defaulted so a missing env var cannot
 *  silently strand the front door. */
export function ascendAppOrigin(): string {
  const raw = process.env.ASCEND_APP_ORIGIN?.trim();
  return (raw || "https://ascend.divinex.io").replace(/\/+$/, "");
}

/**
 * Where `/start` sends someone who wants to buy Ascend.
 *
 * `/start-ascend` is the authenticated entry point: it renders Clerk signup
 * when there is no session, resumes on the same route afterwards (including
 * the OAuth return leg), converges any claim onto the authenticated identity,
 * and only then opens checkout — through the authenticated route, where the
 * owner is the Clerk user id rather than a billing address.
 */
export function ascendAcquisitionHandoffUrl(opts: { claimToken?: string | null }): string {
  const claim = opts.claimToken?.trim();
  const query = claim ? `?claim=${encodeURIComponent(claim)}` : "";
  return `${ascendAppOrigin()}/start-ascend${query}`;
}
