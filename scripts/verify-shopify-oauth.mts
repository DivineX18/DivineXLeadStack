/**
 * Shopify OAuth — the connect/callback security primitives, verified
 * directly against the real module rather than mocked, same convention
 * as verify-google-ads-activation.mts.
 *
 * Every positive check is paired with a MUTATION: the same assertion
 * against deliberately broken/tampered input, which must fail. An
 * assertion that passes either way is testing nothing.
 *
 * DELIBERATELY ABSENT: a real token exchange, a real refresh, a real
 * store's GraphQL response. Those need a live Shopify app + store
 * connection this deployment does not have yet (see the implementation
 * report) — fixtures invented before the first real call are exactly the
 * mistake this repo's own history (the Google Ads conversionsValue bug)
 * warns against.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-shopify-oauth.mts
 */

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};

process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret-for-state-signing";
process.env.SHOPIFY_OAUTH_CLIENT_SECRET ??= "test-client-secret-for-hmac";

const {
  SHOPIFY_SCOPES,
  signShopifyState,
  verifyShopifyState,
  verifyShopifyCallbackHmac,
  isValidShopDomain,
  normalizeShopDomain,
  buildShopifyOAuthUrl,
} = await import("../src/lib/shopify/oauth.ts");

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- least-privilege scopes for this slice --");
{
  ck("exactly read_orders and read_products -- nothing broader", JSON.stringify([...SHOPIFY_SCOPES].sort()) === JSON.stringify(["read_orders", "read_products"].sort()));
  ck("no customer-data scope requested (returning-vs-new customer segmentation is deferred)", !SHOPIFY_SCOPES.includes("read_customers" as never));
  ck("no read_all_orders (orders >60 days -- a protected scope needing separate Shopify approval, deferred)", !SHOPIFY_SCOPES.includes("read_all_orders" as never));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- shop domain normalization --");
{
  ck("a full myshopify.com URL normalizes to the bare domain", normalizeShopDomain("https://divinex-test-store.myshopify.com/admin") === "divinex-test-store.myshopify.com");
  ck("a bare handle gets .myshopify.com appended", normalizeShopDomain("divinex-test-store") === "divinex-test-store.myshopify.com");
  ck("already-canonical input round-trips unchanged", normalizeShopDomain("divinex-test-store.myshopify.com") === "divinex-test-store.myshopify.com");
  ck("MUTATION: a non-Shopify domain is refused, not coerced", normalizeShopDomain("evil.com/myshopify.com") === null);
  ck("MUTATION: an empty string is refused", normalizeShopDomain("") === null);
  ck("isValidShopDomain agrees with normalizeShopDomain's own output", isValidShopDomain(normalizeShopDomain("divinex-test-store")!));
  ck("MUTATION: isValidShopDomain refuses a domain that merely CONTAINS myshopify.com", !isValidShopDomain("myshopify.com.evil.net"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- CSRF state: sign/verify round-trip and tamper detection --");
{
  const state = signShopifyState("sub_123", "nonce_abc", "divinex-test-store.myshopify.com");
  const verified = verifyShopifyState(state);
  ck("a freshly signed state verifies and recovers the exact subAccountId and shop", verified?.subAccountId === "sub_123" && verified?.shop === "divinex-test-store.myshopify.com");

  ck("MUTATION: flipping one character in the signature is refused", verifyShopifyState(state.slice(0, -1) + (state.at(-1) === "a" ? "b" : "a")) === null);

  const [subAccountId, nonce, , sig] = state.split("|");
  const tamperedShop = `${subAccountId}|${nonce}|a-different-store.myshopify.com|${sig}`;
  ck("MUTATION: substituting a different shop while keeping the original signature is refused", verifyShopifyState(tamperedShop) === null);

  ck("MUTATION: a state with the wrong number of segments is refused", verifyShopifyState("not.enough.parts") === null);

  const noSecret = signShopifyState.toString(); // sanity: function exists before we blank the secret
  ck("signShopifyState is callable before the secret is cleared (sanity)", typeof noSecret === "string");
  const savedSecret = process.env.AUTOMATIONS_TOKEN_SECRET;
  delete process.env.AUTOMATIONS_TOKEN_SECRET;
  ck("MUTATION: with no secret configured, verification refuses rather than accepting", verifyShopifyState(state) === null);
  process.env.AUTOMATIONS_TOKEN_SECRET = savedSecret;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- Shopify's own callback HMAC, independent of our state --");
{
  // Shopify's documented construction: every param except hmac, sorted,
  // joined as key=value&key=value, HMAC-SHA256 with the client secret.
  const crypto = await import("node:crypto");
  function realShopifyHmac(params: Record<string, string>): string {
    const pairs = Object.entries(params).map(([k, v]) => `${k}=${v}`).sort();
    return crypto.createHmac("sha256", process.env.SHOPIFY_OAUTH_CLIENT_SECRET!).update(pairs.join("&")).digest("hex");
  }
  const baseParams = { code: "abc123", shop: "divinex-test-store.myshopify.com", state: "xyz", timestamp: "1700000000" };
  const validHmac = realShopifyHmac(baseParams);
  const validUrl = new URLSearchParams({ ...baseParams, hmac: validHmac });

  ck("a correctly-computed hmac verifies", verifyShopifyCallbackHmac(validUrl));

  const tamperedUrl = new URLSearchParams({ ...baseParams, shop: "attacker-store.myshopify.com", hmac: validHmac });
  ck("MUTATION: changing `shop` after signing invalidates the hmac", !verifyShopifyCallbackHmac(tamperedUrl));

  const noHmacUrl = new URLSearchParams(baseParams);
  ck("MUTATION: a request with no hmac param at all is refused", !verifyShopifyCallbackHmac(noHmacUrl));

  const wrongSecretHmac = crypto.createHmac("sha256", "wrong-secret").update(Object.entries(baseParams).map(([k, v]) => `${k}=${v}`).sort().join("&")).digest("hex");
  const wrongSecretUrl = new URLSearchParams({ ...baseParams, hmac: wrongSecretHmac });
  ck("MUTATION: an hmac computed with the wrong client secret is refused", !verifyShopifyCallbackHmac(wrongSecretUrl));

  const savedSecret = process.env.SHOPIFY_OAUTH_CLIENT_SECRET;
  delete process.env.SHOPIFY_OAUTH_CLIENT_SECRET;
  ck("MUTATION: with no client secret configured, verification refuses rather than accepting", !verifyShopifyCallbackHmac(validUrl));
  process.env.SHOPIFY_OAUTH_CLIENT_SECRET = savedSecret;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- authorize URL construction --");
{
  process.env.SHOPIFY_OAUTH_CLIENT_ID = "test-client-id";
  const url = new URL(
    buildShopifyOAuthUrl({
      shop: "divinex-test-store.myshopify.com",
      redirectUri: "https://crm.divinex.io/api/shopify/callback",
      state: "some-signed-state",
      scopes: SHOPIFY_SCOPES,
    }),
  );
  ck("the authorize URL is scoped to the SHOP's own domain, not a generic Shopify host", url.hostname === "divinex-test-store.myshopify.com");
  ck("the path is Shopify's documented authorize endpoint", url.pathname === "/admin/oauth/authorize");
  ck("the client_id param is present", url.searchParams.get("client_id") === "test-client-id");
  ck("scopes are comma-joined, matching Shopify's documented format (not space-joined, unlike Google)", url.searchParams.get("scope") === "read_orders,read_products");
  ck("the state param round-trips exactly, uninterpreted", url.searchParams.get("state") === "some-signed-state");
  ck("the redirect_uri param is present and exact", url.searchParams.get("redirect_uri") === "https://crm.divinex.io/api/shopify/callback");
}

console.log(fails === 0 ? "\nverify-shopify-oauth: all checks passed" : `\nverify-shopify-oauth: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
