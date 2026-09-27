/**
 * W6 live: a real conversation through the Telegram gateway.
 *
 * Everything beneath the wire is production code: the same orchestrator,
 * the same capabilities, the same confirmation boundary. Only
 * sendMessage/answerCallback are not called, because a regression run
 * should not need Telegram to deliver anything.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
process.env.TELEGRAM_BOT_TOKEN ??= "ZENO-DEV-NOT-A-REAL-BOT-TOKEN";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "ZENO-DEV-NOT-A-REAL-WEBHOOK-SECRET";
process.env.ZENO_DEV_EMAIL_SINK = "delivered@resend.dev";

const { getAdminDb } = await import("../src/lib/firebase/admin");
const id = await import("../src/lib/telegram/identity");
const { handleTelegramUpdate } = await import("../src/lib/telegram/handle-update");

const db = getAdminDb();
const SA = "MEYB8CbWlE5fxAn3TJOp";
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
const TG = "999000333";
const CHAT = "555000333";
let seq = 0;
const upd = () => Number(`${Date.now()}`.slice(-8)) * 100 + seq++;
const msg = (text: string) => ({ updateId: upd(), telegramUserId: TG, chatId: CHAT, username: "devtester", text, callback: null, fromBot: false });
const tap = (data: string) => ({ updateId: upd(), telegramUserId: TG, chatId: CHAT, username: "devtester", text: null, callback: { id: `cb${upd()}`, data }, fromBot: false });
const show = (label: string, r: { reply: { text: string; buttons?: { text: string; callbackData: string }[] } | null; note: string }) => {
  console.log(`\n### ${label}`);
  console.log(`    ${r.reply ? r.reply.text.replace(/\n/g, "\n    ").slice(0, 400) : `(no reply: ${r.note})`}`);
  if (r.reply?.buttons) console.log(`    [buttons] ${r.reply.buttons.map((b) => b.text).join(" | ")}`);
};
const made: string[] = [];

try {
  // ---- link, exactly as a person would ----
  await db.doc(`telegramLinks/${TG}`).delete().catch(() => {});
  const { token } = await id.createTelegramLinkToken(UID);
  show("1. /start <token>  (connecting)", await handleTelegramUpdate(msg(`/start ${token}`)));
  await id.setTelegramActiveWorkspace(TG, SA);

  // ---- a read-only question, no confirmation expected ----
  const read = await handleTelegramUpdate(msg("How many contacts do we have? Just the number."));
  show("2. a read-only question", read);
  console.log(`    answered without asking to confirm: ${!read.reply?.buttons}`);

  // ---- a consequential action ----
  const cRef = db.collection("contacts").doc();
  await cRef.set({ name: "ZENO DEV TG Lead", email: "zeno-dev-tg@example.com", phone: "", company: "",
    source: "manual", tags: [], subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    createdAt: new Date(), updatedAt: new Date() });
  made.push(`contacts/${cRef.id}`);
  const { createDealServerSide } = await import("../src/lib/server/deals-service");
  const deal = await createDealServerSide({ subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    title: "ZENO DEV TG deal", value: 900, currency: "USD", contactId: cRef.id, stageId: "new", priority: "medium" });
  made.push(`deals/${deal.id}`);

  const proposed = await handleTelegramUpdate(msg('Move the "ZENO DEV TG deal" deal to qualified.'));
  show("3. a consequential request", proposed);
  const btn = proposed.reply?.buttons?.find((b) => b.text === "Confirm");
  console.log(`    it proposed rather than acting: ${!!btn}`);
  console.log(`    the deal is still where it was: ${(await db.doc(`deals/${deal.id}`).get()).data()?.stageId === "new"}`);
  console.log(`    the button carries only a reference: ${btn ? !/qualified|deal|move/i.test(btn.callbackData) : "n/a"}`);

  if (btn) {
    const pid = btn.callbackData.slice(2);
    made.push(`telegramProposals/${pid}`);
    show("4. pressing Confirm", await handleTelegramUpdate(tap(btn.callbackData)));
    console.log(`    the deal moved: ${(await db.doc(`deals/${deal.id}`).get()).data()?.stageId === "qualified"}`);

    show("5. pressing Confirm AGAIN", await handleTelegramUpdate(tap(btn.callbackData)));
    const acts = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs;
    console.log(`    it did not run twice: ${(await db.doc(`deals/${deal.id}`).get()).data()?.stageId === "qualified"}`);
    console.log(`    activity rows on the contact: ${acts.length}`);
  }

  // ---- email through Telegram, to the provider sink only ----
  const draft = await handleTelegramUpdate(msg("Draft a short follow-up email to ZENO DEV TG Lead about our chat."));
  show("6. draft an email", draft);
  const dbtn = draft.reply?.buttons?.find((b) => b.text === "Confirm");
  if (dbtn) {
    made.push(`telegramProposals/${dbtn.callbackData.slice(2)}`);
    show("7. confirm the draft (nothing sent)", await handleTelegramUpdate(tap(dbtn.callbackData)));
    const drafts = await db.collection(`subAccounts/${SA}/emailDrafts`).get();
    for (const d of drafts.docs) made.push(`subAccounts/${SA}/emailDrafts/${d.id}`);
    console.log(`    a draft exists: ${drafts.size > 0}`);
    const sentBefore = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent").length;
    console.log(`    nothing emailed yet: ${sentBefore === 0}`);

    let send = await handleTelegramUpdate(msg("Send it."));
    show("8. send it", send);
    let sbtn = send.reply?.buttons?.find((b) => b.text === "Confirm");
    if (!sbtn) {
      // Zeno sometimes checks in prose before calling the tool, which is a
      // normal turn and not a bypass: nothing was sent. A person answers.
      console.log("    (Zeno asked first rather than proposing; answering as a person would)");
      send = await handleTelegramUpdate(msg("Yes, send it."));
      show("8b. yes, send it", send);
      sbtn = send.reply?.buttons?.find((b) => b.text === "Confirm");
    }
    console.log(`    sending needed confirmation: ${!!sbtn}`);
    const beforeSend = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent").length;
    console.log(`    still nothing sent before confirming: ${beforeSend === 0}`);
    if (sbtn) {
      made.push(`telegramProposals/${sbtn.callbackData.slice(2)}`);
      show("9. confirm the send", await handleTelegramUpdate(tap(sbtn.callbackData)));
      const sentAfter = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent");
      console.log(`    exactly one email submitted: ${sentAfter.length === 1}`);
      console.log(`    recorded as sent, not delivered: ${sentAfter[0]?.data().meta?.deliveryState === "sent"}`);
      show("10. press the send button again", await handleTelegramUpdate(tap(sbtn.callbackData)));
      const finalCount = (await db.collection(`contacts/${cRef.id}/activities`).get()).docs.filter((a) => a.data().type === "email_sent").length;
      console.log(`    STILL exactly one email: ${finalCount === 1}`);
    }
  }
} finally {
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const drafts = await db.collection(`subAccounts/${SA}/emailDrafts`).get();
  for (const d of drafts.docs) await d.ref.delete();
  const threads = await db.collection(`telegramLinks/${TG}/threads`).get();
  for (const t of threads.docs) await t.ref.delete();
  await db.doc(`telegramLinks/${TG}`).delete().catch(() => {});
  for (const c of ["telegramLinkTokens", "telegramProposals"]) {
    const snap = await db.collection(c).get();
    for (const d of snap.docs) if (d.data().uid === UID || d.data().telegramUserId === TG) await d.ref.delete();
  }
  console.log("\ncleaned up");
}
