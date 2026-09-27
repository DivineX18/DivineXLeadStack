/**
 * W4 — ONE APPROVED SEND IS AT MOST ONE EMAIL.
 *
 * Everything else Zeno does can be looked at afterwards and changed. This
 * cannot: once Resend accepts a message it has left, and no amount of
 * later bookkeeping can call it back. So the cases that matter are the
 * ones where the system might send twice, send to the wrong person, or
 * tell someone it failed when it did not.
 *
 * Every send here goes to Resend's documented sink (delivered@resend.dev).
 * No real recipient, no customer contact.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-email-send.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SINK = "delivered@resend.dev";
process.env.ZENO_DEV_EMAIL_SINK = SINK;

const { getAdminDb } = await import("../src/lib/firebase/admin");
const { AI_SUITE_CAPABILITIES, CapabilityUserError } = await import("../src/lib/ai-suite/capabilities");
const { matchContacts } = await import("../src/lib/server/contact-lookup-service");
const { sendContactEmailServerSide } = await import("../src/lib/server/contact-email-service");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const SA = process.env.ZENO_DEV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OTHER_SA = "2rLhSqe7lBjghhZOOaFh";
const saSnap = await db.doc(`subAccounts/${SA}`).get();
if (!saSnap.exists) { console.error(`workspace ${SA} not found, refusing to run`); process.exit(1); }
const AG = String(saSnap.data()?.agencyId ?? "");
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const ctx = { uid: UID, email: "dev@example.com", displayName: "dev", agencyId: AG, subAccountId: SA, subAccountRole: "admin" };
const cap = (n: string) => AI_SUITE_CAPABILITIES.find((c) => c.name === n)!;
const made: string[] = [];

/** Runs a capability the way the confirm route does: validate, then execute. */
async function run(name: string, raw: Record<string, unknown>) {
  const c = cap(name);
  const v = c.validate(raw);
  if (!v.ok) return { outcome: "rejected" as const, error: v.error };
  const re = c.validate(v.args);
  if (!re.ok) return { outcome: "rejected" as const, error: `re-validate: ${re.error}` };
  try {
    return { outcome: "executed" as const, result: await c.execute(ctx as never, v.args as never) };
  } catch (e) {
    return { outcome: e instanceof CapabilityUserError ? ("refused" as const) : ("threw" as const), error: e instanceof Error ? e.message : String(e) };
  }
}

