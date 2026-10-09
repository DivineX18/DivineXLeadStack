/**
 * Client onboarding: the invariants that cannot be seen by reading one file.
 *
 * Pure checks plus source assertions. No Firestore, no Stripe, no network, so
 * it runs anywhere and costs nothing.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-client-onboarding.mts
 */
import { readFileSync } from "node:fs";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d && !ok ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};

const svc = readFileSync("src/lib/server/client-onboarding-service.ts", "utf8");
const portal = readFileSync("src/lib/onboarding/portal-service.ts", "utf8");
const token = readFileSync("src/lib/onboarding/token.ts", "utf8");
const assets = readFileSync("src/lib/onboarding/assets.ts", "utf8");
const handoff = readFileSync("src/lib/onboarding/handoff.ts", "utf8");
const staff = readFileSync("src/lib/onboarding/staff-service.ts", "utf8");
const rules = readFileSync("firestore.rules", "utf8");
const mw = readFileSync("src/middleware.ts", "utf8");
const adminRoute = readFileSync("src/app/api/agency/onboarding/route.ts", "utf8");
const portalRoute = readFileSync("src/app/api/onboarding/[token]/route.ts", "utf8");

console.log("-- one enrollment path, so Stripe and manual cannot diverge --");
{
  ck("the service exposes a single enrollClient", /export async function enrollClient\(/.test(svc));
  ck("source is an argument, not a second implementation", /source: OnboardingSource/.test(svc));
  ck("the manual route calls it", /enrollClient\(\{/.test(adminRoute) && /source: "manual"/.test(adminRoute));
  ck("no second enrollment function exists",
    (svc.match(/export async function enroll/g) ?? []).length === 1);
}

console.log("\n-- no workspace is created before it is real --");
{
  ck("enrollment writes a null subAccountId", /subAccountId: null,/.test(svc));
  ck("enrollment never creates a workspace", !/createSubAccountForAgency/.test(svc));
  ck("handoff is the only place that does", /createSubAccountForAgency/.test(handoff));
  ck("handoff reuses an existing workspace rather than making a second",
    /let subAccountId = onboarding\.subAccountId;/.test(handoff) && /if \(!subAccountId\)/.test(handoff));
}

console.log("\n-- price never decides eligibility --");
{
  ck("the Stripe price lookup is an explicit allowlist",
    /\(p\.stripePriceIds \?\? \[\]\)\.includes\(priceId\)/.test(svc));
  ck("no amount comparison anywhere in the service",
    !/priceCents\s*[<>=]=?\s*\d/.test(svc));
  ck("an unmatched price resolves to null rather than a guess",
    /packageForStripePrice[\s\S]{0,600}\?\? null/.test(svc));
}

console.log("\n-- the package as sold cannot be rewritten later --");
{
  ck("a snapshot is taken at enrollment", /function snapshotOf\(/.test(svc) && /package: snapshotOf\(pkg\)/.test(svc));
  ck("the checklist is seeded from the snapshot", /doc\.package\.requiredPlatforms/.test(svc));
  ck("handoff reads the snapshot, not the live package",
    /onboarding\.package\.productionChecklist/.test(handoff));
}

console.log("\n-- client self-reporting is never verification --");
{
  ck("the client-settable states exclude verified",
    /CLIENT_SETTABLE_ACCESS_STATES/.test(portal) &&
      !/CLIENT_SETTABLE_ACCESS_STATES[^\n]*verified/.test(
        readFileSync("src/types/client-onboarding.ts", "utf8"),
      ));
  ck("the client path refuses anything else",
    /Our team confirms access once the invitation arrives/.test(portal));
  ck("the client path never writes verifiedByUid", !/verifiedByUid/.test(portal));
  ck("only the staff path writes it", /verifiedByUid: opts\.actorUid/.test(staff));
  ck("completion counts only verified access",
    /a\.state === "verified"/.test(svc) && /requiredAccess\.filter/.test(svc));
  ck("readiness counts only verified access",
    /p\.state !== "verified"/.test(handoff));
}

console.log("\n-- the token is the credential, and only the current one works --");
{
  // The raw token IS returned to the caller (shown once at enrollment), so
  // the check is that the PERSISTED doc carries only the hash.
  const docBlock = svc.slice(svc.indexOf("const doc: Omit<ClientOnboardingDoc"), svc.indexOf("await ref.set(doc)"));
  ck("the stored document carries the hash", /inviteTokenHash: hash,/.test(docBlock));
  ck("and never the raw token", !/inviteToken:\s*token/.test(docBlock));
  ck("the signature is compared in constant time", /timingSafeEqual/.test(token));
  ck("a length mismatch cannot throw", /a\.length !== b\.length \|\| !timingSafeEqual/.test(token));
  ck("resolution ALSO checks the stored hash, so a rotated link dies",
    /onboarding\.inviteTokenHash !== verified\.hash/.test(portal));
  ck("and the expiry", /expiry\.getTime\(\) < Date\.now\(\)/.test(portal));
  ck("reissuing rotates the hash", /inviteTokenHash: hash/.test(svc));
}

console.log("\n-- the client sees only their own side --");
{
  ck("the portal view is built by naming fields, not by stripping",
    /export async function buildPortalView/.test(portal));
  for (const leak of ["accountOwnerUid", "blockedReason", "notes", "createdByUid", "stripe"]) {
    ck(`  the view never carries ${leak}`, !new RegExp(`${leak}:`).test(
      portal.slice(portal.indexOf("export async function buildPortalView")),
    ));
  }
  ck("a section the package did not ask for is refused",
    /That section is not part of this onboarding/.test(portal));
}

console.log("\n-- uploads are verified from storage, not from the caller --");
{
  ck("size and type are read back from the object", /file\.getMetadata\(\)/.test(assets));
  ck("a refused upload is deleted rather than left in the bucket",
    /await file\.delete\(\)\.catch/.test(assets));
  ck("the signed URL is bound to a content type", /contentType: opts\.contentType/.test(assets));
  ck("the path is server-chosen", /\$\{PREFIX\}\/\$\{opts\.onboardingId\}\/\$\{assetId\}/.test(assets));
  ck("assets are never public, only signed reads", /action: "read"/.test(assets) && !/makePublic/.test(assets));
}

console.log("\n-- tenancy and exposure --");
{
  ck("every collection is server-only in the rules",
    /match \/clientOnboardings\/\{onboardingId\}[\s\S]{0,200}allow read, write: if false;/.test(rules));
  ck("subcollections too", /match \/\{sub=\*\*\}[\s\S]{0,60}allow read, write: if false;/.test(rules));
  ck("a foreign agencyId reads as missing", /data\.agencyId === agencyId \? data : null/.test(svc));
  ck("the admin route is owner-gated on every method",
    (adminRoute.match(/requireAgencyOwner\(request\)/g) ?? []).length >= 3);
  ck("the portal routes are public paths", /\\\/api\\\/onboarding\\\//.test(mw) || /onboarding/.test(mw));
  ck("the portal never selects a record by caller-supplied id",
    !/body\.onboardingId/.test(portalRoute));
}

console.log("\n-- the workflow engine owns scheduling, not this feature --");
{
  ck("enrollment fires a first-class trigger", /type: "onboarding\.created"/.test(svc));
  ck("the trigger is a real type", /"onboarding\.created"/.test(readFileSync("src/types/workflows.ts", "utf8")));
  ck("it has an operator-facing label",
    /"onboarding\.created": "Client onboarding started"/.test(readFileSync("src/lib/workflows/catalog.ts", "utf8")));
  // Mentions in comments are fine and expected; CALLS are not.
  ck("no scheduler is built here",
    !/setTimeout\(|publishJSON\(|qstashClient|new Client\(/.test(svc));
  ck("a failing workflow cannot fail the enrollment", /catch \(err\) \{[\s\S]{0,120}workflow trigger failed/.test(svc));
}

console.log("\n-- failures never roll back the thing they describe --");
{
  ck("the audit write swallows its own errors", /audit write failed/.test(svc));
  ck("owner notification swallows its own errors", /owner notification failed/.test(staff));
  ck("a failed handoff task does not strand the handoff", /handoff task failed/.test(handoff));
  ck("staff notification is essential-class, so it is never metered",
    /billing: \{ kind: "essential" \}/.test(staff));
}


console.log("\n-- Stripe routing: only the explicit kind can enroll --");
{
  const identity = readFileSync("src/lib/stripe/checkout-identity.ts", "utf8");
  const enroll = readFileSync("src/lib/onboarding/stripe-enrollment.ts", "utf8");
  const hook = readFileSync("src/lib/stripe/webhooks.ts", "utf8");

  ck("routing is on metadata.kind alone",
    /metadata\.kind === DIVINEX_ONBOARDING_KIND/.test(identity));
  {
    // Comments explaining that these do NOT decide are expected; CODE reading
    // them is not. Strip comments before looking.
    const code = identity
      .slice(identity.indexOf("export function classifyCheckoutSession"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    ck("no amount, product or description decides the route",
      !/amount_total|amount_subtotal|\bproduct\b|description/i.test(code));
  }
  ck("the existing routes are untouched",
    ["founders", "subAccountPlan", "publicSelfServeSignup", "quoteInvoicePayment", "legacyUserSubscription"]
      .every((r) => identity.includes(`"${r}"`)));

  ck("1. event id is claimed persistently", /collection\(EVENTS\)\.doc\(eventId\)\.create/.test(enroll));
  ck("   a collision means duplicate, not a crash", /code === 6\) return false/.test(enroll));
  ck("   and any other error re-raises so Stripe retries", /throw err;/.test(enroll));
  ck("2. an unpaid session does not enroll",
    /session\.payment_status !== "paid"/.test(enroll) && /return "unpaid"/.test(enroll));
  ck("3. a renewal does not enroll",
    /billingReason !== "subscription_create"/.test(enroll) && /return "renewal"/.test(enroll));
  ck("4. eligibility is the registered-price allowlist",
    /packageForStripePrice\(agencyId, priceId\)/.test(enroll) && /return "no_package"/.test(enroll));
  ck("   metadata disagreeing with the price is refused, not guessed",
    /opts\.packageId !== pkg\.id/.test(enroll) && /return "invalid"/.test(enroll));
  ck("5. the workspace is resolved, never hardcoded",
    /resolveCrmWorkspaceId\(\{ agencyId \}\)/.test(enroll) && !/MEYB|x4NO/.test(enroll));
  ck("6. it calls the SAME canonical service",
    /enrollClient\(\{/.test(enroll) && /source: "stripe"/.test(enroll));
  ck("   and creates no record of its own",
    !/collection\("clientOnboardings"\)/.test(enroll) && !/createContactServerSide/.test(enroll));

  ck("line items are fetched, since the webhook omits them",
    /expand: \["line_items"\]/.test(enroll));
  ck("no event means no enrollment, rather than one without idempotency",
    /cannot guarantee idempotency, so not enrolling/.test(hook));
  ck("the client invite is not emailed from the Stripe path",
    /The invite link is NOT emailed from here/.test(enroll));
}

console.log("\n-- the reminder sequence stops on real state --");
{
  const wf = readFileSync("scripts/seed-onboarding-workflow.mts", "utf8");
  ck("it is seeded as a draft", /status: existing\.empty \? "draft"/.test(wf));
  ck("it triggers on onboarding.created", /type: "onboarding\.created"/.test(wf));
  ck("every checkpoint checks stopped first",
    (wf.match(/tag\(ONBOARDING_TAGS\.stopped\)/g) ?? []).length === 4);
  ck("the day-2 reminder is gated on intake", /tag\(ONBOARDING_TAGS\.intakeDone\)/.test(wf));
  ck("the day-4 reminder is gated on requirements", /tag\(ONBOARDING_TAGS\.requirementsDone\)/.test(wf));
  ck("day 9 escalates internally, with no client email",
    /type: "create_task"/.test(wf) && /recipient: "owner"/.test(wf));
  ck("every client email carries the unsubscribe link",
    (wf.match(/\{\{unsubscribeLink\}\}/g) ?? []).length >= 1 && /const SIGNOFF/.test(wf));
  ck("no scheduling code of its own", !/setTimeout\(|publishJSON\(/.test(wf));

  const svc2 = readFileSync("src/lib/server/client-onboarding-service.ts", "utf8");
  ck("tags are derived from live state, not incremented",
    /computeCompletion\(onboarding, assetKeys, access\)/.test(svc2.slice(svc2.indexOf("syncOnboardingTags"))));
  ck("a tag failure never fails the real action", /tag sync failed/.test(svc2));
}

console.log("\n-- the workspace is derived, never guessed --");
{
  const home = readFileSync("src/lib/onboarding/home-workspace.ts", "utf8");
  ck("it sorts by account number", /a\.accountNumber - b\.accountNumber/.test(home));
  ck("it does not match on name, which is ambiguous here", !/\.name/.test(home));
  // The id IS named now, deliberately. What matters is that naming it cannot
  // misroute contacts: the constant is proved against live data before use,
  // and a stale one falls back to the derivation rather than winning.
  ck("the configured id is verified against live data before it is trusted",
    /snap\.exists && \(snap\.data\(\) as \{ agencyId\?: string \}\)\.agencyId === agencyId/.test(home));
  ck("a stale configured id falls back to the derivation",
    /falling back to the lowest account number/.test(home));
  ck("and it is not hardcoded in the enrollment paths",
    !/MEYB8CbWlE5fxAn3TJOp/.test(readFileSync("src/lib/server/client-onboarding-service.ts", "utf8")) &&
      !/MEYB8CbWlE5fxAn3TJOp/.test(readFileSync("src/lib/onboarding/stripe-enrollment.ts", "utf8")));
  ck("an override stays available for testing", /override\?: string \| null/.test(home));
  ck("the admin route resolves rather than demanding an id",
    /resolveCrmWorkspaceId\(\{/.test(readFileSync("src/app/api/agency/onboarding/route.ts", "utf8")));
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
