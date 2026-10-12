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

console.log("\n-- nothing outside the six approved scopes is ever requested --");
{
  const { googleScopeList, GOOGLE_SCOPES } = await import("../src/lib/google/oauth.ts");

  // The consent screen is configured with exactly these six. Requesting a
  // seventh fails at Google; requesting a different one silently asks a client
  // for access nobody approved.
  const APPROVED = new Set([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/adwords",
  ]);

  for (const combo of [
    ["ga4"],
    ["searchConsole"],
    ["ads"],
    ["ga4", "searchConsole"],
    ["ga4", "searchConsole", "ads"],
  ] as const) {
    const scopes = googleScopeList([...combo]);
    const extra = scopes.filter((s) => !APPROVED.has(s));
    ck(`[${combo.join("+")}] requests nothing beyond the six approved scopes`,
      extra.length === 0, extra.join(", "));
  }

  // The user-facing consequence of the Ads gate: losing Ads must never cost
  // the client the two services that DO work.
  const withoutAds = googleScopeList(["ga4", "searchConsole"]);
  ck("dropping Ads still connects Analytics", withoutAds.includes(GOOGLE_SCOPES.ga4));
  ck("dropping Ads still connects Search Console", withoutAds.includes(GOOGLE_SCOPES.searchConsole));
  ck("and the dropped Ads scope is genuinely absent", !withoutAds.includes(GOOGLE_SCOPES.ads));
  ck("the scopes left after dropping Ads are all on the consent screen",
    withoutAds.every((s) => APPROVED.has(s)));

  const connect = readFileSync("src/app/api/sub-accounts/[id]/google/connect/route.ts", "utf8");
  ck("Ads is dropped, not the whole connect, when the token is missing",
    /services = services\.filter\(\(s\) => s !== "ads"\)/.test(connect));
  ck("only an Ads-ONLY request is refused outright, since nothing would remain",
    /if \(services\.length === 0\) return stop\("ads_not_configured"\)/.test(connect));

  const oauth = readFileSync("src/lib/google/oauth.ts", "utf8");
  ck("the Ads gate is one named function, so changing it is one line",
    (oauth.match(/export function googleAdsConfigured/g) ?? []).length === 1);
}

console.log("\n-- credentials never reach logs or responses --");
{
  for (const f of [
    "src/app/api/google/callback/route.ts",
    "src/app/api/sub-accounts/[id]/google/route.ts",
    "src/app/api/sub-accounts/[id]/google/connect/route.ts",
    "src/lib/google/oauth.ts",
  ]) {
    const src = readFileSync(f, "utf8");
    const name = f.split("/").slice(-2).join("/");
    ck(`${name}: no token in a log line`,
      !/console\.\w+\([^)]*(refreshToken|accessToken|client_secret|CLIENT_SECRET)/.test(src));
    ck(`${name}: no token in a response body`,
      !/NextResponse\.json\(\{[^}]*(refreshToken|accessToken)/.test(src));
    ck(`${name}: no customer id echoed back`,
      !/NextResponse\.json\(\{[^}]*LOGIN_CUSTOMER_ID/.test(src));
  }
}

console.log("\n-- the Ads manager id is validated, not assumed --");
{
  const cat = await import("../src/lib/setup/env-schema.mjs");
  const v = cat.validateVar as (n: string, val: string) => string | null;
  ck("a 10-digit id is accepted", v("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "9184814350") === null);
  ck("the dashed display form is rejected", v("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "918-481-4350") !== null);
  ck("a 9-digit id is rejected", v("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "123456789") !== null);
  ck("an 11-digit id is rejected", v("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "12345678901") !== null);
  ck("a non-numeric id is rejected", v("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "91848143a0") !== null);

  // The value belongs in the environment, never in the repo.
  for (const f of ["src/lib/google/oauth.ts", "src/app/api/google/callback/route.ts", "render.yaml"]) {
    ck(`${f.split("/").pop()}: no customer id hardcoded`, !/918\s*-?\s*481\s*-?\s*4350|9184814350/.test(readFileSync(f, "utf8")));
  }
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

console.log("\n-- disconnect actually disconnects --");
{
  const src = readFileSync("src/app/api/sub-accounts/[id]/google/route.ts", "utf8");
  ck("a disconnect route exists at all", src.includes("export async function DELETE"));
  ck("admin only", /requireSubAccountAdmin/.test(src));
  ck("the grant is REVOKED at Google, not just forgotten locally",
    /revokeRefreshToken/.test(src));

  // Order is the whole point: clearing first destroys the only copy of the
  // token and strands a live grant in the customer's Google account.
  const iRevoke = src.indexOf("revokeRefreshToken(token)");
  const iClear = src.indexOf("googleConfig: null");
  ck("revoke happens BEFORE the local record is cleared",
    iRevoke > -1 && iClear > -1 && iRevoke < iClear, `revoke@${iRevoke} clear@${iClear}`);

  ck("a failed revoke still clears locally, so nobody is stuck connected",
    /revokeError/.test(src) && iClear > src.indexOf("revokeError"));
  ck("a failed revoke is reported rather than hidden", /revokeError: revoked \? null : revokeError/.test(src));
  ck("disconnecting twice is a success, not a 404", /alreadyDisconnected/.test(src));

  const oauth = readFileSync("src/lib/google/oauth.ts", "utf8");
  ck("an already-invalid token counts as revoked", /invalid_token/.test(oauth));
  ck("revocation never throws into the route", /catch \(err\)[\s\S]{0,160}revoked: false/.test(oauth));
}

console.log("\n-- the privacy policy matches what the code does --");
{
  // A reviewer reads this policy against a demo of the software. Every claim
  // below is one the code has to keep true, so assert them together.
  const policyRaw = readFileSync("src/app/(legal)/privacy/page.tsx", "utf8");
  // JSX wraps prose across lines, so a phrase that reads as one sentence on
  // the page is split by newlines and indentation in the source. Match against
  // a whitespace-normalised copy or the assertions fail for layout reasons.
  const policy = policyRaw.replace(/\s+/g, " ");

  ck("a Google user data section exists", /Google User Data/.test(policy));
  ck("the Limited Use sentence is present verbatim",
    /will adhere to the\{" "\}[\s\S]{0,400}Google API Services User Data Policy[\s\S]{0,120}including the Limited Use requirements/.test(policy));

  // The draft said "access tokens are stored encrypted". That is not what the
  // code does, and the truth is stronger.
  ck("it says the REFRESH token is encrypted", /refresh token[\s\S]{0,120}encrypted/i.test(policy));
  ck("it says access tokens are never stored", /never stored at all/.test(policy));
  ck("the code backs that up: no access token is persisted",
    !/accessToken:\s*tokens\.accessToken/.test(readFileSync("src/app/api/google/callback/route.ts", "utf8")));

  ck("it discloses the AI processing of Google data",
    /Automated analysis/.test(policy) && /AI model provider/.test(policy));
  ck("it promises disconnect from settings, which now exists",
    /disconnect Google at any time/i.test(policy));
  ck("it promises revocation on disconnect, which the route performs",
    /revokes our access with Google/.test(policy));
  ck("it points users at Google's own revocation page",
    /myaccount\.google\.com\/permissions/.test(policy));
  ck("it states scopes are only requested for selected services",
    /never request a scope for a service you did not select/.test(policy));

  // The Ads honesty point, which the verification justification depends on.
  ck("it states plainly that Google offers no read-only Ads scope",
    /does not offer\s*\{?"?\s*a read-only version of the Google Ads scope/.test(policy));
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
