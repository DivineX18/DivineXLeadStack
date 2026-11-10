/**
 * Regression test for src/lib/firebase/private-key.ts, written for the
 * 2026-11-09 "Firebase Admin authentication fix" pass (gRPC 16
 * UNAUTHENTICATED on flow-growth-scan-staging).
 *
 * Generates its own throwaway PEM key pair (never touches a real secret,
 * never makes a network call) and feeds it through normalizeFirebasePrivateKey()
 * in every shape an operator could plausibly have pasted into Render:
 *   - correctly formatted already (escaped \n, no quotes)
 *   - real newlines already (multi-line env var field)
 *   - wrapped in literal double quotes (copied straight out of .env.local)
 *   - wrapped in literal single quotes
 *   - trailing/leading whitespace from a clipboard paste
 *   - quotes AND escaped newlines together (the most likely real mistake)
 * then asserts the result parses as a valid PEM private key via Node's
 * crypto module — the same parse firebase-admin/google-auth-library does
 * internally before ever making a network call.
 *
 *   npx tsx scripts/verify-firebase-private-key-normalization.mts
 */
import { generateKeyPairSync, createPrivateKey } from "node:crypto";
import { normalizeFirebasePrivateKey } from "../src/lib/firebase/private-key.ts";

let failed = false;
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failed = true;
};
const pass = (msg: string) => console.log(`PASS  ${msg}`);

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// The real PEM, with real newlines — this is what a service-account JSON's
// private_key field looks like once JSON.parse has unescaped it.
const realNewlineForm = privateKey.trim();
const escapedNewlineForm = realNewlineForm.replace(/\n/g, "\\n");

const cases: { label: string; input: string }[] = [
  { label: "already correct (escaped \\n, no quotes)", input: escapedNewlineForm },
  { label: "already correct (real newlines, no quotes)", input: realNewlineForm },
  { label: "wrapped in double quotes + escaped \\n (the .env.local paste mistake)", input: `"${escapedNewlineForm}"` },
  { label: "wrapped in single quotes + escaped \\n", input: `'${escapedNewlineForm}'` },
  { label: "wrapped in double quotes + real newlines", input: `"${realNewlineForm}"` },
  { label: "leading/trailing whitespace, otherwise correct", input: `  ${escapedNewlineForm}  \n` },
  { label: "whitespace AND quotes together", input: `  "${escapedNewlineForm}"  ` },
];

console.log("=== FIREBASE_ADMIN_PRIVATE_KEY normalization regression ===\n");

for (const { label, input } of cases) {
  const normalized = normalizeFirebasePrivateKey(input);
  try {
    if (!normalized) throw new Error("normalizeFirebasePrivateKey returned empty/undefined");
    createPrivateKey(normalized);
    pass(label);
  } catch (err) {
    fail(`${label} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Negative control: confirm the function does NOT silently "fix" a
// genuinely truncated/corrupted key — it should pass the (broken) value
// through, and the broken value should still fail to parse. This guards
// against the normalizer ever becoming a false-positive machine.
{
  const truncated = escapedNewlineForm.slice(0, Math.floor(escapedNewlineForm.length / 2));
  const normalized = normalizeFirebasePrivateKey(truncated);
  let threw = false;
  try {
    createPrivateKey(normalized ?? "");
  } catch {
    threw = true;
  }
  if (threw) {
    pass("negative control: a genuinely truncated key still fails to parse after normalization (no false positives)");
  } else {
    fail("negative control: a truncated key unexpectedly parsed successfully — normalizer is masking real corruption");
  }
}

// undefined/empty passthrough — admin.ts calls this unconditionally even
// when the env var is entirely unset.
{
  const result = normalizeFirebasePrivateKey(undefined);
  if (result === undefined) {
    pass("undefined input passes through as undefined (matches the old `?.replace(...)` optional-chaining behavior)");
  } else {
    fail(`undefined input should pass through as undefined, got: ${JSON.stringify(result)}`);
  }
}

console.log("");
if (failed) {
  console.error("=== RESULT: FAIL ===");
  process.exit(1);
} else {
  console.log("=== RESULT: PASS — all private-key shapes normalize to a parseable PEM. ===");
}
