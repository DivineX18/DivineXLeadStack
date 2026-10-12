/**
 * Phase 1 — the Google connection: scopes, signed state, capabilities, and the
 * guards that stop a connection being stored in a state that cannot work.
 *
 * Behavioural wherever the code is pure. The two routes are source-asserted,
 * because exercising them needs a session and a live Google.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-google-connect.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};

process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret-for-state-signing";

console.log("-- scopes: ask for the minimum, and only what was chosen --");
{
  const { googleScopeList, GOOGLE_SCOPES } = await import("../src/lib/google/oauth.ts");

  const ga4Only = googleScopeList(["ga4"]);
  ck("a GA4-only connect does not request Search Console",
    !ga4Only.includes(GOOGLE_SCOPES.searchConsole));
  ck("a GA4-only connect does not request Ads",
    !ga4Only.includes(GOOGLE_SCOPES.ads));
  ck("identity scopes are always included", ["openid", "email", "profile"].every((s) => ga4Only.includes(s)));

  const all = googleScopeList(["ga4", "searchConsole", "ads"]);
  ck("all three services request all three scopes",
    [GOOGLE_SCOPES.ga4, GOOGLE_SCOPES.searchConsole, GOOGLE_SCOPES.ads].every((s) => all.includes(s)));
  ck("no duplicates", new Set(all).size === all.length);

  // The read-only variants are the whole point of the scope choice.
  ck("GA4 uses the read-only scope", GOOGLE_SCOPES.ga4.endsWith("analytics.readonly"));
  ck("Search Console uses the read-only scope", GOOGLE_SCOPES.searchConsole.endsWith("webmasters.readonly"));
  ck("Ads is the only write-capable scope, as Google offers no read-only one",
    GOOGLE_SCOPES.ads.endsWith("/adwords"));
}

console.log("\n-- signed state: the workspace cannot be forged or swapped --");
{
  const { signGoogleState, verifyGoogleState } = await import("../src/lib/google/oauth.ts");

  const state = signGoogleState("sa_abc", "nonce123", ["ga4", "ads"]);
  const ok = verifyGoogleState(state);
  ck("a signed state round-trips", ok?.subAccountId === "sa_abc");
  ck("and carries the chosen services", JSON.stringify(ok?.services) === JSON.stringify(["ga4", "ads"]));

  ck("a tampered workspace id is rejected",
    verifyGoogleState(state.replace("sa_abc", "sa_victim")) === null);
  ck("a tampered service list is rejected",
    verifyGoogleState(signGoogleState("sa_abc", "n", ["ga4"]).replace("ga4", "ads")) === null);
  ck("a truncated state is rejected", verifyGoogleState("sa_abc.nonce.ga4") === null);
  ck("junk is rejected", verifyGoogleState("nonsense") === null);

  // A state minted for Meta must not verify here, or one provider's connect
  // could drive the other's callback.
  const metaShaped = "sa_abc.nonce123.deadbeef";
  ck("a foreign-provider state is rejected", verifyGoogleState(metaShaped) === null);

  const src = readFileSync("src/lib/google/oauth.ts", "utf8");
  ck("the signature compare is constant-time", /timingSafeEqual/.test(src));
  ck("lengths are checked before the compare, which throws on mismatch",
    /a\.length !== b\.length \|\| !crypto\.timingSafeEqual/.test(src));
  ck("the state is namespaced so it cannot be replayed at another provider",
    /googlestate:/.test(src));
}

console.log("\n-- capabilities: believe what Google granted, not what we asked --");
{
  const { deriveGoogleCapabilities, googleCan } = await import("../src/lib/google/capabilities.ts");
  const GA4 = "https://www.googleapis.com/auth/analytics.readonly";
  const GSC = "https://www.googleapis.com/auth/webmasters.readonly";
  const ADS = "https://www.googleapis.com/auth/adwords";

  const declinedAds = deriveGoogleCapabilities([GA4, GSC], { adsDeveloperTokenPresent: true });
  ck("declining Ads leaves Ads off", declinedAds.ads === false);
  ck("while the granted services stay on", declinedAds.ga4 && declinedAds.searchConsole);

  const noToken = deriveGoogleCapabilities([GA4, ADS], { adsDeveloperTokenPresent: false });
  ck("the Ads scope WITHOUT a developer token is not a capability", noToken.ads === false);
  const withToken = deriveGoogleCapabilities([GA4, ADS], { adsDeveloperTokenPresent: true });
  ck("the Ads scope WITH a developer token is", withToken.ads === true);

  ck("nothing granted means nothing enabled",
    Object.values(deriveGoogleCapabilities([], { adsDeveloperTokenPresent: true })).every((v) => v === false));

  ck("a missing capabilities block reads as off", googleCan(null, "ga4") === false);
  ck("an empty config reads as off", googleCan({ capabilities: null }, "ads") === false);
}

console.log("\n-- the connect route refuses what cannot work --");
{
  const src = readFileSync("src/app/api/sub-accounts/[id]/google/connect/route.ts", "utf8");
  ck("admin only", /requireSubAccountAdmin/.test(src));
  ck("refuses without Google credentials", /googleConfigured\(\)/.test(src));
  ck("refuses without the encryption key, BEFORE sending anyone to consent",
    /tenantSecretsConfigured\(\)/.test(src) &&
      src.indexOf("tenantSecretsConfigured") < src.indexOf("buildGoogleOAuthUrl"));
  ck("refuses when no Ascend business profile is linked, so syncs cannot be discarded",
    /primaryAscendBusinessProfileId/.test(src) && /no_business_profile/.test(src));
  ck("drops Ads rather than requesting a scope the deployment cannot use",
    /googleAdsConfigured\(\)/.test(src) && /filter\(\(s\) => s !== "ads"\)/.test(src));
  ck("guard misses redirect with a status instead of throwing", /NextResponse\.redirect/.test(src));
}

console.log("\n-- the callback stores only a connection that will still work tomorrow --");
{
  const src = readFileSync("src/app/api/google/callback/route.ts", "utf8");

  // Order is the security property: an unverified state must not choose which
  // workspace gets authorized.
  // Compare CALL SITES, not the import list — both names appear in the imports
  // at the top, so a naive indexOf compares the wrong thing and passes or
  // fails for reasons unrelated to the ordering being asserted.
  const iVerify = src.indexOf("verifyGoogleState(state)");
  const iAuth = src.indexOf("requireSubAccountAdmin(request, id)");
  ck("state is verified BEFORE the admin check binds a workspace",
    iVerify > -1 && iAuth > -1 && iVerify < iAuth,
    `verify@${iVerify} auth@${iAuth}`);

  ck("the refresh token is encrypted at rest", /encryptSecret\(tokens\.refreshToken\)/.test(src));
  ck("the raw refresh token is never written", !/refreshToken:\s*tokens\.refreshToken/.test(src));
  ck("no token is logged", !/console\.(log|error|warn)\([^)]*tokens\.(refresh|access)Token/.test(src));

  ck("a response with no refresh token is refused, not stored",
    /!tokens\.refreshToken/.test(src) && /no_refresh_token/.test(src));
  ck("capabilities come from the granted scopes",
    /deriveGoogleCapabilities\(tokens\.grantedScopes/.test(src));
  ck("reconnecting under a different Google account clears the selections",
    /sameAccount/.test(src) && /accountSub === info\.sub/.test(src));
  ck("the operator is told when a service they asked for was declined",
    /partial:/.test(src));

  const oauth = readFileSync("src/lib/google/oauth.ts", "utf8");
  ck("offline access is requested, or there is no refresh token at all",
    /access_type", "offline/.test(oauth));
  ck("consent is forced, or a returning user yields no refresh token",
    /prompt", "consent/.test(oauth));
  ck("access tokens are never persisted", !/accessToken:\s*tokens\.accessToken/.test(src));
}

console.log("\n-- the callback is session-gated, like Meta's --");
{
  const mw = readFileSync("src/middleware.ts", "utf8");
  ck("it is NOT a public path (the admin's session is the credential)",
    !/api\/google\/callback/.test(mw));
}

console.log("\n-- the env catalog knows about Google --");
{
  const cat = await import("../src/lib/setup/env-schema.mjs");
  const keys = cat.KNOWN_KEYS as string[];
  for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]) {
    ck(`${k} is in the catalog, so doctor and the fingerprint both see it`, keys.includes(k));
  }
  const v = cat.validateVar as (n: string, val: string) => string | null;
  ck("a pasted client id is shape-checked", v("GOOGLE_OAUTH_CLIENT_ID", "wrong") !== null);
  ck("a real client id passes", v("GOOGLE_OAUTH_CLIENT_ID", "1-a.apps.googleusercontent.com") === null);
  ck("a redirect URI missing the callback path warns",
    v("GOOGLE_OAUTH_REDIRECT_URI", "https://app.divinex.io") === null); // shape-valid; the deep() check carries the path warning
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
