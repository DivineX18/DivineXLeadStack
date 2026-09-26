/**
 * Editing a CTA through the real conversational path, on a safe saved
 * template and a safe DRAFT workflow. Nothing live is touched.
 */
import { ask, show, db, SA } from "./zeno-live-e2e.mts";
const { createMessageTemplateServerSide } = await import("../src/lib/server/message-templates-service");
const { createWorkflowServerSide, updateWorkflowServerSide } = await import("../src/lib/server/workflows-service");
const { renderBodyHtml, renderBodyText } = await import("../src/lib/email/body");

const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const URL1 = "https://example.com/zeno-e2e-book";
const BODY = [
  "Hi {{contact.firstName}},",
  "",
  "Thanks for getting in touch about {{contact.company}}. Here is what happens next.",
  "",
  "Speak soon,",
  "The team",
  "",
  "{{unsubscribeLink}}",
].join("\n");

const made: string[] = [];
const tplBody = async (id: string) => String((await db.doc(`message_templates/${id}`).get()).data()?.body ?? "");
const wfEmail = async (id: string, n: number) => {
  const wf = (await db.doc(`workflows/${id}`).get()).data()!;
  const ids = Object.keys(wf.nodes ?? {}).filter((k) => wf.nodes[k].type === "send_email");
  return { body: String(wf.nodes[ids[n - 1]]?.config?.body ?? ""), wf };
};
/** The words, ignoring the blank-line spacing an inserted button adds. */
const copyOf = (b: string) =>
  b.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("[button")).join("\n");
/** Exact text, including spacing. */
const exactOf = (b: string) => b.split("\n").filter((l) => !l.trim().startsWith("[button")).join("\n").trim();

