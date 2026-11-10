/**
 * Safe, read-only diagnostic for the exact failure reported on
 * flow-growth-scan-staging (2026-11-09):
 *
 *   gRPC 16 UNAUTHENTICATED: invalid authentication credentials
 *
 * This narrows between the three real, distinct causes Task 2 of the
 * "Firebase Admin authentication fix" command asks about, in order:
 *
 *   (a) MALFORMED KEY — the value fails to parse as PEM at all (stray
 *       quote characters, truncation, a bad copy-paste). Caught locally,
 *       no network call made. Fixed in src/lib/firebase/private-key.ts;
 *       this script applies that exact function before testing.
 *   (b) WRONG/REVOKED CREDENTIAL — the key parses fine as PEM, but Google's
 *       OAuth token endpoint rejects the client_email + private_key pair
 *       (mismatched pair from two different downloads, a revoked/deleted
 *       key, a disabled service account, or clock skew).
 *   (c) FIRESTORE/PROJECT PROBLEM — the credential is valid and Google
 *       issues a token, but Firestore itself rejects the read for this
 *       project (API not enabled, no database provisioned, wrong project).
 *
 * Never prints the private key or any substring of it — only shape facts
 * (length, whether it's quote-wrapped, whether it has escaped vs real
 * newlines) and whatever error TEXT Google's own servers return.
 *
 * Refuses to run against the production Firebase project
 * (FIREBASE_ADMIN_PROJECT_ID === "ascend-crm-jvm") by default, per this
 * sprint's standing isolation rule — even though every call this script
 * makes is read-only. Override with ALLOW_PRODUCTION_FIREBASE_READ=true
 * if you genuinely need to diagnose production (don't, without asking).
 *
 * Run wherever the REAL env vars live for the target you're diagnosing —
 * e.g. a Render shell on flow-growth-scan-staging, or locally with
 * .env.staging.local loaded:
 *
 *   npx tsx scripts/diagnose-firebase-admin-credential.mts
 */
import { createPrivateKey } from "node:crypto";
import { cert } from "firebase-admin/app";
import { normalizeFirebasePrivateKey } from "../src/lib/firebase/private-key.ts";

const PRODUCTION_FIREBASE_PROJECT_ID = "ascend-crm-jvm";

function fail(msg: string): never {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}
function warn(msg: string) {
  console.warn(`WARN  ${msg}`);
}
function pass(msg: string) {
  console.log(`PASS  ${msg}`);
}
function info(msg: string) {
  console.log(`INFO  ${msg}`);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawKey) {
  fail(
    "One or more of FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY is unset in this shell. Run this where the real target env vars are actually loaded.",
  );
}

if (
  projectId === PRODUCTION_FIREBASE_PROJECT_ID &&
  process.env.ALLOW_PRODUCTION_FIREBASE_READ !== "true"
) {
  fail(
    `FIREBASE_ADMIN_PROJECT_ID is "${PRODUCTION_FIREBASE_PROJECT_ID}" — the production project. Refusing to run, even read-only, against production without ALLOW_PRODUCTION_FIREBASE_READ=true.`,
  );
}

console.log("=== Firebase Admin credential diagnostic (read-only, no secrets printed) ===");
console.log(`Target project: ${projectId}`);
console.log(`Client email:   ${clientEmail}`);
console.log("");

// --- Shape diagnostics (no secret content ever printed) ---
const startsWithQuote = rawKey.startsWith('"') || rawKey.startsWith("'");
const endsWithQuote = rawKey.trimEnd().endsWith('"') || rawKey.trimEnd().endsWith("'");
const hasEscapedNewlines = rawKey.includes("\\n");
const hasRealNewlines = rawKey.includes("\n");

info(`Raw value length: ${rawKey.length} characters`);
info(`Raw value is quote-wrapped: ${startsWithQuote && endsWithQuote}`);
info(`Raw value contains escaped \\n sequences: ${hasEscapedNewlines}`);
info(`Raw value contains real newline characters: ${hasRealNewlines}`);

