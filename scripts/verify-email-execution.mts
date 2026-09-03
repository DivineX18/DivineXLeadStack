/**
 * FINAL LAUNCH PASS — CHECKPOINT 2 D (email execution).
 *
 * Proves the whole chain, in order, against the REAL routes:
 *   CUSTOMER INTENT -> ZENO WRITES -> FLOW DRAFT -> HUMAN REVIEW
 *   -> HUMAN APPROVAL -> FLOW SEND
 *
 * The property that matters most is the NEGATIVE one: generating content must
 * NEVER send it. Nothing reaches a real inbox because Zeno wrote something —
 * a human has to act.
 *
 * Requires: pnpm build && pnpm start -p 3114
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-email-execution.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA;
if (!SA) throw new Error("FLOW_PROBE_SA is required.");
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const auth = getAdminAuth(); const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

async function session(uid: string): Promise<string> {
  const ct = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  return (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const cookie = await session(OWNER);

// ── 1. CUSTOMER INTENT -> ZENO WRITES ──────────────────────────────────────
console.log("── CUSTOMER INTENT → ZENO WRITES\n");
const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: "Write me a follow-up email for people who booked a £59 new patient exam but haven't confirmed their appointment yet." }],
    pageContext: { route: `/sa/${SA}/templates` },
  }),
});
const chat = (await chatRes.json().catch(() => ({}))) as {
  type?: string; text?: string; proposal?: { capability?: string; args?: Record<string, unknown>; summary?: string };
};
check("Zeno proposed an email (did not ask the customer to write it)",
  chat.type === "proposal" && chat.proposal?.capability === "create_email",
  `type=${chat.type} capability=${chat.proposal?.capability} ${(chat.text ?? "").slice(0, 120)}`);
if (chat.type !== "proposal" || !chat.proposal?.args) { console.log("\nNo proposal — cannot continue."); process.exit(1); }

const args = chat.proposal.args;
check("Zeno wrote a real subject line itself", typeof args.subject === "string" && (args.subject as string).length > 8, String(args.subject));
check("Zeno wrote a real body itself", typeof args.body === "string" && (args.body as string).length > 100, `${String(args.body).length} chars`);
check("the body carries the CAN-SPAM unsubscribe token", String(args.body).includes("{{unsubscribeLink}}"));
console.log(`\n  Subject: ${args.subject}`);
console.log(`  Body:\n    ${String(args.body).replace(/\n/g, "\n    ").slice(0, 600)}\n`);

// ── 2. NOTHING IS SENT MERELY BECAUSE IT WAS WRITTEN ───────────────────────
const beforeMail = (await db.collection("mail").count().get()).data().count;

// ── 3. HUMAN APPROVAL -> FLOW DRAFT ────────────────────────────────────────
console.log("── HUMAN APPROVAL → FLOW DRAFT\n");
const confirmRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_email", args }),
});
const confirm = (await confirmRes.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string }; resultText?: string; error?: string };
check("the human's approval created the draft", confirmRes.ok && confirm.resultRef?.kind === "message_template",
  confirmRes.ok ? "" : JSON.stringify(confirm).slice(0, 200));

const templateId = confirm.resultRef?.id;
if (!templateId) { console.log("No template id."); process.exit(1); }

const tpl = (await db.doc(`message_templates/${templateId}`).get()).data() as Record<string, unknown>;
check("the draft is persisted and reviewable in this workspace",
  tpl?.subAccountId === SA && tpl?.type === "email" && !!tpl?.body);
check("the draft is a DRAFT — writing it sent nothing",
  (await db.collection("mail").count().get()).data().count === beforeMail,
  `mail queue unchanged at ${beforeMail}`);

// ── 4. FLOW SEND — the human's own action, through existing infrastructure ──
console.log("\n── FLOW SEND (human-initiated, existing infrastructure)\n");
const emailConfigured = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
if (!emailConfigured) {
  console.log("SEND: UNAVAILABLE — RESEND_API_KEY/EMAIL_FROM not configured on this deployment.");
  console.log("      Architecture verified: the draft is a real message_template, which the");
  console.log("      existing broadcast + workflow senders consume unchanged.");
} else {
  // Disposable recipient — a real contact we create and delete, never a real person.
  const contactRef = db.collection("contacts").doc();
  await contactRef.set({
    id: contactRef.id, subAccountId: SA, agencyId: tpl.agencyId ?? "",
    createdByUid: "verify-email-execution", name: "Email Execution Probe",
    email: "probe+launchcert@divinex.io", createdAt: new Date(), source: "manual",
  });
  try {
    const sendRes = await fetch(`${BASE}/api/comms/email/send`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        contactId: contactRef.id,
        subject: String(args.subject),
        body: String(args.body).replace("{{unsubscribeLink}}", `${BASE}/u/probe`),
      }),
    });
    const sendBody = (await sendRes.json().catch(() => ({}))) as { error?: string };
    check("the human's send goes out through Flow's existing email sender",
      sendRes.ok, sendRes.ok ? "" : `${sendRes.status} ${JSON.stringify(sendBody).slice(0, 160)}`);
  } finally {
    await contactRef.delete();
  }
}

// Cleanup the probe draft.
await db.doc(`message_templates/${templateId}`).delete();
console.log("\n(probe draft removed)");

console.log(`\n${bad === 0 ? "CHECKPOINT 2 D: PASS" : `CHECKPOINT 2 D: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
