/**
 * SMS ENFORCEMENT: SUPPRESSION BELONGS TO THE TENANT AND THE PHONE LINE.
 *
 * The read-only Twilio audit found that permission to text someone was an
 * accident of how a contact document happened to look. Delete the contact and
 * re-import the CSV and they were sendable again; store the number as
 * "(555) 123-4567" and their STOP never matched at all; hold the number on a
 * sixth contact row and `.limit(5)` left it sendable; text them from the
 * contact header and no server check ran at all.
 *
 * These are the proofs that each of those is closed.
 *
 * NO TWILIO TRAFFIC. Nothing here reaches a provider: the gate is asked for
 * its verdict directly, which is the same verdict the transport enforces
 * before it will call `messages.create`. Fixtures live under two throwaway
 * sub-account ids and are deleted at the end.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-sms-enforcement.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) {
    process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const { toE164, phoneIdentity, suppressionKey, isSamePhone } = await import(
  "../src/lib/comms/phone-identity.ts"
);
const {
  suppressSms,
  liftSmsSuppression,
  isSmsSuppressed,
  checkSmsSendAllowed,
  smsConsentState,
  findContactsByPhoneIdentity,
  phoneE164Field,
} = await import("../src/lib/comms/sms-gate.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");

const db = getAdminDb();
const TENANT_A = "qa-sms-enforce-a";
const TENANT_B = "qa-sms-enforce-b";
const LINE = "+14155552671";
const created: string[] = [];

async function makeContact(subAccountId: string, id: string, phone: string, extra: Record<string, unknown> = {}) {
  const path = `contacts/${id}`;
  await db.doc(path).set({
    id,
    subAccountId,
    agencyId: "qa-agency",
    name: id,
    phone,
    ...phoneE164Field(phone),
    smsOptedOut: false,
    ...extra,
  });
  created.push(path);
}

try {
  // ── A / M. One line, one identity; ambiguity refused ─────────────────────
  console.log("\n══ one phone line has one identity ══");
  check("A. formatting noise does not create a second identity",
    phoneIdentity("+1 (415) 555-2671") === LINE &&
      phoneIdentity("+1 415.555.2671") === LINE &&
      phoneIdentity("  +1-415-555-2671 ") === LINE);
  check("A2. the 00 international prefix is the same statement as +",
    phoneIdentity("001 415 555 2671") === LINE);
  check("A3. one identity gives one suppression key", suppressionKey(LINE) === "14155552671");
  check("A4. stored-with-country and inbound E.164 are the same line",
    isSamePhone("+1 (415) 555-2671", LINE));

  const bare = toE164("(415) 555-2671");
  check("M. a number with NO country code is refused, never assumed to be US",
    !bare.ok && bare.reason === "ambiguous_country", JSON.stringify(bare));
  check("M2. junk and empty are refused",
    !toE164("not a phone").ok && !toE164("").ok && !toE164(null).ok);
  check("M3. two unparseable strings are NOT equal identities",
    !isSamePhone("(415) 555-2671", "(415) 555-2671"));

  // ── N. Consent is three states, and automation needs the recorded one ────
  console.log("\n══ having a phone number is not consent ══");
  check("N1. no consent record reads as unknown, not as consent",
    smsConsentState({ smsConsent: null }) === "unknown" && smsConsentState(null) === "unknown");
  check("N2. a ticked disclosure reads as recorded",
    smsConsentState({ smsConsent: { consented: true, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } }) === "recorded");
  check("N3. an unticked disclosure reads as declined",
    smsConsentState({ smsConsent: { consented: false, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } }) === "declined");

  const autoNoConsent = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: LINE, contact: { smsOptedOut: false, smsConsent: null }, posture: "automated",
  });
  check("N. automated send with NO recorded consent is refused",
    !autoNoConsent.allowed && autoNoConsent.reason === "consent_unknown", JSON.stringify(autoNoConsent));

  const manualNoConsent = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: LINE, contact: { smsOptedOut: false, smsConsent: null }, posture: "manual",
  });
  check("N2b. a manual 1:1 to an unknown-consent contact is refused pending an operator path",
    !manualNoConsent.allowed && manualNoConsent.reason === "attestation_required",
    JSON.stringify(manualNoConsent));

  const declined = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: LINE,
    contact: { smsOptedOut: false, smsConsent: { consented: false, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } },
    posture: "manual",
  });
  check("N3b. an explicit decline blocks even a manual send",
    !declined.allowed && declined.reason === "consent_declined");

  const invalid = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: "(415) 555-2671", contact: null, posture: "manual",
  });
  check("M4. an ambiguous destination is never sent to",
    !invalid.allowed && invalid.reason === "invalid_phone");

  // ── B / C / D / E / F. STOP, and what it blocks ──────────────────────────
  console.log("\n══ STOP suppresses the line, for this tenant only ══");
  // F: six legacy representations of one line, which the old .limit(5) missed.
  for (let i = 0; i < 6; i++) {
    await makeContact(TENANT_A, `qa-a-${i}`, i % 2 === 0 ? LINE : "+1 (415) 555-2671");
  }
  await makeContact(TENANT_B, "qa-b-0", LINE);

  check("B0. before STOP the line is sendable", !(await isSmsSuppressed(TENANT_A, LINE)));
  await suppressSms({ subAccountId: TENANT_A, e164: LINE, source: "inbound_keyword", keyword: "STOP" });
  check("B. STOP suppresses the line", await isSmsSuppressed(TENANT_A, LINE));

  const manualAfterStop = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: LINE, contact: { smsOptedOut: false, smsConsent: null }, posture: "manual",
  });
  check("C. a later MANUAL send is blocked server-side, even with the contact flag unset",
    !manualAfterStop.allowed && manualAfterStop.reason === "suppressed", JSON.stringify(manualAfterStop));

  const autoAfterStop = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: LINE,
    contact: { smsOptedOut: false, smsConsent: { consented: true, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } },
    posture: "automated",
  });
  check("D. a later WORKFLOW send is blocked server-side, even with consent recorded",
    !autoAfterStop.allowed && autoAfterStop.reason === "suppressed");

  check("E. tenant B is NOT affected by tenant A's STOP", !(await isSmsSuppressed(TENANT_B, LINE)));
  const tenantBSend = await checkSmsSendAllowed({
    subAccountId: TENANT_B, to: LINE,
    contact: { smsOptedOut: false, smsConsent: { consented: true, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } },
    posture: "manual",
  });
  check("E2. ... and tenant B may still send to that line", tenantBSend.allowed);

  const matched = await findContactsByPhoneIdentity(TENANT_A, LINE);
  check("F. ALL six representations in tenant A are found (the old cap was 5)",
    matched.length === 6, `found ${matched.length}`);
  check("F2. ... and none of tenant B's contacts are included",
    matched.every((d) => (d.data() as { subAccountId: string }).subAccountId === TENANT_A));

  // ── G. Re-import cannot resurrect permission ─────────────────────────────
  console.log("\n══ suppression survives the contact being recreated ══");
  for (const p of created.filter((p) => p.includes("qa-a-"))) await db.doc(p).delete();
  check("G0. every tenant-A contact is gone", (await findContactsByPhoneIdentity(TENANT_A, LINE)).length === 0);
  // Re-imported later, differently formatted, freshly "opted in" by the importer.
  await makeContact(TENANT_A, "qa-a-reimport", "+1 415.555.2671", { smsOptedOut: false });
  const afterReimport = await checkSmsSendAllowed({
    subAccountId: TENANT_A, to: "+1 415.555.2671", contact: { smsOptedOut: false, smsConsent: null }, posture: "manual",
  });
  check("G. a re-imported, differently formatted duplicate is STILL suppressed",
    !afterReimport.allowed && afterReimport.reason === "suppressed", JSON.stringify(afterReimport));

  // ── Suppression outranks every consent posture ───────────────────────────
  console.log("\n══ suppression overrides every posture, including the responsive ones ══");
  await suppressSms({ subAccountId: TENANT_A, e164: LINE, source: "inbound_keyword", keyword: "STOP" });
  const postures: [string, "automated" | "manual" | "responsive", Parameters<typeof checkSmsSendAllowed>[0]["contact"]][] = [
    ["manual operator send", "manual", { smsOptedOut: false, smsConsent: null }],
    ["workflow (consent recorded)", "automated", { smsOptedOut: false, smsConsent: { consented: true, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } }],
    ["AI auto-reply (responsive)", "responsive", null],
    ["missed-call text-back (responsive)", "responsive", null],
    ["review request", "automated", { smsOptedOut: false, smsConsent: { consented: true, textShown: "x", consentedAt: null, sourceUrl: null, ip: null } }],
  ];
  for (const [name, posture, contact] of postures) {
    const v = await checkSmsSendAllowed({ subAccountId: TENANT_A, to: LINE, contact, posture });
    check(`suppression beats "${name}" — no provider call`,
      !v.allowed && v.reason === "suppressed", JSON.stringify(v));
  }
  check("... and the transport is what enforces it, so no caller can opt out of the check",
    /if \(!verdict\.allowed\) throw new SmsSuppressedError\(verdict\);/.test(
      readFileSync(new URL("../src/lib/comms/twilio.ts", import.meta.url), "utf8")));

  // ── E.164 refusals are readable, not internal errors ─────────────────────
  console.log("\n══ an ambiguous number tells the operator what to do ══");
  const ambiguous = await checkSmsSendAllowed({
    subAccountId: TENANT_B, to: "(415) 555-2671", contact: null, posture: "manual",
  });
  check("an operator is told to add the country code, with an example",
    !ambiguous.allowed && /country code/i.test(ambiguous.detail) && /\+1/.test(ambiguous.detail),
    ambiguous.allowed ? "" : ambiguous.detail);
  const junk = await checkSmsSendAllowed({
    subAccountId: TENANT_B, to: "not a phone", contact: null, posture: "manual",
  });
  check("unreadable input gets a readable refusal too",
    !junk.allowed && !/unparseable|ambiguous_country/.test(junk.detail),
    junk.allowed ? "" : junk.detail);

  // ── J / K. Re-subscribe is explicit, and history survives ────────────────
  console.log("\n══ re-subscribing is explicit, and never erases the opt-out ══");
  const inboundSrc = readFileSync(new URL("../src/app/api/webhooks/twilio/inbound/route.ts", import.meta.url), "utf8");
  check("J. a bare conversational YES is no longer a re-subscribe keyword",
    /const START_WORDS = new Set\(\["START", "UNSTOP"\]\)/.test(inboundSrc));
  check("J2. START and UNSTOP remain", /"START", "UNSTOP"/.test(inboundSrc));

  await liftSmsSuppression({ subAccountId: TENANT_A, e164: LINE, source: "inbound_keyword", keyword: "START" });
  check("K. an explicit START lifts the suppression", !(await isSmsSuppressed(TENANT_A, LINE)));
  const rec = (await db.doc(`subAccounts/${TENANT_A}/smsSuppression/${suppressionKey(LINE)}`).get()).data() as
    | { history?: { action: string; keyword: string | null }[]; suppressedAt?: unknown }
    | undefined;
  check("K2. the original opt-out is still on record (history is not erased)",
    !!rec && Array.isArray(rec.history) && rec.history.some((h) => h.action === "suppressed" && h.keyword === "STOP"),
    JSON.stringify(rec?.history));
  check("K3. ... alongside the lift", !!rec?.history?.some((h) => h.action === "lifted" && h.keyword === "START"));

  // ── L. HELP never reaches the model ──────────────────────────────────────
  console.log("\n══ HELP is answered by the product, not by the model ══");
  check("L. HELP is intercepted before the AI dispatch branch",
    inboundSrc.indexOf("if (isHelp)") < inboundSrc.indexOf("aiIsConfigured()"),
    `help@${inboundSrc.indexOf("if (isHelp)")} ai@${inboundSrc.indexOf("aiIsConfigured()")}`);
  check("L2. HELP and INFO are recognised", /HELP_WORDS = new Set\(\["HELP", "INFO"\]\)/.test(inboundSrc));
  check("L3. an unconfigured workspace gets a logged failure, not an invented support address",
    /configured business name to answer with/.test(inboundSrc));

  // ── Tenant safety of the inbound handler itself ──────────────────────────
  console.log("\n══ the inbound handler cannot mutate across tenants ══");
  check("E3. shared mode refuses to attribute a keyword to any workspace",
    /route\.mode !== "dedicated" \|\| !route\.subAccountId/.test(inboundSrc) &&
      /No contact was modified/.test(inboundSrc));
  check("F3. the capped contact query is gone", !/\.limit\(5\)\.get\(\)/.test(inboundSrc));

  // ── O / P. The workflow audit record ─────────────────────────────────────
  console.log("\n══ an automated text leaves a retrievable record ══");
  const engineSrc = readFileSync(new URL("../src/lib/workflows/engine.ts", import.meta.url), "utf8");
  check("O. a suppressed workflow attempt is recorded with its reason",
    /recordWorkflowSmsAttempt\(\{\s*ctx, to, body, outcome: "suppressed", reason: err\.reason/.test(engineSrc));
  check("O2. ... and is distinguishable from a provider failure",
    /outcome: "failed", reason/.test(engineSrc) && /suppressionReason: opts\.outcome === "suppressed"/.test(engineSrc));
  check("P. a successful workflow send records the provider SID and status",
    /outcome: "sent",\s*sid: sent\.sid/.test(engineSrc) && /twilioMessageSid: opts\.sid/.test(engineSrc));
  check("P2. the record carries workspace, contact, run and recipient",
    /workflowRunId: ctx\.runId/.test(engineSrc) && /subAccountId: ctx\.subAccountId/.test(engineSrc) &&
      /contactId: ctx\.contact\.id/.test(engineSrc) && /to: opts\.to/.test(engineSrc));

  // ── The transport is the boundary ────────────────────────────────────────
  console.log("\n══ no send path can bypass the gate ══");
  const twilioSrc = readFileSync(new URL("../src/lib/comms/twilio.ts", import.meta.url), "utf8");
  check("the gate runs inside sendSmsForSubAccount, before messages.create",
    twilioSrc.indexOf("checkSmsSendAllowed") < twilioSrc.indexOf("client.messages.create"));
  check("the destination dialled is the canonical identity the gate validated",
    /to: verdict\.e164/.test(twilioSrc));
  check("every caller must state its send posture (compile-time)",
    /posture: SmsSendPosture;/.test(twilioSrc));

  const manualRouteSrc = readFileSync(new URL("../src/app/api/comms/sms/send/route.ts", import.meta.url), "utf8");
  check("C2. the manual route refuses a suppressed send with 409, not a provider error",
    /SmsSuppressedError/.test(manualRouteSrc) && /status: 409/.test(manualRouteSrc));

  // ── H / I. Compliance fields are server-written ──────────────────────────
  console.log("\n══ a client cannot rewrite compliance state ══");
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  check("H. smsOptedOut is refused on a client contact update",
    /hasAny\(\['smsOptedOut', 'smsConsent', 'phoneE164'\]\)/.test(rules));
  check("I. smsConsent and phoneE164 are refused in the same guard",
    /complianceFieldsUnchanged\(\)/.test(rules) &&
      rules.includes("&& complianceFieldsUnchanged()"));
  check("H2. the suppression index is server-written only",
    /match \/smsSuppression\/\{phoneKey\}/.test(rules) &&
      /smsSuppression[\s\S]{0,320}allow write: if false;/.test(rules));
  check("H3. ordinary contact edits still pass (tenant guard unchanged)",
    /tenantFieldsLockedOnUpdate\(\)/.test(rules));
} finally {
  for (const p of created) await db.doc(p).delete().catch(() => {});
  for (const t of [TENANT_A, TENANT_B]) {
    for (const line of [LINE, "+14155553000", "+14155554000"]) {
      await db.doc(`subAccounts/${t}/smsSuppression/${suppressionKey(line)}`).delete().catch(() => {});
    }
  }
  await db.doc(`contacts/qa-a-reimport`).delete().catch(() => {});
}

console.log(failures === 0 ? "\nSMS ENFORCEMENT: ALL CHECKS PASSED\n" : `\nSMS ENFORCEMENT: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
