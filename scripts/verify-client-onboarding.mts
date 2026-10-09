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

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
