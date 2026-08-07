/**
 * Regression coverage for the audit pass on two features that turned out to
 * already be fully built (Funnel Checkout / BYO-Stripe, and the GHL
 * migration importer) — neither had any test coverage before this. Three
 * real bugs were found and fixed:
 *
 *  1. The off-session upsell/downsell charge (POST /api/lp/[funnelId]/
 *     upsell/[sectionId]/charge) called stripe.paymentIntents.create() with
 *     no idempotency key — a network retry or double-click could charge the
 *     customer's saved card twice for the same upsell.
 *  2. materializeCheckoutPrice()'s early-return path (reuse the existing
 *     Stripe Price when price/currency/billing haven't changed) skipped the
 *     product-name sync entirely — an operator editing ONLY a checkout
 *     section's headline never saw that reflected in their own Stripe
 *     Dashboard's product name.
 *  3. The GHL Private Integration Token (full read access to a client's
 *     entire CRM) was stored and read as PLAINTEXT in
 *     subAccounts/{id}.ghlImportConfig.token. Firestore rules let ANY
 *     active sub-account member (not just admins) read the whole
 *     subAccounts/{id} doc client-side, so this was a real, exploitable
 *     info-disclosure bug, not just theoretical — mirrors exactly what
 *     encryptSecret()/decryptSecret() (lib/crypto/secrets.ts) already
 *     protects the Stripe secret key against.
 *
 * Verified as NOT a bug during the same pass: Stripe's optional_items (the
 * order bump) IS supported alongside mode: "subscription" (confirmed
 * against Stripe's own API docs) — the original build plan had flagged
 * this as an open question; it resolves cleanly with no code change needed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// A throwaway 32-byte key for this run only — never touches any real
// deployment's TENANT_SECRETS_KEY.
process.env.TENANT_SECRETS_KEY = randomBytes(32).toString("base64");

// ── 1. Encryption round-trip (lib/crypto/secrets.ts) ──────────────────────
{
  const { encryptSecret, decryptSecret, tenantSecretsConfigured } = await import(
    "../src/lib/crypto/secrets.ts"
  );
  check("1a. tenantSecretsConfigured() is true once TENANT_SECRETS_KEY is set", tenantSecretsConfigured());

  const plaintext = "pit-abc123-this-is-a-fake-ghl-token";
  const ciphertext = encryptSecret(plaintext);
  check("1b. Ciphertext is not the plaintext", ciphertext !== plaintext);
  check("1c. Ciphertext carries the v1 version prefix", ciphertext.startsWith("v1:"));
  check("1d. Round-trip decrypt recovers the exact original plaintext", decryptSecret(ciphertext) === plaintext);

  let threw = false;
  try {
    decryptSecret("v1:not:a:realtoken");
  } catch {
    threw = true;
  }
  check("1e. Decrypting malformed/tampered ciphertext throws rather than returning garbage", threw);
}

// ── 2. Upsell off-session charge carries an idempotency key ───────────────
{
  const src = read("src/app/api/lp/[funnelId]/upsell/[sectionId]/charge/route.ts");
  check(
    "2a. paymentIntents.create() is called with an idempotencyKey (prevents double-charge on retry)",
    /paymentIntents\.create\(\s*\{[\s\S]{0,1200}\{\s*idempotencyKey\s*\}[\s\S]{0,20}\)/.test(src),
  );
  check(
    "2b. The idempotency key is deterministic per (checkoutSessionId, sectionId) — same retry reuses it",
    src.includes("`funnel-upsell:${body.checkoutSessionId}:${sectionId}`"),
  );
}

// ── 3. materializeCheckoutPrice syncs the product name unconditionally ────
{
  const { materializeCheckoutPrice } = await import("../src/lib/funnels/materialize-price.ts");

  const updateCalls: { id: string; params: { name?: string } }[] = [];
  const priceUpdateCalls: string[] = [];
  const fakeStripe = {
    products: {
      create: async () => ({ id: "prod_new" }),
      update: async (id: string, params: { name?: string }) => {
        updateCalls.push({ id, params });
        return {};
      },
    },
    prices: {
      create: async () => ({ id: "price_new" }),
      update: async (id: string) => {
        priceUpdateCalls.push(id);
        return {};
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  // Headline-only edit: price/currency/billing all unchanged.
  const result = await materializeCheckoutPrice(
    fakeStripe,
    { productName: "New headline", priceCents: 4700, currency: "usd", billingMode: "one_time" },
    {
      productName: "Old headline",
      priceCents: 4700,
      currency: "usd",
      billingMode: "one_time",
      stripeProductId: "prod_existing",
      stripePriceId: "price_existing",
    },
  );

  check("3a. Headline-only edit reuses the existing Price (no new Price minted)", result.stripePriceId === "price_existing");
  check(
    "3b. Headline-only edit STILL calls products.update with the new name (the bug: this used to be skipped)",
    updateCalls.length === 1 && updateCalls[0].id === "prod_existing" && updateCalls[0].params.name === "New headline",
  );
  check("3c. No stale price gets deactivated when only the name changed", priceUpdateCalls.length === 0);

  // A real price change DOES mint a new Price and deactivate the old one.
  updateCalls.length = 0;
  priceUpdateCalls.length = 0;
  const result2 = await materializeCheckoutPrice(
    fakeStripe,
    { productName: "New headline", priceCents: 9900, currency: "usd", billingMode: "one_time" },
    {
      productName: "New headline",
      priceCents: 4700,
      currency: "usd",
      billingMode: "one_time",
      stripeProductId: "prod_existing",
      stripePriceId: "price_existing",
    },
  );
  check("3d. A real price change mints a new Price object", result2.stripePriceId === "price_new");
  check("3e. A real price change deactivates the old Price", priceUpdateCalls.includes("price_existing"));
}

// ── 4. GHL token is encrypted at rest, never plaintext ─────────────────────
{
  const typesSrc = read("src/types/tenancy.ts");
  check(
    "4a. GhlImportConfig stores tokenEncrypted, not a plaintext token field",
    /interface GhlImportConfig[\s\S]{0,300}tokenEncrypted:\s*string/.test(typesSrc) &&
      !/interface GhlImportConfig[\s\S]{0,300}\n\s*token:\s*string/.test(typesSrc),
  );

  const files = [
    "src/app/api/sub-accounts/[id]/import/ghl/connect/route.ts",
    "src/app/api/sub-accounts/[id]/import/ghl/preview/route.ts",
    "src/app/api/sub-accounts/[id]/import/ghl/start/route.ts",
    "src/app/api/import/ghl/step/route.ts",
  ];
  for (const f of files) {
    const src = read(f);
    // Distinguish "cfg.token" (the old plaintext field, bad) from
    // "cfg.tokenEncrypted"/"cfg?.tokenEncrypted" (the fix, contains
    // "cfg.token" as a substring — must not false-positive on it).
    const bad = /cfg\??\.token\b(?!Encrypted)/.test(src);
    check(`4b. ${f} never references a plaintext cfg.token`, !bad);
  }
  check(
    "4c. connect/route.ts encrypts before storing",
    read("src/app/api/sub-accounts/[id]/import/ghl/connect/route.ts").includes("encryptSecret(token)"),
  );
  check(
    "4d. step/route.ts decrypts before calling the GHL API, and fails the job cleanly on a bad key",
    read("src/app/api/import/ghl/step/route.ts").includes("decryptSecret(cfg.tokenEncrypted)"),
  );
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
