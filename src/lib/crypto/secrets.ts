import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * App-level encryption for per-tenant financial secrets (Stripe secret
 * keys, webhook signing secrets) — the first thing this codebase stores
 * that can move real money, unlike every other stored credential
 * (Twilio authToken, etc.) which relies on server-only Admin SDK access +
 * Firestore rules alone. AES-256-GCM, keyed by TENANT_SECRETS_KEY.
 *
 * Rotating TENANT_SECRETS_KEY is NOT like rotating an HMAC secret
 * elsewhere in this app (e.g. AUTOMATIONS_TOKEN_SECRET) — those only
 * invalidate outstanding tokens, which get re-minted on next send. This
 * key protects already-stored ciphertext: rotating it without re-encrypting
 * every subAccounts/*.stripeConfig row first makes every connected
 * tenant's stored key undecryptable, breaking their live checkout until
 * they notice and reconnect. See scripts/rotate-tenant-secrets-key.ts for
 * the supported rotation procedure — there is no self-service UI for this.
 */

const ALGO = "aes-256-gcm";
const KEY_ENV = "TENANT_SECRETS_KEY";
const VERSION = "v1";

function loadKey(envVarName: string): Buffer {
  const raw = process.env[envVarName]?.trim();
  if (!raw) {
    throw new Error(`${envVarName} is not set. Add it to your .env.local file.`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `${envVarName} must decode to 32 bytes (generate with: openssl rand -base64 32).`,
    );
  }
  return key;
}

export function tenantSecretsConfigured(): boolean {
  return !!process.env[KEY_ENV]?.trim();
}

/** Encrypts with the live TENANT_SECRETS_KEY. Returns "v1:<iv>:<tag>:<ct>" (all base64). */
export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, loadKey(KEY_ENV));
}

/** Decrypts a value produced by encryptSecret(), using the live TENANT_SECRETS_KEY. */
export function decryptSecret(stored: string): string {
  return decryptWithKey(stored, loadKey(KEY_ENV));
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

function decryptWithKey(stored: string, key: Buffer): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed or unsupported ciphertext version.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
