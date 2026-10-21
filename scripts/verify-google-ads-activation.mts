/**
 * Google Ads activation — removing the developer-token gate without inventing
 * an API we have never called.
 *
 * Google sunset developer tokens on 9 September 2026. Access moved onto the
 * Google Cloud project that owns the OAuth credentials, and per Google's own
 * policy page a token in the header is now "optional and ignored by the API
 * servers". The code still refused to request the `adwords` scope without one,
 * so Ads could never be granted on any deployment, however configured.
 *
 * What this file checks is the shape of that removal, and the four things it
 * would be easy to get wrong:
 *
 *  - A gate that cannot fail. Replacing the token test with `() => true`, or
 *    with an alias of googleConfigured(), leaves something that reads as a
 *    safety check and is not one. The gate is gone, and that has to stay gone.
 *  - Authorization inferred from the request rather than the grant. Google's
 *    consent screen has a checkbox per scope, so a client can hand over
 *    Analytics and decline Ads in the same click. Believing what we ASKED for
 *    produces a card that says Ads over a dashboard that 403s.
 *  - Four separate facts collapsed into one boolean. "Can this deployment ask",
 *    "did this client grant", "is an account resolved" and "has Google ever
 *    answered" become true at different times, and a single flag cannot say
 *    which one is missing.
 *  - A customer id that came from a human. An id someone typed proves access
 *    to nothing, and an id belonging to another advertiser proves less than
 *    nothing.
 *
 * Every positive check is paired with a MUTATION: the same assertion against
 * deliberately broken input, which must fail. An assertion that passes either
 * way is testing nothing.
 *
 * DELIBERATELY ABSENT: response parsing, micros conversion against real rows,
 * customer metadata, campaign metrics, quota and error handling. Those need
 * the real API contract, and fixtures invented before the first call are the
 * `websiteFacts.services` mistake — a fixture asserting the shape the code
 * expected, where both were wrong in the same direction and the tests proved
 * nothing. They land once Google has answered.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-google-ads-activation.mts
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

const read = (f: string) => readFileSync(f, "utf8");
/** Comments EXPLAIN the sunset at length; matching that prose would pass for
 *  the wrong reason. Strip before asserting on code. */
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const GA4 = "https://www.googleapis.com/auth/analytics.readonly";
const GSC = "https://www.googleapis.com/auth/webmasters.readonly";
const ADS = "https://www.googleapis.com/auth/adwords";

const OAUTH = "src/lib/google/oauth.ts";
const CAPS = "src/lib/google/capabilities.ts";
const CONNECT = "src/app/api/sub-accounts/[id]/google/connect/route.ts";
const CALLBACK = "src/app/api/google/callback/route.ts";
const PROPS = "src/app/api/sub-accounts/[id]/google/properties/route.ts";
const CARD = "src/components/settings/sub-account-google-section.tsx";

process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret-for-state-signing";