try {
  console.log("-- naming a person, and refusing to guess --");
  {
    const ROWS = [
      { contactId: "c1", name: "Sarah Johnson", email: "sarah@example.com" },
      { contactId: "c2", name: "Sarah Mills", email: "sarah.mills@example.com" },
      { contactId: "c3", name: "Marcus Webb", email: "marcus@example.com" },
      { contactId: "c4", name: "Sarah", email: "s@example.com" },
    ];
    const one = (n: string, id: string) => { const r = matchContacts(ROWS, n); ck(`"${n}" resolves to ${id}`, r.found === "one" && r.contactId === id, JSON.stringify(r)); };
    one("marcus@example.com", "c3");
    one("Marcus Webb", "c3");
    one("marcus", "c3");
    // An exact name wins over longer names containing it.
    one("Sarah", "c4");
    one("Sarah Johnson", "c1");
    // The realistic hazard is two people with the SAME name. An email to
    // the wrong Sarah Johnson cannot be recalled, so this must ask.
    const TWINS = [...ROWS, { contactId: "c5", name: "Sarah Johnson", email: "sj@other.example.com" }];
    const many = matchContacts(TWINS, "Sarah Johnson");
    ck("two contacts with the same name: it asks, never picks",
      many.found === "many" && many.candidates.length === 2, JSON.stringify(many).slice(0, 100));
    // And a needle that is only ever a loose match, against several.
    const loose = matchContacts(ROWS, "s@");
    ck("a loose needle matching several also asks", loose.found === "many", JSON.stringify(loose).slice(0, 80));
    ck("someone who is not here resolves to nothing", matchContacts(ROWS, "Nobody").found === "none");
    ck("an empty needle resolves to nothing", matchContacts(ROWS, "  ").found === "none");
  }

  // ---- synthetic contact, never a real one ----
  const cRef = db.collection("contacts").doc();
  await cRef.set({ name: "ZENO DEV W4 Test Contact", email: "zeno-dev-w4@example.com", phone: "", company: "",
    source: "manual", tags: [], subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    createdAt: new Date(), updatedAt: new Date() });
  made.push(`contacts/${cRef.id}`);

  console.log("\\n-- drafting is not sending --");
  {
    const d = await run("draft_contact_email", { contact: "ZENO DEV W4 Test Contact", subject: "Following up", body: "Hi there,\\n\\nGood to meet you.\\n\\n[button: Book a call](https://example.com/book)" });
    ck("a draft is created", d.outcome === "executed", "error" in d ? d.error : "");
    if (d.outcome !== "executed") throw new Error("cannot continue");
    const draftId = d.result.mutation!.resourceId;
    made.push(`subAccounts/${SA}/emailDrafts/${draftId}`);
    ck("it says plainly that nothing was sent", /NOT SENT/.test(d.result.resultText));
    ck("the receipt calls it created, not sent", d.result.mutation!.operation === "created");
    ck("the draft is on disk and unsent",
      (await db.doc(`subAccounts/${SA}/emailDrafts/${draftId}`).get()).data()?.sentAt === null);
    ck("its confirmation says nothing is sent",
      /Nothing is sent/.test(cap("draft_contact_email").summarize({ contact: "x", subject: "y" })));

    console.log("\\n-- the confirmation names who and what --");
    const v = cap("send_contact_email").validate({ draft_id: draftId, contact: "ZENO DEV W4 Test Contact" });
    ck("a send validates", v.ok === true);
    if (v.ok) {
      const summary = cap("send_contact_email").summarize(v.args);
      ck("it names the recipient", /ZENO DEV W4 Test Contact/.test(summary), summary);
      ck("it says the act is irreversible", /cannot be undone/.test(summary));
      ck("and it re-validates, so the confirm route can re-check it", cap("send_contact_email").validate(v.args).ok === true);
    }

    console.log("\\n-- the send itself, to the provider sink --");
    const s1 = await run("send_contact_email", { draft_id: draftId });
    ck("the email is accepted by the provider", s1.outcome === "executed", "error" in s1 ? s1.error : "");
    if (s1.outcome === "executed") {
      const rec = s1.result.mutation!;
      ck("the receipt says sent", rec.operation === "sent");
      ck("it carries the provider's id", /^[0-9a-f-]{20,}$/.test(rec.resourceId), rec.resourceId);
      ck("it says sent, never received", /Sent to/.test(s1.result.resultText) && !/received/i.test(s1.result.resultText));
      ck("the body is not in the receipt metadata",
        !JSON.stringify(rec).includes("Good to meet you"));
      ck("the draft is now marked sent, so it cannot go twice",
        (await db.doc(`subAccounts/${SA}/emailDrafts/${draftId}`).get()).data()?.sentAt !== null);

      // CRM history, from the same activity architecture everything uses.
      const acts = await db.collection(`contacts/${cRef.id}/activities`).get();
      const emailActs = acts.docs.filter((a) => a.data().type === "email_sent");
      ck("exactly one activity row was written", emailActs.length === 1, `rows=${emailActs.length}`);
      const meta = emailActs[0]?.data().meta ?? {};
      ck("it records the provider id", meta.messageId === rec.resourceId);
      ck("it records the subject", meta.subject === "Following up");
      ck("it says sent, not delivered", meta.deliveryState === "sent");
    }

    console.log("\\n-- sending the same draft again --");
    const s2 = await run("send_contact_email", { draft_id: draftId });
    ck("a second send of a sent draft is refused", s2.outcome === "refused", "error" in s2 ? s2.error : "");
    ck("and it says so plainly", "error" in s2 && /already been sent/.test(s2.error));
    const acts2 = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent");
    ck("no second activity row", acts2.length === 1);
  }

  console.log("\\n-- the provider deduplicates an identical resend --");
  {
    // Defence in depth: even entering the send twice with the same content
    // yields one message, because the key is derived from the content.
    const a = await sendContactEmailServerSide({ subAccountId: SA, contactId: cRef.id, subject: "Dedupe probe",
      body: "one and only one", actorUid: UID, idempotencyKey: "zeno-dev-w4-dedupe", overrideRecipient: SINK });
    const b = await sendContactEmailServerSide({ subAccountId: SA, contactId: cRef.id, subject: "Dedupe probe",
      body: "one and only one", actorUid: UID, idempotencyKey: "zeno-dev-w4-dedupe", overrideRecipient: SINK });
    ck("both calls succeed", a.ok && b.ok);
    ck("and the provider returned the SAME message, not two",
      a.ok && b.ok && a.providerMessageId === b.providerMessageId, a.ok && b.ok ? `${a.providerMessageId} vs ${b.providerMessageId}` : "");
  }

  console.log("\\n-- adversarial: none of these may send --");
  {
    const before = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent").length;

    const cases: [string, Record<string, unknown>][] = [
      ["a contact that does not exist", { contact: "Nobody At All Here", subject: "s", body: "b" }],
      ["a malformed recipient", { contact: "@@@", subject: "s", body: "b" }],
      ["no subject", { contact: "ZENO DEV W4 Test Contact", body: "b" }],
      ["no body", { contact: "ZENO DEV W4 Test Contact", subject: "s" }],
      ["nothing to send at all", { contact: "ZENO DEV W4 Test Contact" }],

      ["a template that does not exist", { contact: "ZENO DEV W4 Test Contact", template_id: "nope" }],
      ["a draft that does not exist", { draft_id: "definitelyNotADraftId" }],
    ];
    for (const [label, raw] of cases) {
      const r = await run("send_contact_email", raw);
      ck(`${label}: no send`, r.outcome === "rejected" || r.outcome === "refused", r.outcome);
    }

    // Combinations must be stopped at VALIDATION, before anything is
    // resolved. Checking only that "nothing was sent" was too weak: a
    // combination that fell through to a nonexistent draft also sends
    // nothing, and passed while the guard was disabled.
    for (const [label, raw] of [
      ["a draft and a template at once", { draft_id: "d1", template_id: "t1", contact: "x" }],
      ["a draft and a body at once", { draft_id: "d1", subject: "s", body: "b" }],
      ["a template and a body at once", { template_id: "t1", subject: "s", body: "b", contact: "x" }],
    ] as [string, Record<string, unknown>][]) {
      const v = cap("send_contact_email").validate(raw);
      ck(`${label}: refused before anything is resolved`, v.ok === false, v.ok ? "IT VALIDATED" : v.error);
    }

    // A foreign contact id must behave as missing, and nothing may go out.
    const foreign = db.collection("contacts").doc();
    await foreign.set({ name: "ZENO DEV W4 Foreign", email: "zeno-dev-foreign@example.com", subAccountId: OTHER_SA,
      agencyId: AG, createdByUid: UID, mode: "live", source: "manual", tags: [], createdAt: new Date(), updatedAt: new Date() });
    made.push(`contacts/${foreign.id}`);
    const f = await run("send_contact_email", { contact: foreign.id, subject: "s", body: "b" });
    ck("a contact from another workspace: no send", f.outcome === "refused", "error" in f ? f.error : f.outcome);
    ck("and it reads exactly like a contact that is not there",
      "error" in f && /can't find that contact/.test(f.error));

    // The service refuses directly too, not only through the capability.
    const direct = await sendContactEmailServerSide({ subAccountId: SA, contactId: foreign.id, subject: "s", body: "b", actorUid: UID, overrideRecipient: SINK });
    ck("the service itself refuses a foreign contact", !direct.ok && direct.reason === "no_contact");

    const after = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent").length;
    ck("no adversarial case produced a send", after === before, `${before} -> ${after}`);
  }

  console.log("\\n-- the commit boundary is written down, not implied --");
  {
    const svc = readFileSync("src/lib/server/contact-email-service.ts", "utf8");
    ck("acceptance is the boundary, and it is stated", /PAST THIS LINE THE EMAIL HAS GONE/.test(svc));
    ck("bookkeeping happens after it", svc.indexOf("providerMessageId = result.id") < svc.indexOf("email_sent"));
    // Everything after the boundary is examined as a region: not one
    // phrase, but the absence of any way out that turns a sent email into
    // a failure. A first version of this checked for a specific throw and
    // survived a mutation that rethrew the original error.
    {
      const boundary = svc.indexOf("PAST THIS LINE THE EMAIL HAS GONE");
      const region = svc.slice(boundary, svc.indexOf("return {\n    ok: true,", boundary));
      ck("the post-acceptance region contains no throw at all",
        boundary !== -1 && !/\bthrow\b/.test(region), region.match(/.*\bthrow\b.*/)?.[0]?.trim() ?? "");
      ck("and no rejected promise either", !/return Promise\.reject/.test(region));
      ck("failures there are collected instead", /postAcceptanceProblems\.push/.test(region));
      ck("the send still returns ok after them", /ok: true/.test(svc.slice(svc.indexOf("postAcceptanceProblems.length > 0"))));
    }
    ck("the service says what acceptance does NOT mean", /never "received"/.test(svc));
    ck("the route was not left with a second implementation",
      /sendContactEmailServerSide/.test(readFileSync("src/app/api/comms/email/send/route.ts", "utf8")));
    const caps = readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
    ck("bulk sending is refused in the tool's own description",
      /not for bulk email, newsletters or campaigns/.test(caps));
    const prompt = readFileSync("src/lib/ai-suite/prompt.ts", "utf8");
    // The capability says "accepted"; the model was observed upgrading that
    // to "delivered" in its own prose a turn later. A customer who believes
    // a message arrived will not chase it.
    ck("the model is told sent is not delivered", /SENT IS NOT DELIVERED/.test(prompt));
    ck("and which words are forbidden", /Never say delivered, received/.test(prompt));
    ck("every pre-send refusal states that nothing was sent",
      (caps.match(/haven't sent anything|Nothing was sent|I haven't sent it again/g) ?? []).length >= 6);
  }
} finally {
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const strays = (await db.collection("contacts").where("subAccountId", "==", SA).get())
    .docs.filter((d) => /ZENO DEV W4/.test(String(d.data().name ?? ""))).length;
  console.log(`\\ncleaned up ${made.length} dev records; strays: ${strays}`);
  if (strays > 0) fails++;
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
