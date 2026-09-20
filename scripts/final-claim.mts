/**
 * FINAL E2E — Step 2. A genuine authenticated claim.
 *
 * Clerk's Backend API refuses to mint sessions on a live instance ("only valid
 * for development instances") — correct, and the same reason the dev-auth
 * bypass is dead in production. So the QA identity signs in the way a customer
 * following a magic link does: a sign-in TICKET is redeemed against Clerk's own
 * Frontend API, which issues a real session, and the claim is made with the
 * session JWT that session produces. The API validates it like any browser's.
 *
 * The app's own React shell could not be used for this — its Clerk proxy
 * (/api/__clerk) returns 400 in production, so Clerk never initialises there.
 * That is a real frontend defect, reported separately; it does not change what
 * this step proves, because the ticket exchange performed here IS the exchange
 * that shell would perform.
 *
 * No dev bypass, no fabricated token, no manual database rows.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync("/Users/boss/DivineX-Business-Intelligence/.env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const ASCEND = "https://divinex-business-intelligence.onrender.com";
const FAPI = "https://clerk.app.divinex.io";
const CLERK = process.env.CLERK_SECRET_KEY!;
const USER_ID = process.env.QA_CLERK_USER!;
const CLAIM_TOKEN = process.env.CLAIM_TOKEN!;

// 1. Mint a sign-in ticket for the QA identity (what a magic-link email holds).
const ticket = await (
  await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, expires_in_seconds: 900 }),
  })
).json();
if (!ticket?.token) { console.log("no sign-in ticket:", JSON.stringify(ticket).slice(0, 300)); process.exit(1); }

// 2. Redeem it at Clerk's Frontend API — the browser's own exchange.
const qs = "__clerk_api_version=2025-04-10&_clerk_js_version=5.0.0";
const si = await fetch(`${FAPI}/v1/client/sign_ins?${qs}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ strategy: "ticket", ticket: ticket.token }).toString(),
});
const siBody = (await si.json()) as any;
const createdSessionId = siBody?.response?.created_session_id ?? siBody?.client?.sessions?.[0]?.id;
console.log("sign_in ->", si.status, "status:", siBody?.response?.status, "session:", createdSessionId);
if (!createdSessionId) { console.log(JSON.stringify(siBody).slice(0, 500)); process.exit(1); }

// 3. The session JWT. It is already in the sign-in response — the same token
// Clerk's frontend caches as `last_active_token` — so there is no second
// round-trip, and no dependence on carrying a client cookie by hand.
const jwt = siBody?.client?.sessions?.[0]?.last_active_token?.jwt;
console.log("session token ->", jwt ? `ISSUED (${String(jwt).length} chars)` : "ABSENT");
if (!jwt) { console.log(JSON.stringify(siBody).slice(0, 400)); process.exit(1); }

// 4. The claim, as an ordinary authenticated request.
const claim = await fetch(`${ASCEND}/api/zeno/growth-scan/claim`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ claimToken: CLAIM_TOKEN }),
});
const claimed = (await claim.json()) as any;
console.log("\n=== CLAIM ===");
console.log("  status            :", claim.status);
console.log("  scanId            :", claimed.scanId);
console.log("  businessProfileId :", claimed.businessProfileId);
console.log("  convergenceToken  :", claimed.convergenceToken ? "ISSUED" : "ABSENT");
if (claimed.convergenceToken) console.log("\nCONVERGENCE_TOKEN=" + claimed.convergenceToken);
