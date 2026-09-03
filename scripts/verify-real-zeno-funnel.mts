/**
 * FINAL LAUNCH PASS — CHECKPOINT 1 D/F.
 *
 * D. REAL ZENO BASELINE. Exercises the ACTUAL production path:
 *      POST /api/ai-suite/chat  (a real session cookie, a real model)
 *      → a real proposal
 *      → POST /api/ai-suite/confirm  (re-validates, then executes for real)
 *    create_funnel is NEVER called directly. Proves the persuasion inputs
 *    (salesArgument / persuasionDepth / decisionComplexity / visualArchetype)
 *    the model supplies survive that whole round trip into the stored doc.
 *
 * F. QUALITY. Prints the final rendered composition for human judgment —
 *    "would we confidently let a paying customer run traffic to this?" is
 *    not a thing a script can certify; the script's job is to make the real
 *    artifact inspectable, not to grade it.
 *
 * Requires the production server running:
 *   pnpm build && pnpm start -p 3114
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-real-zeno-funnel.mts
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
const auth = getAdminAuth();
const db = getAdminDb();

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
check("real session cookie minted", cookie.length > 10);

const subDoc = (await db.doc(`subAccounts/${SA}`).get()).data();
if (!subDoc) throw new Error(`Probe workspace ${SA} does not exist.`);
const gateUpdates: Record<string, boolean> = {};
if (subDoc.funnelsEnabledByAgency !== true) gateUpdates.funnelsEnabledByAgency = true;
if (subDoc.aiSuiteEnabledByAgency !== true) gateUpdates.aiSuiteEnabledByAgency = true;
if (Object.keys(gateUpdates).length > 0) {
  await db.doc(`subAccounts/${SA}`).update(gateUpdates);
  console.log(`(enabled ${Object.keys(gateUpdates).join(", ")} on the probe workspace for this run)`);
}

// ── D. Ask Zeno for a funnel in plain language. No strategy pre-decided,
// no create_funnel argument constructed by this harness — Zeno must do it.
const prompt =
  "Build me a lead-gen landing page for Northgate Dental's new patient exam. " +
  "It's £59, aimed at adults who've been avoiding the dentist for years because they're worried about being judged or hit with a huge bill. " +
  "The whole point is a low-pressure, judgement-free first visit with a fixed price.";

console.log(`\nPOST /api/ai-suite/chat — "${prompt.slice(0, 70)}..."`);
const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: prompt }],
    pageContext: { route: `/sa/${SA}/funnels` },
  }),
});
const chatData = (await chatRes.json().catch(() => ({}))) as {
  type?: string; text?: string; error?: string;
  proposal?: { capability?: string; summary?: string; args?: Record<string, unknown> };
};
check("chat route responded 200", chatRes.ok, chatRes.ok ? "" : JSON.stringify(chatData).slice(0, 200));
check("Zeno returned a WRITE PROPOSAL (not a question, not a lookup answer)",
  chatData.type === "proposal" && chatData.proposal?.capability === "create_funnel",
  `type=${chatData.type} capability=${chatData.proposal?.capability} text=${(chatData.text ?? "").slice(0, 120)}`);

if (chatData.type !== "proposal" || !chatData.proposal) {
  console.log("\nCannot continue D without a real proposal from the real model.");
  process.exit(1);
}

const proposalArgs = chatData.proposal.args ?? {};
console.log(`\nProposal summary: ${chatData.proposal.summary}`);
check("the proposal carries a Sales Argument Plan", !!proposalArgs.salesArgument, JSON.stringify(proposalArgs.salesArgument)?.slice(0, 120));
check("the proposal carries a persuasion/decision-complexity signal",
  !!(proposalArgs.decisionComplexity || proposalArgs.emotionalTransformation),
  `decisionComplexity=${proposalArgs.decisionComplexity} emotionalTransformation=${proposalArgs.emotionalTransformation}`);

// ── Confirm for real — the only place a write happens.
console.log("\nPOST /api/ai-suite/confirm");
const confirmRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_funnel", args: proposalArgs }),
});
const confirmData = (await confirmRes.json().catch(() => ({}))) as {
  resultRef?: { kind?: string; id?: string };
  completion?: { outcome?: string; review?: string[] };
  resultText?: string; error?: string;
};
check("confirm executed successfully", confirmRes.ok, confirmRes.ok ? "" : JSON.stringify(confirmData).slice(0, 300));

const funnelId = confirmData.resultRef?.kind === "funnel" ? confirmData.resultRef.id : undefined;
if (!funnelId) {
  console.log("No funnel id returned — cannot inspect the artifact.");
  console.log("Full confirm response:", JSON.stringify(confirmData, null, 2));
  process.exit(1);
}
console.log(`\nCustomer-facing outcome: ${confirmData.completion?.outcome}`);
for (const r of confirmData.completion?.review ?? []) console.log(`  • ${r}`);
console.log(`\nfunnelId=${funnelId}`);

// ── Read the REAL persisted doc — outcome assertion, not process assertion.
const funnel = (await db.doc(`funnels/${funnelId}`).get()).data() as Record<string, unknown>;
check("salesArgument SURVIVED into the persisted doc", !!funnel.salesArgument);
check("persuasionDepth SURVIVED into the persisted doc", !!funnel.persuasionDepth, String(funnel.persuasionDepth));
check("decisionComplexity SURVIVED into the persisted doc", !!funnel.decisionComplexity, String(funnel.decisionComplexity));
check("a criticVerdict was recorded", !!funnel.criticVerdict, JSON.stringify(funnel.criticVerdict)?.slice(0, 150));

const sections = (funnel.sections ?? []) as { id: string; type: string; config: Record<string, unknown>; argumentRole?: string; servesBelief?: string }[];
check("every section carries an argumentRole (auditable persuasion job)",
  sections.every((s) => !!s.argumentRole), sections.map((s) => `${s.type}:${s.argumentRole ?? "MISSING"}`).join(" | "));
check("no empty-but-present sections reached the stored doc",
  sections.length > 0, `${sections.length} sections`);

const { evaluateSections, assessViability } = await import("../src/lib/funnels/section-completeness.ts");
const completeness = evaluateSections(sections as never);
check("zero empty sections in the final artifact", completeness.every((c) => c.state !== "empty"),
  completeness.filter((c) => c.state === "empty").map((c) => c.sectionType).join(", "));
const viability = assessViability(sections as never);
check("the final artifact is a viable conversion experience", viability.viable, viability.reasons.join(" "));

console.log("\n── F. FINAL RENDERED COMPOSITION (for human judgment) ──────────────");
console.log(`Genre: ${funnel.genre}  Theme: ${funnel.theme}  Accent: ${funnel.accentColor}`);
console.log(`Sales argument: ${JSON.stringify(funnel.salesArgument, null, 2)}`);
for (const s of sections) {
  console.log(`\n[${s.type}] role=${s.argumentRole ?? "-"} belief="${s.servesBelief ?? "-"}"`);
  console.log(JSON.stringify(s.config, null, 2).slice(0, 800));
}
console.log(`\nLive preview: ${BASE}/lp/${funnelId}`);
console.log(`Builder: ${BASE}/sa/${SA}/funnels/${funnelId}`);

console.log(`\n${bad === 0 ? "CHECKPOINT 1 D: PASS (inspect the printed composition above for F)" : `CHECKPOINT 1 D: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
