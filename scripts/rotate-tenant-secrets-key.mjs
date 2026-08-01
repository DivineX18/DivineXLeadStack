// Ops-only key rotation for TENANT_SECRETS_KEY — the AES key that encrypts
// every connected sub-account's Stripe secret key + webhook signing secret
// (see src/lib/crypto/secrets.ts). Rotating that env var WITHOUT running
// this first makes every already-stored ciphertext undecryptable, breaking
// live checkout for every connected tenant until they reconnect.
//
// Usage:
//   OLD_TENANT_SECRETS_KEY=... NEW_TENANT_SECRETS_KEY=... node scripts/rotate-tenant-secrets-key.mjs
//
// Re-encrypts subAccounts/*.stripeConfig.{secretKeyEncrypted,webhookSecretEncrypted}
// in place, one sub-account at a time. Not exposed via any UI/route —
// deliberately a manual, deploy-access-gated operation (see the "Key
// rotation" section of CLAUDE.md's Funnel Checkout docs).

import { readFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

function loadKey(base64Key, label) {
  if (!base64Key) throw new Error(`${label} is not set.`);
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error(`${label} must decode to 32 bytes.`);
  return key;
}

function encryptWithKey(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

function decryptWithKey(stored, key) {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed or unsupported ciphertext version.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Load .env.local manually (no dotenv dependency assumed), same pattern as
// the other one-off scripts in this directory.
const env = {};
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
} catch {
  // .env.local optional — real env vars (e.g. in CI) still work via process.env.
}

const oldKey = loadKey(process.env.OLD_TENANT_SECRETS_KEY, "OLD_TENANT_SECRETS_KEY");
const newKey = loadKey(process.env.NEW_TENANT_SECRETS_KEY, "NEW_TENANT_SECRETS_KEY");

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL ?? process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();
const snap = await db
  .collection("subAccounts")
  .where("stripeConfig", "!=", null)
  .get();

if (snap.empty) {
  console.log("No sub-accounts have a connected stripeConfig. Nothing to rotate.");
  process.exit(0);
}

console.log(`Rotating stripeConfig for ${snap.size} sub-account(s)...`);

let ok = 0;
let failed = 0;
for (const doc of snap.docs) {
  const config = doc.data().stripeConfig;
  try {
    const secretKey = decryptWithKey(config.secretKeyEncrypted, oldKey);
    const webhookSecret = decryptWithKey(config.webhookSecretEncrypted, oldKey);
    await doc.ref.update({
      "stripeConfig.secretKeyEncrypted": encryptWithKey(secretKey, newKey),
      "stripeConfig.webhookSecretEncrypted": encryptWithKey(webhookSecret, newKey),
    });
    console.log(`  ok: ${doc.id}`);
    ok++;
  } catch (err) {
    console.error(`  FAILED: ${doc.id} — ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\nDone. ${ok} re-encrypted, ${failed} failed.`);
if (failed > 0) {
  console.log(
    "Investigate failures before deploying NEW_TENANT_SECRETS_KEY as TENANT_SECRETS_KEY — " +
      "any un-rotated sub-account will go dark until it reconnects.",
  );
  process.exit(1);
}
console.log(
  "Safe to deploy NEW_TENANT_SECRETS_KEY as the live TENANT_SECRETS_KEY now.",
);
