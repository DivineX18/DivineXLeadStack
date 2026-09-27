/** The W1 claim guarding a real send: concurrency, replay, mutation, foreign caller. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const SINK = "delivered@resend.dev";
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { claimExecution, settleExecution, hashArgs } = await import("../src/lib/ai-suite/execution-claim");
const { sendContactEmailServerSide } = await import("../src/lib/server/contact-email-service");
const db = getAdminDb();
const SA = "MEYB8CbWlE5fxAn3TJOp";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
let fails = 0;
const ck = (n: string, ok: boolean, d="") => { console.log(`${ok?"PASS":"FAIL"}  ${n}${d?` - ${d}`:""}`); if(!ok) fails++; };

const cRef = db.collection("contacts").doc();
await cRef.set({ name: "ZENO DEV W4 Claim Contact", email: "zeno-dev-claim@example.com", subAccountId: SA,
  agencyId: AG, createdByUid: "u1", mode: "live", source: "manual", tags: [], createdAt: new Date(), updatedAt: new Date() });
const SCOPE = `sa_${SA}`;
const PID = `zenodev-send-${Date.now()}`;
const ARGS = hashArgs({ draftId: "d1" });
const sends: string[] = [];

/** Exactly the confirm route's order: claim, then send, then settle. */
async function confirmSend(uid: string, argsHash: string, capability = "send_contact_email") {
  const claim = await claimExecution({ scope: SCOPE, proposalId: PID, uid, capability, argsHash });
  if (claim.outcome === "replayed") return { kind: "replayed" as const, body: claim.response };
  if (claim.outcome !== "claimed") return { kind: claim.outcome, body: null };
  const sent = await sendContactEmailServerSide({ subAccountId: SA, contactId: cRef.id, subject: "Claim probe",
    body: "one approved send", actorUid: uid, idempotencyKey: `zeno-dev-claim-${PID}`, overrideRecipient: SINK });
  if (sent.ok) sends.push(sent.providerMessageId);
  const body = { ok: sent.ok, id: sent.ok ? sent.providerMessageId : null };
  await settleExecution({ scope: SCOPE, proposalId: PID, response: body });
  return { kind: "sent" as const, body };
}

try {
  console.log("-- five concurrent confirmations of one approved send --");
  const all = await Promise.all(Array.from({ length: 5 }, () => confirmSend("u1", ARGS)));
  ck("exactly one performed the send", all.filter((r) => r.kind === "sent").length === 1, JSON.stringify(all.map((r)=>r.kind)));
  ck("exactly one provider submission", sends.length === 1, `submissions=${sends.length}`);

  console.log("\n-- replay after it completed --");
  const replay = await confirmSend("u1", ARGS);
  ck("a replay does not send again", replay.kind === "replayed");
  ck("still one provider submission", sends.length === 1);
  ck("and it returns the ORIGINAL result", replay.kind === "replayed" && (replay.body as {id?:string})?.id === sends[0]);

  console.log("\n-- the same confirmation, tampered with --");
  const mutated = await confirmSend("u1", hashArgs({ draftId: "SOMETHING ELSE" }));
  ck("different arguments under the same id: refused", mutated.kind === "mismatch");
  const otherUser = await confirmSend("u2", ARGS);
  ck("another user replaying it: refused, not served the answer", otherUser.kind === "mismatch");
  const otherCap = await confirmSend("u1", ARGS, "delete_contact");
  ck("the same id for a different action: refused", otherCap.kind === "mismatch");
  ck("none of those sent anything", sends.length === 1, `submissions=${sends.length}`);

  console.log("\n-- another workspace, same proposal id --");
  const foreign = await claimExecution({ scope: "sa_SOMEWHERE_ELSE", proposalId: PID, uid: "u1", capability: "send_contact_email", argsHash: ARGS });
  ck("it is a fresh claim, never a replay of ours", foreign.outcome === "claimed");
  await db.doc(`aiSuiteExecutions/sa_SOMEWHERE_ELSE__${PID}`).delete().catch(()=>{});

  const acts = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a)=>a.data().type==="email_sent");
  ck("the contact's history shows exactly one email", acts.length === 1, `rows=${acts.length}`);
} catch (err) {
  // An aborted run is a failed run. Without this a throw escapes to the
  // finally, which prints a result from a counter that was never
  // incremented, and a run that blew up reports ALL PASS.
  fails++;
  console.log(`FAIL  the suite threw before finishing - ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await db.recursiveDelete(cRef).catch(async () => { await cRef.delete().catch(()=>{}); });
  await db.doc(`aiSuiteExecutions/${SCOPE}__${PID}`).delete().catch(()=>{});
  console.log(`\ncleaned up. total provider submissions this run: ${sends.length}`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
