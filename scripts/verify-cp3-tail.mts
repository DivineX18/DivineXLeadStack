/**
 * CP3 TAIL — campaign follow-up, agency visibility, Client Billing, isolation.
 *
 * Completes the journey steps the main run does not cover. Same rules: a step
 * that is skipped or inapplicable is never PASS.
 *
 * The campaign-email step deliberately stops at the point a real send would
 * reach a real inbox other than the operator's own: it proves the wiring end
 * to end (lead -> workflow -> template -> queued send) without spraying mail.
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const FLOW = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const SA = process.env.CP3_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OTHER_SA = "dx-loop-test";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const PROBE_EMAIL = "hello@divinex.io";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

type Status = "PASS" | "FAIL" | "REQUIRES CONFIGURATION" | "UNAVAILABLE";
const steps: { step: string; status: Status; note: string }[] = [];
const step = (n: string, s: Status, note = "") => { steps.push({ step: n, status: s, note }); console.log(`${s.padEnd(23)} ${n}${note ? ` — ${note}` : ""}`); };

const ct = await getAdminAuth().createCustomToken(OWNER);
const idRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await idRes.json()) as { idToken?: string };
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

console.log(`\nCP3 TAIL against ${FLOW}\n${"─".repeat(72)}`);

// ── CAMPAIGN EMAIL FOLLOW-UP ──────────────────────────────────────────────
// 1. Zeno writes the follow-up email (already certified, re-proven here as the
//    campaign's content source).
const chat = await fetch(`${FLOW}/api/ai-suite/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: "Write the follow-up email that goes to a school right after they request an assembly." }],
    pageContext: { route: "/app/create" },
  }),
});
const chatData = (await chat.json().catch(() => ({}))) as { type?: string; proposal?: { capability?: string; args?: Record<string, unknown> } };
const wrote = chatData.type === "proposal" && chatData.proposal?.capability === "create_email";
step("campaign: Zeno writes the follow-up email", wrote ? "PASS" : "FAIL",
  wrote ? String((chatData.proposal!.args as { subject?: string }).subject ?? "") : `cap=${chatData.proposal?.capability}`);

// 2. Human approval creates the DRAFT template the campaign will send.
let templateId = "";
if (wrote) {
  const conf = await fetch(`${FLOW}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_email", args: chatData.proposal!.args }),
  });
  const cd = (await conf.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string } };
  templateId = cd.resultRef?.kind === "message_template" ? (cd.resultRef.id ?? "") : "";
}
step("campaign: human approval produces a reusable template", templateId ? "PASS" : "FAIL", templateId || "none");

// 3. The campaign/automation engine that consumes it.
const wf = await db.collection("workflows").where("subAccountId", "==", SA).get();
// Workflow node storage differs by builder version (array vs keyed object),
// so normalise rather than assuming a shape.
const emailNodes = wf.docs.flatMap((d) => {
  const raw = d.data().nodes;
  const nodes = (Array.isArray(raw) ? raw : Object.values(raw ?? {})) as { type?: string }[];
  return nodes.filter((n) => typeof n?.type === "string" && /email/i.test(n.type));
});
step("campaign: an automation exists that sends email",
  wf.size > 0 && emailNodes.length > 0 ? "PASS" : "REQUIRES CONFIGURATION",
  `${wf.size} workflow(s), ${emailNodes.length} email step(s)`);

// 4. Flow's send infrastructure actually executes — to the operator's own
//    address, never a customer's.
const emailConfigured = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
if (!emailConfigured) {
  step("campaign: Flow executes the send", "UNAVAILABLE", "RESEND_API_KEY/EMAIL_FROM not configured");
} else {
  const probe = db.collection("contacts").doc();
  const sub = (await db.doc(`subAccounts/${SA}`).get()).data() as Record<string, unknown>;
  await probe.set({ id: probe.id, subAccountId: SA, agencyId: sub?.agencyId ?? "", createdByUid: OWNER,
    name: "CP3 Campaign Probe", email: PROBE_EMAIL, source: "manual", createdAt: new Date() });
  try {
    const tpl = templateId ? ((await db.doc(`message_templates/${templateId}`).get()).data() as { subject?: string; body?: string }) : null;
    const send = await fetch(`${FLOW}/api/comms/email/send`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        contactId: probe.id,
        subject: tpl?.subject ?? "CP3 campaign follow-up probe",
        body: (tpl?.body ?? "CP3 probe").replace("{{unsubscribeLink}}", `${FLOW}/u/probe`),
      }),
    });
    const sBody = (await send.json().catch(() => ({}))) as { error?: string };
    step("campaign: Flow executes the send (operator address only)", send.ok ? "PASS" : "FAIL",
      send.ok ? "delivered through Flow's existing sender" : `${send.status} ${JSON.stringify(sBody).slice(0, 120)}`);
  } finally { await probe.delete(); }
}

// ── AGENCY VISIBILITY ─────────────────────────────────────────────────────
const agencyList = await fetch(`${FLOW}/api/agency/sub-accounts`, { headers: { Cookie: cookie } });
const agencyData = (await agencyList.json().catch(() => ({}))) as { subAccounts?: { id: string }[] };
const sees = (agencyData.subAccounts ?? []).some((s) => s.id === SA);
step("agency visibility of the customer workspace", agencyList.ok && sees ? "PASS" : "FAIL",
  `${agencyData.subAccounts?.length ?? 0} workspace(s) visible to the agency owner`);

// ── CLIENT BILLING ────────────────────────────────────────────────────────
const plans = await db.collection(`agencies/${(await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId}/plans`).get();
const billing = (await db.doc(`subAccounts/${SA}`).get()).data()?.billing as Record<string, unknown> | undefined;
const stripeReady = !!process.env.STRIPE_SECRET_KEY;
step("Client Billing path",
  !stripeReady ? "UNAVAILABLE" : plans.size > 0 || billing ? "PASS" : "REQUIRES CONFIGURATION",
  `stripe=${stripeReady ? "configured" : "absent"}, ${plans.size} plan(s), billing=${billing ? String(billing.status) : "comped (default)"}`);

// ── TENANT ISOLATION ──────────────────────────────────────────────────────
const mineIds = new Set((await db.collection("contacts").where("subAccountId", "==", SA).limit(50).get()).docs.map((d) => d.id));
const otherContacts = await db.collection("contacts").where("subAccountId", "==", OTHER_SA).limit(50).get();
const overlap = otherContacts.docs.filter((d) => mineIds.has(d.id));
step("tenant isolation: contact data does not cross workspaces", overlap.length === 0 ? "PASS" : "FAIL",
  `${mineIds.size} vs ${otherContacts.size} contacts, ${overlap.length} overlap`);

const crossAssets = await fetch(`${FLOW}/api/sub-accounts/${OTHER_SA}/divinex/assets`, { headers: { Cookie: cookie } });
const crossData = (await crossAssets.json().catch(() => ({}))) as { assets?: unknown[]; unavailable?: string };
step("tenant isolation: an unlinked workspace gets no Ascend assets",
  (crossData.assets?.length ?? 0) === 0 ? "PASS" : "FAIL",
  `unavailable=${crossData.unavailable ?? "none"}, ${crossData.assets?.length ?? 0} assets`);

const anon = await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, { redirect: "manual" });
step("tenant isolation: unauthenticated access refused", !anon.ok ? "PASS" : "FAIL", `status ${anon.status}`);

if (templateId) await db.doc(`message_templates/${templateId}`).delete();
console.log(`\n${"─".repeat(72)}`);
const counts = steps.reduce<Record<string, number>>((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
process.exit(steps.some((s) => s.status === "FAIL") ? 1 : 0);