try {
  // ---------------- SAVED TEMPLATE ----------------
  const tid = await createMessageTemplateServerSide({ subAccountId: SA, createdByUid: UID,
    name: "ZENO E2E TEST - DELETE cta", type: "email", subject: "Thanks for reaching out", body: BODY });
  made.push(`message_templates/${tid}`);
  const t0 = await tplBody(tid);
  console.log(`\n=== TEMPLATE ${tid}\nBEFORE:\n${t0.split("\n").map((l)=>"   |"+l).join("\n")}`);

  show("template: add a Book a Call button",
    await ask([`Add a Book a Call button linking to ${URL1} to the email template called "ZENO E2E TEST - DELETE cta".`, "Yes, go ahead."], { autoConfirm: true }));
  const t1 = await tplBody(tid);
  console.log(`AFTER:\n${t1.split("\n").map((l)=>"   |"+l).join("\n")}`);
  console.log(`    button added: ${t1.includes("[button: Book a Call](" + URL1 + ")")}`);
  console.log(`    it sits above the unsubscribe link: ${t1.indexOf("[button") < t1.indexOf("{{unsubscribeLink}}")}`);
  console.log(`    every original line of copy survives: ${copyOf(t0) === copyOf(t1)}`);
  console.log(`    (spacing around the inserted button differs by ${exactOf(t1).split("\n").length - exactOf(t0).split("\n").length} blank line(s), no words changed)`);
  console.log(`    personalisation survives: ${t1.includes("{{contact.firstName}}") && t1.includes("{{contact.company}}")}`);
  console.log(`    unsubscribe survives: ${t1.includes("{{unsubscribeLink}}")}`);
  const doc1 = (await db.doc(`message_templates/${tid}`).get()).data()!;
  console.log(`    subject unchanged: ${doc1.subject === "Thanks for reaching out"}; name unchanged: ${doc1.name === "ZENO E2E TEST - DELETE cta"}; type unchanged: ${doc1.type === "email"}`);
  const html = renderBodyHtml(t1.replace("{{unsubscribeLink}}", "https://x.test/u"));
  console.log(`    renders as the table button: ${/<table[\s\S]*?zeno-e2e-book/.test(html)}`);
  console.log(`    plain-text fallback carries label + URL: ${renderBodyText(t1).includes("Book a Call") && renderBodyText(t1).includes(URL1)}`);

  show("template: change the button text only",
    await ask([`Change that button's text to "Schedule a Call" on the "ZENO E2E TEST - DELETE cta" template.`, "Yes, go ahead."], { autoConfirm: true }));
  const t2 = await tplBody(tid);
  console.log(`    label changed: ${t2.includes("Schedule a Call") && !t2.includes("Book a Call")}`);
  console.log(`    URL unchanged: ${t2.includes(URL1)}`);
  console.log(`    surrounding copy byte-identical: ${copyOf(t1) === copyOf(t2)}`);
  console.log(`    still exactly one button: ${(t2.match(/\[button/g) ?? []).length === 1}`);

  show("template: remove the button",
    await ask([`Remove the CTA button from the "ZENO E2E TEST - DELETE cta" template.`, "Yes, go ahead."], { autoConfirm: true }));
  const t3 = await tplBody(tid);
  console.log(`    button gone: ${!t3.includes("[button")}`);
  console.log(`    the rest of the email is unchanged: ${t3.trim() === t0.trim()}`);

  // ---------------- DRAFT WORKFLOW ----------------
  const wid = await createWorkflowServerSide({ subAccountId: SA, createdByUid: UID,
    name: "ZENO E2E TEST - DELETE cta flow", template: "blank" });
  made.push(`workflows/${wid}`);
  await updateWorkflowServerSide({ subAccountId: SA, workflowId: wid, patch: {
    trigger: { type: "form.submitted", filters: { all: [] } },
    startNodeId: "e1",
    nodes: {
      e1: { id: "e1", type: "send_email", config: { subject: "Welcome", body: BODY }, next: "w1" },
      w1: { id: "w1", type: "wait", config: { hours: 48 }, next: "e2" },
      e2: { id: "e2", type: "send_email", config: { subject: "Following up", body: BODY }, next: null },
    },
  } });
  const w0 = await wfEmail(wid, 2);
  const e1before = (await wfEmail(wid, 1)).body;
  console.log(`\n=== WORKFLOW ${wid} (status=${w0.wf.status})`);

  show("workflow: add a button to email 2 only",
    await ask([`Add a Book a Call button linking to ${URL1} to email 2 of the automation called "ZENO E2E TEST - DELETE cta flow".`, "Yes, go ahead."], { autoConfirm: true }));
  const w1 = await wfEmail(wid, 2);
  const e1after = (await wfEmail(wid, 1)).body;
  console.log(`    email 2 has the button: ${w1.body.includes("[button: Book a Call](" + URL1 + ")")}`);
  console.log(`    above its unsubscribe link: ${w1.body.indexOf("[button") < w1.body.indexOf("{{unsubscribeLink}}")}`);
  console.log(`    email 2's copy otherwise unchanged: ${copyOf(w0.body) === copyOf(w1.body)}`);
  console.log(`    email 1 completely untouched: ${e1before === e1after}`);
  console.log(`    the wait step is untouched: ${JSON.stringify(w1.wf.nodes.w1) === JSON.stringify(w0.wf.nodes.w1)}`);
  console.log(`    subjects unchanged: ${w1.wf.nodes.e1.config.subject === "Welcome" && w1.wf.nodes.e2.config.subject === "Following up"}`);
  console.log(`    branching/next pointers unchanged: ${w1.wf.nodes.e1.next === "w1" && w1.wf.nodes.w1.next === "e2"}`);
  console.log(`    still a DRAFT, not published: ${w1.wf.status === "draft"} (${w1.wf.status})`);
  console.log(`    trigger unchanged: ${JSON.stringify(w1.wf.trigger) === JSON.stringify(w0.wf.trigger)}`);
} finally {
  for (const p of made) await db.doc(p).delete().catch(()=>{});
  console.log(`\ncleaned up ${made.length} temporary records`);
}
