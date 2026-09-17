/**
 * EXECUTABLE PROOF FOR THE COMPLIANCE RULES.
 *
 * The SMS enforcement layer relies on `firestore.rules` to stop a client from
 * rewriting the fields that decide whether a person may lawfully be texted.
 * That claim was previously backed only by grepping the rules file for a
 * helper name, which proves the text exists and proves nothing about what the
 * rules engine does with it. A security boundary asserted by regex is not a
 * boundary.
 *
 * So this runs the REAL firestore.rules inside the Firestore emulator and
 * makes actual client-SDK writes as real authenticated users, then asserts
 * allow or deny on each one. Deliberately narrow: one emulator, one rules
 * file, the contact + suppression paths this layer touches, and nothing else.
 * It is not a general Firebase test platform.
 *
 * PREREQUISITE: a Java runtime, which the emulator needs. Point JAVA_HOME at
 * one if `java` is not already on PATH.
 *
 *   JAVA_HOME=<jre> npx firebase emulators:exec --only firestore \
 *     "NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-sms-rules.mts"
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

let failures = 0;
const check = async (label: string, run: () => Promise<unknown>) => {
  try {
    await run();
    console.log(`PASS ${label}`);
  } catch (err) {
    console.log(`FAIL ${label} — ${err instanceof Error ? err.message : String(err)}`);
    failures++;
  }
};

const AGENCY = "ag1";
const SA_A = "saA";
const SA_B = "saB";
const CONTACT = "c1";

const env: RulesTestEnvironment = await initializeTestEnvironment({
  projectId: "divinex-rules-test",
  firestore: {
    rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});

// Members of two different workspaces in the same agency. Neither is the
// agency owner, so they exercise the ordinary membership path.
const memberA = env.authenticatedContext("uidA", { status: "active", agencyId: AGENCY, agencyRole: "member" });
const memberB = env.authenticatedContext("uidB", { status: "active", agencyId: AGENCY, agencyRole: "member" });

// Seed with rules disabled: this is the server-written state the client then
// tries, and must fail, to change.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [sa, uid] of [[SA_A, "uidA"], [SA_B, "uidB"]] as const) {
    await setDoc(doc(db, `subAccounts/${sa}`), { id: sa, agencyId: AGENCY, name: sa });
    await setDoc(doc(db, `subAccounts/${sa}/subAccountMembers/${uid}`), { status: "active", role: "admin" });
  }
  await setDoc(doc(db, `contacts/${CONTACT}`), {
    id: CONTACT,
    subAccountId: SA_A,
    agencyId: AGENCY,
    name: "Legacy Lead",
    phone: "+14155552671",
    phoneE164: "+14155552671",
    smsOptedOut: true,
    smsConsent: { consented: true, textShown: "original disclosure", consentedAt: null, sourceUrl: null, ip: null },
    territoryId: null,
  });
  await setDoc(doc(db, "contacts/c2"), {
    id: "c2",
    subAccountId: SA_A,
    agencyId: AGENCY,
    name: "Sendable Lead",
    phone: "+14155552673",
    phoneE164: "+14155552673",
    smsOptedOut: false,
    smsConsent: null,
    territoryId: null,
  });
  await setDoc(doc(db, `subAccounts/${SA_A}/smsSuppression/14155552671`), {
    e164: "+14155552671", subAccountId: SA_A, suppressed: true, source: "inbound_keyword", keyword: "STOP",
  });
  await setDoc(doc(db, `subAccounts/${SA_B}/smsSuppression/14155552671`), {
    e164: "+14155552671", subAccountId: SA_B, suppressed: true, source: "inbound_keyword", keyword: "STOP",
  });
  await setDoc(doc(db, `subAccounts/${SA_A}/smsAttestations/14155553000`), {
    e164: "+14155553000", subAccountId: SA_A, contactId: "c2",
    actorUid: "uidA", basis: "operator_attestation",
  });
});

const aDb = memberA.firestore();
const bDb = memberB.firestore();
const contactRef = doc(aDb, `contacts/${CONTACT}`);

console.log("\n══ contact compliance fields are server-owned ══");
await check("A. an ordinary permitted contact edit is ALLOWED", () =>
  assertSucceeds(updateDoc(contactRef, { name: "Renamed By Operator" })));

await check("B. flipping smsOptedOut true→false from the client is DENIED", () =>
  assertFails(updateDoc(contactRef, { smsOptedOut: false })));

// Against a contact that is genuinely NOT suppressed, so this is a real
// transition rather than a no-op rewrite of the same value. (Writing an
// identical value changes no keys, so the rules engine sees nothing to deny —
// which is correct, and worth stating rather than hiding behind an assertion
// that only looked like it passed.)
await check("C. flipping smsOptedOut false→true from the client is DENIED", () =>
  assertFails(updateDoc(doc(aDb, "contacts/c2"), { smsOptedOut: true })));

await check("C2. a no-op rewrite of the SAME value changes no keys and is allowed", () =>
  assertSucceeds(updateDoc(doc(aDb, "contacts/c2"), { smsOptedOut: false })));

await check("D. rewriting smsConsent from the client is DENIED", () =>
  assertFails(updateDoc(contactRef, {
    smsConsent: { consented: true, textShown: "forged", consentedAt: null, sourceUrl: null, ip: null },
  })));

await check("D2. clearing smsConsent from the client is DENIED", () =>
  assertFails(updateDoc(contactRef, { smsConsent: null })));

await check("E. mutating phoneE164 from the client is DENIED", () =>
  assertFails(updateDoc(contactRef, { phoneE164: "+15550000000" })));

await check("F. smuggling a compliance field inside an otherwise legal edit is DENIED", () =>
  assertFails(updateDoc(contactRef, { name: "Innocent Looking", smsOptedOut: false })));

await check("F2. changing the display phone alone is still ALLOWED (server restamps identity)", () =>
  assertSucceeds(updateDoc(contactRef, { phone: "+1 415 555 2671" })));

console.log("\n══ the suppression index is server-written only ══");
await check("G. client CREATE of a suppression record is DENIED", () =>
  assertFails(setDoc(doc(aDb, `subAccounts/${SA_A}/smsSuppression/19998887777`), {
    e164: "+19998887777", subAccountId: SA_A, suppressed: true,
  })));

await check("H. client UPDATE of a suppression record is DENIED", () =>
  assertFails(updateDoc(doc(aDb, `subAccounts/${SA_A}/smsSuppression/14155552671`), { suppressed: false })));

await check("H2. client DELETE of a suppression record is DENIED", () =>
  assertFails(deleteDoc(doc(aDb, `subAccounts/${SA_A}/smsSuppression/14155552671`))));

await check("I. a member CAN read their own workspace's suppression state", () =>
  assertSucceeds(getDoc(doc(aDb, `subAccounts/${SA_A}/smsSuppression/14155552671`))));

await check("J. a member CANNOT read another workspace's suppression state", () =>
  assertFails(getDoc(doc(bDb, `subAccounts/${SA_A}/smsSuppression/14155552671`))));

await check("J2. ... and cannot read the other workspace's contact either", () =>
  assertFails(getDoc(doc(bDb, `contacts/${CONTACT}`))));

console.log("\n══ operator attestations are server-written only ══");
await check("L. client CREATE of an attestation is DENIED", () =>
  assertFails(setDoc(doc(aDb, `subAccounts/${SA_A}/smsAttestations/19998887777`), {
    e164: "+19998887777", subAccountId: SA_A, actorUid: "uidA", basis: "operator_attestation",
  })));

await check("L2. client UPDATE of an attestation is DENIED", () =>
  assertFails(updateDoc(doc(aDb, `subAccounts/${SA_A}/smsAttestations/14155553000`), { actorUid: "someone-else" })));

await check("L3. client DELETE of an attestation is DENIED", () =>
  assertFails(deleteDoc(doc(aDb, `subAccounts/${SA_A}/smsAttestations/14155553000`))));

await check("M. a member CAN read their own workspace's attestation", () =>
  assertSucceeds(getDoc(doc(aDb, `subAccounts/${SA_A}/smsAttestations/14155553000`))));

await check("N. a member CANNOT read another workspace's attestation", () =>
  assertFails(getDoc(doc(bDb, `subAccounts/${SA_A}/smsAttestations/14155553000`))));

console.log("\n══ unrelated contact CRUD is untouched ══");
await check("K. creating a contact in your own workspace is ALLOWED", () =>
  assertSucceeds(setDoc(doc(aDb, "contacts/c-new"), {
    id: "c-new", subAccountId: SA_A, agencyId: AGENCY, name: "New Lead", phone: "+14155552672",
  })));

await check("K2. editing ordinary fields is ALLOWED", () =>
  assertSucceeds(updateDoc(doc(aDb, "contacts/c-new"), { name: "Edited", company: "Acme" })));

await check("K3. moving a contact to another tenant is still DENIED", () =>
  assertFails(updateDoc(contactRef, { subAccountId: SA_B })));

await check("K4. deleting your own workspace's contact is ALLOWED (admin)", () =>
  assertSucceeds(deleteDoc(doc(aDb, "contacts/c-new"))));

await env.cleanup();
console.log(failures === 0 ? "\nSMS COMPLIANCE RULES: ALL CHECKS PASSED\n" : `\nSMS COMPLIANCE RULES: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