if (startsWithQuote || endsWithQuote) {
  warn(
    "The raw value appears to be wrapped in literal quote characters. That's .env.local file syntax, not part of the key — Render's own normalizeFirebasePrivateKey() now strips a matched pair automatically, but if only ONE side has a quote (a partial/corrupted paste), stripping won't apply and the key will fail to parse below.",
  );
}

// --- Apply the exact same transform admin.ts now uses ---
const transformedKey = normalizeFirebasePrivateKey(rawKey);

try {
  createPrivateKey(transformedKey!);
  pass("After normalization, the value parses as a syntactically valid PEM private key.");
} catch (err) {
  fail(
    `After normalization, Node's crypto module could NOT parse this as a valid private key: "${err instanceof Error ? err.message : String(err)}". ` +
      "This is a MALFORMED-KEY problem (bucket a) — the fix is in the Render VALUE itself (truncation, a partial quote, or a dropped character from copy-paste), not in application code. Regenerate/re-paste the full private_key field from a fresh service-account JSON download for this project.",
  );
}

// --- Attempt an actual token mint against Google's OAuth servers ---
// This is the ONLY way to distinguish "malformed key" (already ruled out
// above) from "well-formed but wrong/revoked key" (only Google can say).
// Uses firebase-admin's own cert() Credential — the exact same credential
// object admin.ts constructs — so this reproduces the real code path
// exactly, just without ever calling Firestore directly.
const credential = cert({
  projectId,
  clientEmail,
  privateKey: transformedKey,
});

let accessToken: string;
try {
  const tokenResponse = await credential.getAccessToken();
  accessToken = tokenResponse.access_token;
  pass(
    "Google's OAuth token endpoint ACCEPTED this client_email + private_key pair and issued an access token. The credential itself is valid and current — not revoked, not mismatched, no clock-skew problem.",
  );
} catch (err) {
  fail(
    `Google's OAuth token endpoint REJECTED this client_email + private_key pair: "${err instanceof Error ? err.message : String(err)}". ` +
      "This is a WRONG/REVOKED CREDENTIAL problem (bucket b), not a formatting problem (the key parsed as valid PEM above). Most likely: (1) client_email and private_key were pasted from two DIFFERENT service-account key downloads and don't belong to the same pair, (2) this specific key has been deleted/revoked in GCP Console → IAM & Admin → Service Accounts → " +
      `${clientEmail} → Keys, or (3) the service account itself is disabled. Generate ONE fresh service-account key for project "${projectId}" and replace BOTH FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY together from that same download — never mix fields from two different downloads.`,
  );
}

// --- Prove Firestore itself is reachable for this exact project ---
const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/appConfig/main`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

if (res.status === 200 || res.status === 404) {
  // 404 here just means "no such document" — a fine, expected outcome that
  // still proves auth + project + the Firestore API all work together.
  pass(
    `Firestore REST read against project "${projectId}" returned HTTP ${res.status} — credential, project, and Firestore API all working correctly together. If the deployed app is STILL failing with gRPC 16 after this, the running Render service is very likely holding STALE env var values (saved before a key rotation, or a deploy that hasn't picked up a recent env var change) — re-save the env vars (even to the same value) and/or trigger a fresh deploy to force Render to reload them.`,
  );
} else {
  const body = await res.text();
  fail(
    `Firestore REST read against project "${projectId}" returned HTTP ${res.status}: ${body.slice(0, 500)}. The OAuth credential is valid (confirmed above) but Firestore rejected the request for this project (bucket c) — check that the Firestore API is enabled for "${projectId}" and that a Firestore database is actually provisioned there (Firebase Console → Firestore Database should show a live "Native mode" database, not an empty "Create database" screen).`,
  );
}

console.log("");
console.log("=== RESULT: credential + project + Firestore all verified working. ===");