// ───────────────────────────────────────────────────────────────────────────────
console.log("-- the developer token no longer gates anything --");
{
  // Behavioural: with no token in the environment at all, Ads is still asked for.
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const { googleScopeList } = await import("../src/lib/google/oauth.ts");

  ck(
    "with no developer token set, the adwords scope is still requested",
    googleScopeList(["ga4", "searchConsole", "ads"]).includes(ADS),
  );

  // MUTATION — the pre-sunset behaviour. If a gate is ever reintroduced, the
  // scope list stops containing Ads and this must start failing.
  const gated = (hasToken: boolean) =>
    googleScopeList(hasToken ? ["ga4", "searchConsole", "ads"] : ["ga4", "searchConsole"]);
  ck(
    "MUTATION: dropping Ads from the request does remove the scope, so the check above is real",
    !gated(false).includes(ADS),
  );

  const oauth = code(OAUTH);
  ck(
    "no function reads GOOGLE_ADS_DEVELOPER_TOKEN",
    !/GOOGLE_ADS_DEVELOPER_TOKEN/.test(oauth) &&
      !/GOOGLE_ADS_DEVELOPER_TOKEN/.test(code(CONNECT)) &&
      !/GOOGLE_ADS_DEVELOPER_TOKEN/.test(code(CALLBACK)) &&
      !/GOOGLE_ADS_DEVELOPER_TOKEN/.test(code(CAPS)),
  );

  // The gate is REMOVED, not neutered. An alias of googleConfigured() or a
  // `return true` would both satisfy "Ads is requestable" while reintroducing
  // a check that cannot fail — the exact dead guard this repo deleted from the
  // Ads action-level safeguards for the same reason.
  ck(
    "googleAdsConfigured is gone rather than stubbed true",
    !/export function googleAdsConfigured/.test(oauth) &&
      !/googleAdsConfigured/.test(code(CONNECT)) &&
      !/googleAdsConfigured/.test(code(CALLBACK)),
  );

  // Backward compatibility, exercised rather than grepped: an existing
  // deployment that still has the value set must not be told it is broken,
  // and must not be told the variable is needed.
  const { GROUPS } = await import("../src/lib/setup/env-schema.mjs");
  const group = (GROUPS as { title: string; vars: [string, string, unknown?][]; deep?: Function }[]).find(
    (g) => /Google Analytics/.test(g.title),
  )!;
  ck("the env catalog still declares the variable, so a legacy value is not flagged unknown",
    group.vars.some(([k]) => k === "GOOGLE_ADS_DEVELOPER_TOKEN"));
  ck("and declares it optional, so its absence is never an error",
    group.vars.find(([k]) => k === "GOOGLE_ADS_DEVELOPER_TOKEN")?.[1] === "opt");

  const runDeep = (present: string[]) => {
    const found: { level: string; msg: string }[] = [];
    const env = {
      has: (k: string) => present.includes(k),
      val: (k: string) => (present.includes(k) ? "x" : undefined),
    };
    group.deep?.((level: string, msg: string) => found.push({ level, msg }), env);
    return found;
  };

  const stillSet = runDeep(["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_LOGIN_CUSTOMER_ID"]);
  ck("a deployment that still has the token set is told it is ignored, not that it is required",
    stillSet.some((w) => /no longer used|sunset/.test(w.msg)) &&
      !stillSet.some((w) => /refused/.test(w.msg)) &&
      stillSet.every((w) => w.level === "warn"));

  // MUTATION — the old warning. A manager id with no token used to be reported
  // as "Ads calls will be refused", which would now send someone hunting for a
  // credential Google no longer issues.
  const managerOnly = runDeep(["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]);
  ck("MUTATION: a manager id without a token is no longer reported as broken",
    managerOnly.length === 0);

  // Section 3 of the brief, and a real trap: legacy code often keeps sending a
  // header "just in case". An ignored header is dead weight that implies a
  // credential requirement that no longer exists.
  const allGoogle = ["src/lib/google/api.ts", OAUTH, CAPS, CONNECT, CALLBACK, PROPS]
    .map((f) => code(f))
    .join("\n");
  ck(
    "no developer-token HTTP header is sent anywhere",
    !/["']developer-token["']/i.test(allGoogle) && !/developer_token/i.test(allGoogle),
  );
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- authorization comes from the grant, never from the request --");
{
  const { deriveGoogleCapabilities } = await import("../src/lib/google/capabilities.ts");

  ck(
    "asking for Ads and being refused leaves Ads off",
    deriveGoogleCapabilities([GA4, GSC]).ads === false,
  );
  ck(
    "a granted Ads scope is a capability, with no second credential to find",
    deriveGoogleCapabilities([GA4, ADS]).ads === true,
  );
  ck(
    "the other services are unaffected by the Ads change",
    deriveGoogleCapabilities([GA4, GSC]).ga4 === true &&
      deriveGoogleCapabilities([GA4, GSC]).searchConsole === true &&
      deriveGoogleCapabilities([ADS]).ga4 === false,
  );

  // MUTATION — a lookalike scope. Substring matching would grant Ads for a
  // scope Google never issued, which is how a capability becomes true for a
  // grant that cannot authorize anything.
  ck(
    "MUTATION: a scope that merely CONTAINS adwords does not grant Ads",
    deriveGoogleCapabilities([`${ADS}.readonly`]).ads === false &&
      deriveGoogleCapabilities(["https://evil.example/auth/adwords"]).ads === false,
  );

  ck("nothing granted means nothing enabled",
    Object.values(deriveGoogleCapabilities([])).every((v) => v === false));

  // The callback must derive from Google's returned scope list, not from the
  // services the connect route asked for — which travel in the signed state
  // and are RIGHT THERE, which is what makes this an easy mistake.
  const cb = code(CALLBACK);
  ck(
    "the callback derives capabilities from the returned grant",
    /deriveGoogleCapabilities\(tokens\.grantedScopes\)/.test(cb) &&
      !/deriveGoogleCapabilities\(verified\.services/.test(cb),
  );
  ck(
    "and stores Google's granted scope list verbatim for audit",
    /grantedScopes: tokens\.grantedScopes/.test(cb),
  );
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- four facts, four states, not one boolean --");
{
  const { googleAdsReadiness, GOOGLE_ADS_READINESS } = await import(
    "../src/lib/google/capabilities.ts"
  );
  const caps = (ads: boolean) => ({ ga4: true, searchConsole: true, ads });

  ck("no connection reads as not_connected",
    googleAdsReadiness(null) === "not_connected" &&
      googleAdsReadiness({ connected: false, capabilities: caps(true) }) === "not_connected");

  ck("connected but Ads declined reads as scope_not_granted",
    googleAdsReadiness({ connected: true, capabilities: caps(false) }) === "scope_not_granted");

  ck("granted but no resolved account reads as customer_unresolved",
    googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: null }) ===
      "customer_unresolved");

  ck("granted with a resolved account reads as ready",
    googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: "1234567890" }) ===
      "ready");

  // MUTATION — the collapse this exists to prevent. If any two of these mapped
  // to the same answer, the card could not say WHICH step is missing, which is
  // precisely the "connected, and the dashboard is empty" failure.
  const states = [
    googleAdsReadiness(null),
    googleAdsReadiness({ connected: true, capabilities: caps(false) }),
    googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: null }),
    googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: "1" }),
  ];
  ck("MUTATION: the four inputs produce four DISTINCT states", new Set(states).size === 4,
    states.join(","));

  ck("every declared state is reachable and none is spare",
    new Set(GOOGLE_ADS_READINESS).size === GOOGLE_ADS_READINESS.length &&
      GOOGLE_ADS_READINESS.length === 4 &&
      states.every((s) => (GOOGLE_ADS_READINESS as readonly string[]).includes(s)));

  // MUTATION — a blank id. An empty or whitespace value is not an account, and
  // reading it as one would report `ready` over a workspace with nothing bound.
  ck("MUTATION: a blank or whitespace customer id is not a resolved account",
    googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: "" }) ===
      "customer_unresolved" &&
      googleAdsReadiness({ connected: true, capabilities: caps(true), adsCustomerId: "   " }) ===
        "customer_unresolved");

  // MUTATION — a stale id outliving the grant. Reconnecting under an account
  // that declines Ads must not stay `ready` on the strength of a leftover id.
  ck("MUTATION: a leftover customer id does not survive the scope being withdrawn",
    googleAdsReadiness({ connected: true, capabilities: caps(false), adsCustomerId: "1234567890" }) ===
      "scope_not_granted");

  // Fact 1 is a DEPLOYMENT property and deliberately not a state here: a
  // stored connection could not exist without it. The connect route is where
  // it is enforced, so that is where it is asserted.
  ck("fact 1 is enforced at the connect route, before anyone reaches Google",
    /if \(!googleConfigured\(\)\) return stop\("not_configured"\)/.test(code(CONNECT)));

  // Fact 4 has no durable record yet, and must not be implied by `ready`.
  ck("nothing claims the Ads API has been called, because nothing has called it",
    !/googleads\.googleapis\.com/.test(
      ["src/lib/google/api.ts", OAUTH, CAPS, CONNECT, CALLBACK].map(code).join("\n"),
    ));
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- the customer id is Google's answer, not a human's input --");
{
  // The invariant googleAdsReadiness() rests on. If any request body could set
  // adsCustomerId, `ready` would mean "someone typed ten digits" and a pasted
  // id could point a workspace at another advertiser's account.
  const props = code(PROPS);
  ck("the selection route accepts only the GA4 property and the Search Console site",
    /ga4PropertyId/.test(props) && /gscSiteUrl/.test(props) && !/adsCustomerId/.test(props));

  // MUTATION — proof the check can fail. The same assertion over a body that
  // DOES name adsCustomerId must reject it.
  const forged = props.replace(/gscSiteUrl/g, "adsCustomerId");
  ck("MUTATION: a route that did accept adsCustomerId would be caught",
    /adsCustomerId/.test(forged));

  const cb = code(CALLBACK);
  ck("the callback only ever CARRIES FORWARD an existing id, never invents one",
    /adsCustomerId: sameAccount \? \(existing\?\.adsCustomerId \?\? null\) : null/.test(cb));
  ck("and clears it when the Google account changed, so an id cannot outlive its owner",
    /const sameAccount =/.test(cb) && /existing\.accountSub === info\.sub/.test(cb));

  ck("no code anywhere writes adsCustomerId from a request",
    !/adsCustomerId.*body|body.*adsCustomerId/.test(
      [PROPS, CONNECT, CALLBACK, "src/app/api/sub-accounts/[id]/google/route.ts"]
        .map(code)
        .join("\n"),
    ));
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- login-customer-id: the manager, and only where Google wants it --");
{
  const { googleAdsManagerCustomerId } = await import("../src/lib/google/oauth.ts");
  const withEnv = (v: string | undefined) => {
    if (v === undefined) delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    else process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = v;
    return googleAdsManagerCustomerId();
  };

  ck("ten bare digits are accepted", withEnv("1234567890") === "1234567890");
  // The console DISPLAYS the id dashed, so this is the paste people actually
  // make. The API accepts only bare digits.
  ck("the dashed display form is normalised, not rejected at runtime",
    withEnv("123-456-7890") === "1234567890");
  ck("unset reads as null, which is a normal state for a directly-shared account",
    withEnv(undefined) === null);

  // MUTATION — a wrong-length or non-numeric value must NOT be padded, trimmed
  // or guessed into something that looks valid. A near-miss id reaches the API
  // and fails with an error nobody can read.
  ck("MUTATION: a 9-digit id is not padded into a plausible one",
    withEnv("123456789") === null);
  ck("MUTATION: an 11-digit id is not truncated", withEnv("12345678901") === null);
  ck("MUTATION: stripping letters does not manufacture a valid id",
    withEnv("91848143a0") === null);
  ck("MUTATION: an Ads URL ocid pasted by mistake is refused",
    withEnv("ocid=1234567890") === null);
  delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  // Section 9 of the brief. The manager id identifies a hierarchy; it is not a
  // consent precondition, and requiring it would refuse Ads to every workspace
  // whose account is shared directly rather than through the manager.
  ck("the manager id is NOT a precondition for requesting consent",
    !/GOOGLE_ADS_LOGIN_CUSTOMER_ID/.test(code(CONNECT)) &&
      !/googleAdsManagerCustomerId/.test(code(CONNECT)));

  // Per Google's listing-accounts guide, customers:listAccessibleCustomers
  // "ignores any supplied login-customer-id" — the result comes from the OAuth
  // credentials alone. There is no call yet; when there is, it must not send it.
  const anyAdsCall = ["src/lib/google/api.ts", OAUTH, CAPS].map(code).join("\n");
  ck("there is no Ads call yet, so none can be sending the header wrongly",
    !/listAccessibleCustomers/.test(anyAdsCall) && !/login-customer-id/i.test(code("src/lib/google/api.ts")));

  // The id belongs in the environment. A real customer id committed to the
  // repo is both a leak and a hardcoded tenant.
  for (const f of [OAUTH, CAPS, CONNECT, CALLBACK, CARD]) {
    ck(`${f.split("/").pop()}: no customer id hardcoded`,
      !/\b\d{3}\s*-\s*\d{3}\s*-\s*\d{4}\b/.test(read(f)) && !/\b918481435\d\b/.test(read(f)));
  }
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- the consent screen, and what the client is actually agreeing to --");
{
  const card = read(CARD);

  // Ads was absent from the card entirely. The gate removal is worthless
  // without somewhere to tick it, and this is the step that was missing.
  ck("Ads can be requested from the UI", /wantAds/.test(card) && /"ads"/.test(card));

  // MUTATION — pre-ticked. `adwords` is read/write with no read-only variant,
  // so a default-on checkbox hands over write access to a client's ad spend
  // without them choosing it.
  ck("MUTATION: Ads is opt-in, not pre-ticked",
    /const \[wantAds, setWantAds\] = useState\(false\)/.test(card));
  ck("while the read-only services stay ticked, so nothing regressed for them",
    /const \[wantGa4, setWantGa4\] = useState\(true\)/.test(card) &&
      /const \[wantGsc, setWantGsc\] = useState\(true\)/.test(card));

  // Whitespace-normalised: JSX reflows prose across lines, and an assertion
  // that breaks on a line wrap tests the formatter, not the copy.
  const cardText = card.replace(/\s+/g, " ");
  ck("the label states the grant is read/write before anyone clicks",
    /no read-only Ads permission/.test(cardText) && /read and write access/.test(cardText));

  // The card used to promise "Read-only." outright. With Ads offered that
  // sentence became false — Google grants write capability whatever we do with
  // it — so it has to describe our USE, not the permission.
  ck("the card no longer claims the permission itself is read-only",
    !/performance into Growth Intelligence\. Read-only\./.test(cardText) &&
      /only ever run reporting queries/.test(cardText));

  // A granted scope is not a working report. Saying "Ads" over an empty
  // dashboard with no explanation is the exact failure readiness exists for.
  ck("a granted scope with no linked account is explained, not left blank",
    /googleAdsReadiness\(config\) === "customer_unresolved"/.test(card) &&
      /No Ads account is linked/.test(cardText));

  // Scope selection is per connect, so a client who declined Ads can come back
  // and grant it without losing Analytics.
  ck("only ticked services are requested", /wantAds \? "ads" : null/.test(card));

  // The gate removal plus a tickbox is STILL not enough. The tickboxes only
  // rendered while disconnected, and Reconnect calls the same handler — so an
  // already-connected workspace sent the component defaults, which can never
  // include Ads. Every workspace that matters here is already connected.
  const choicesUses = (card.match(/\{serviceChoices\}/g) ?? []).length;
  ck("an already-connected workspace can add Ads without disconnecting first",
    choicesUses === 2 && /Add or change services/.test(card));

  // MUTATION — one shared control, not two copies. Two would drift, and the
  // one that stopped offering Ads would be the one that mattered.
  ck("MUTATION: both states render the SAME control, not a duplicated copy",
    (card.match(/onCheckedChange=\{\(v\) => setWantAds/g) ?? []).length === 1);

  // Reconnect runs full consent again, so sending the defaults would silently
  // DROP a service the client had already granted.
  ck("reconnect preserves what is already granted rather than resetting it",
    /setWantAds\(googleCan\(config, "ads"\)\)/.test(card) &&
      /setWantGa4\(googleCan\(config, "ga4"\)\)/.test(card) &&
      /setWantGsc\(googleCan\(config, "searchConsole"\)\)/.test(card));

  // MUTATION — seeding once. The card is live on a Firestore snapshot, so
  // re-seeding on every update would overwrite the operator mid-click.
  ck("MUTATION: the seed runs once, so a snapshot cannot undo a tick",
    /seeded\.current/.test(card) && /if \(seeded\.current \|\| !config\?\.connected\) return/.test(card));
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- the read-only promise the privacy policy makes out loud --");
{
  const privacy = read("src/app/(legal)/privacy/page.tsx");
  ck("the policy already names the adwords scope and why it cannot be narrowed",
    /adwords/.test(privacy) && /read-only version of the Google Ads scope/.test(privacy));
  // The promise has to be true of the code, not merely intended. There are no
  // Ads mutations because there is no Ads client; this check is what fails the
  // day one appears without its own certification.
  const lib = ["src/lib/google/api.ts", OAUTH, CAPS].map(code).join("\n");
  ck("and no Google call site issues anything but a read",
    !/:mutate|campaignBudgets|campaignCriteria|:createCustomer/.test(lib));
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- the Ads transport: read-only by construction --");
{
  const ADS_LIB = "src/lib/google/ads.ts";
  const ADS_ROUTE = "src/app/api/sub-accounts/[id]/google/ads-accounts/route.ts";
  const lib = code(ADS_LIB);
  const route = code(ADS_ROUTE);

  // Section 16: the application boundary enforces read-only, NOT the OAuth
  // scope, which permits writes and cannot be narrowed.
  ck("no mutate surface exists at all",
    !/:mutate|mutateCampaign|campaignBudgets|campaignCriteria|:createCustomer|method:\s*["']PUT|method:\s*["']DELETE|method:\s*["']PATCH/.test(lib) &&
      !/:mutate|mutate/.test(route));

  // MUTATION — proof the check can fail, since "no match" passes trivially.
  ck("MUTATION: a mutate path would be caught",
    /:mutate/.test(lib.replace("googleAds:search", "googleAds:mutate")));

  // Narrow to actual HEADER construction. The route carries an honest
  // `developerTokenSent: false` field, and a check that fired on the word
  // would flag the very thing that documents the absence.
  ck("no developer-token header is constructed",
    !/\["developer-token"\]|["']developer-token["']\s*:|developer_token|GOOGLE_ADS_DEVELOPER_TOKEN/.test(lib + route));

  // MUTATION — proof it still catches a real one.
  ck("MUTATION: a reintroduced developer-token header would be caught",
    /\["developer-token"\]/.test(lib.replace('headers["login-customer-id"]', 'headers["developer-token"]')));
  ck("and the route states outright that none is sent",
    /developerTokenSent: false/.test(route));

  // Per Google's listing-accounts guide the endpoint ignores the header, so
  // sending it would be cargo cult. Checked at the call site, not the helper.
  const listFn = lib.slice(lib.indexOf("export function listAccessibleCustomers"));
  ck("listAccessibleCustomers sends no login-customer-id",
    /return adsCall\("customers:listAccessibleCustomers", accessToken\);/.test(listFn));

  // GAQL injection surface: there must not be one.
  ck("every query is a reviewed server-side constant",
    /export const CUSTOMER_METADATA_QUERY/.test(lib) &&
      /export const CUSTOMER_CLIENT_QUERY/.test(lib) &&
      !/body\.query|searchParams\.get\("query"|body\.customerId|searchParams\.get\("customer/.test(route));

  // Tenancy: the target comes from the stored connection, never the caller.
  ck("the route accepts no customer id from the request",
    !/await request\.json\(\)/.test(route) && !/req\.body/.test(route));
  ck("the route is admin-gated and reads the workspace's own connection",
    /requireSubAccountAdmin\(request, id\)/.test(route) &&
      /doc\(`subAccounts\/\$\{id\}`\)/.test(route));
  ck("and refuses on the GRANTED scope, not on what was requested",
    /googleCan\(config, "ads"\)/.test(route));

  // Currency and timezone are read from the account, never assumed. The query
  // is what makes that possible, so its absence is the regression to catch.
  ck("the metadata query reads currency and timezone from the account",
    /customer\.currency_code/.test(lib) && /customer\.time_zone/.test(lib));
  ck("and asks whether the account is a manager or a test account",
    /customer\.manager/.test(lib) && /customer\.test_account/.test(lib));

  ck("the API version is pinned in exactly one place",
    (lib.match(/GOOGLE_ADS_API_VERSION = /g) ?? []).length === 1 &&
      !/\/v2[0-9]\//.test(route));

  const { customerIdFromResourceName, GOOGLE_ADS_API_VERSION } = await import("../src/lib/google/ads.ts");
  ck("a resource name yields its customer id",
    customerIdFromResourceName("customers/1234567890") === "1234567890");
  ck("the pinned version is a real version string", /^v\d+$/.test(GOOGLE_ADS_API_VERSION));

  // MUTATION — half-parsing an unexpected shape. A loose regex would turn a
  // format we have never seen into a plausible id and query the wrong account.
  ck("MUTATION: an unexpected resource-name format yields null, not a guess",
    customerIdFromResourceName("customers/123/campaigns/456") === null &&
      customerIdFromResourceName("customer/1234567890") === null &&
      customerIdFromResourceName("1234567890") === null &&
      customerIdFromResourceName("customers/abc") === null &&
      customerIdFromResourceName(null) === null &&
      customerIdFromResourceName(undefined) === null);
}

// ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- readers, against responses Google actually sent --");
{
  // FIXTURES BELOW ARE REAL, captured from DivineX's first Google Ads API
  // calls on 2026-10-21 against v26, with the account numbers replaced. The
  // request ids and the error envelopes are verbatim.
  //
  // This ordering is the point. The first run sent `pageSize`, which v26
  // refuses outright, and a fixture written alongside that request would have
  // agreed with it: the tests would have passed while every query failed. The
  // same self-confirmation shipped a website-facts reader for a key that never
  // existed. So nothing here was written before the response it asserts on.
  const { readAccessibleCustomerIds, readAdsError, isAccountUnreachable } = await import(
    "../src/lib/google/ads.ts"
  );

  const call = (over: Record<string, unknown>) => ({
    ok: false, httpStatus: 403, requestId: "req-abc", apiVersion: "v26", body: {}, ...over,
  }) as Parameters<typeof readAdsError>[0];

  // ---- the success shape, verbatim from request-id alMukjdHJArcZwXhvWMcxg ----
  const LIST_OK = {
    resourceNames: ["customers/1111111111", "customers/2222222222", "customers/3333333333"],
  };
  const parsed = readAccessibleCustomerIds(LIST_OK);
  ck("the real accessible-customer list parses to its ids",
    parsed.ids.join(",") === "1111111111,2222222222,3333333333" && parsed.unparsed.length === 0);

  // MUTATION — an entry in a format never seen must be REPORTED, not dropped.
  // Silently skipping reads as "that account does not exist", which is the
  // wrong answer for an operator looking straight at it in the Ads UI.
  const odd = readAccessibleCustomerIds({
    resourceNames: ["customers/1111111111", "customers/123/campaigns/9", "", null],
  });
  ck("MUTATION: unrecognised entries are surfaced rather than skipped",
    odd.ids.join(",") === "1111111111" && odd.unparsed.length === 3);

  ck("a missing resourceNames field is not a crash and not a silent empty",
    readAccessibleCustomerIds({}).ids.length === 0 &&
      readAccessibleCustomerIds(null).ids.length === 0 &&
      readAccessibleCustomerIds({ resourceNames: "customers/1" }).unparsed.length === 1);

  // ---- the 403 envelope, verbatim ----
  const PERMISSION_DENIED = call({
    httpStatus: 403,
    requestId: "yVxlsf8nJn1qyhNj2u983w",
    body: {
      error: {
        code: 403,
        message: "The caller does not have permission",
        status: "PERMISSION_DENIED",
        details: [{
          "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure",
          errors: [{
            errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
            message: "The customer account can't be accessed because it is not yet enabled or has been deactivated.",
          }],
          requestId: "yVxlsf8nJn1qyhNj2u983w",
        }],
      },
    },
  });
  const denied = readAdsError(PERMISSION_DENIED)!;
  ck("a real 403 yields Google's specific code, not just the HTTP status",
    denied.status === "PERMISSION_DENIED" &&
      denied.httpStatus === 403 &&
      denied.details[0].category === "authorizationError" &&
      denied.details[0].code === "CUSTOMER_NOT_ENABLED" &&
      denied.requestId === "yVxlsf8nJn1qyhNj2u983w");

  // ---- the 400 envelope, verbatim: my own bug as Google reported it ----
  const PAGE_SIZE = call({
    httpStatus: 400,
    requestId: "N3yEf5NjNYNOnz0VKalnCw",
    body: {
      error: {
        code: 400,
        message: "Request contains an invalid argument.",
        status: "INVALID_ARGUMENT",
        details: [{
          "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure",
          errors: [{
            errorCode: { requestError: "PAGE_SIZE_NOT_SUPPORTED" },
            message: "Setting the page size is not supported. Search Responses will have fixed page size of '10000' rows.",
          }],
          requestId: "N3yEf5NjNYNOnz0VKalnCw",
        }],
      },
    },
  });
  const argErr = readAdsError(PAGE_SIZE)!;
  ck("a real 400 is read as a request error, not an authorization one",
    argErr.status === "INVALID_ARGUMENT" &&
      argErr.details[0].category === "requestError" &&
      argErr.details[0].code === "PAGE_SIZE_NOT_SUPPORTED");

  // The distinction the HTTP status throws away. Both of these are 4xx, and
  // one means stop while the other means fix the request.
  ck("a deactivated account is unreachable", isAccountUnreachable(PERMISSION_DENIED) === true);
  ck("MUTATION: a bad argument of OURS is NOT reported as an unreachable account",
    isAccountUnreachable(PAGE_SIZE) === false);

  const USER_DENIED = call({
    body: {
      error: {
        status: "PERMISSION_DENIED",
        details: [{
          errors: [{
            errorCode: { authorizationError: "USER_PERMISSION_DENIED" },
            message: "User doesn't have permission to access customer.",
          }],
        }],
      },
    },
  });
  ck("the wrong login context is also unreachable, with its own code",
    isAccountUnreachable(USER_DENIED) &&
      readAdsError(USER_DENIED)!.details[0].code === "USER_PERMISSION_DENIED");

  ck("a successful call has no error to read",
    readAdsError({ ok: true, httpStatus: 200, requestId: "x", apiVersion: "v26", body: LIST_OK }) === null);

  // MUTATION — a failure with an unreadable envelope must still report that it
  // failed. Returning no detail would make a broken call look reasonless.
  const WEIRD = call({ body: { error: { status: "UNKNOWN", details: [{ errors: [{ message: "no code here" }] }] } } });
  ck("MUTATION: a failure with no error code still reports a reason",
    readAdsError(WEIRD)!.details[0].code === "unknown" &&
      readAdsError(WEIRD)!.details[0].message === "no code here");
  ck("and an entirely unparseable failure is still a failure",
    readAdsError(call({ body: { nonJsonBody: "<html>502</html>" } }))!.httpStatus === 403);

  // ---- the bug itself, as a standing regression ----
  const lib = read("src/lib/google/ads.ts");
  ck("pageSize is never sent again, and the real error says why",
    !/pageSize:/.test(lib) && /PAGE_SIZE_NOT_SUPPORTED/.test(lib));
  ck("MUTATION: reintroducing pageSize in a request body would be caught",
    /pageSize:/.test(lib.replace("body: { query }", "body: { query, pageSize: 100 }")));
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
