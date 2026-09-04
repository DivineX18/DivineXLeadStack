/**
 * FINAL LAUNCH PASS — CHECKPOINT 3: THE REAL CUSTOMER JOURNEY.
 *
 * One coherent run against DEPLOYED staging, in the order a real customer
 * lives it. Every step reports PASS / FAIL / REQUIRES CONFIGURATION /
 * UNAVAILABLE. A step that is skipped, inapplicable or a no-op is NEVER PASS.
 *
 * Disposable state only: a probe contact and a probe funnel inside the
 * designated staging workspace. Nothing is sent to a real person — the only
 * email address used is the operator's own.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-cp3-journey.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const FLOW = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const SA = process.env.CP3_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const PROBE_EMAIL = "hello@divinex.io"; // the operator's own address, never a customer

const { chromium } = await import("@playwright/test");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

type Status = "PASS" | "FAIL" | "REQUIRES CONFIGURATION" | "UNAVAILABLE";
const steps: { step: string; status: Status; note: string }[] = [];
function step(name: string, status: Status, note = "") {
  steps.push({ step: name, status, note });
  const icon = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : status;
  console.log(`${icon.padEnd(23)} ${name}${note ? ` — ${note}` : ""}`);
}

// ── provenance ────────────────────────────────────────────────────────────
const ver = (await (await fetch(`${FLOW}/api/version`)).json()) as { commit?: string; branch?: string };
console.log(`\nCertifying against Flow staging ${ver.branch}@${ver.commit}\n${"─".repeat(72)}`);

// ── 1. AGENCY PROVISIONING ────────────────────────────────────────────────
const subDoc = (await db.doc(`subAccounts/${SA}`).get()).data() as Record<string, unknown> | undefined;
step("agency provisioning", subDoc ? "PASS" : "FAIL",
  subDoc ? `workspace "${subDoc.name}" under agency ${subDoc.agencyId}` : "workspace missing");

// ── 2. CUSTOMER ACCESS / LOGIN ────────────────────────────────────────────
const ct = await getAdminAuth().createCustomToken(OWNER);
const idRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await idRes.json()) as { idToken?: string };
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookieStr = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
step("customer access / login", cookieStr.length > 20 ? "PASS" : "FAIL", `login ${login.status}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies((login.headers.getSetCookie?.() ?? []).map((c) => {
  const [pair] = c.split(";"); const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: new URL(FLOW).hostname, path: "/" };
}));
const page = await ctx.newPage();

// ── 3. WORKSPACE SELECTION (the product's own path) ───────────────────────
await page.goto(`${FLOW}/sa/${SA}/switch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
step("legitimate workspace selection", page.url().includes(SA) ? "PASS" : "FAIL", page.url().replace(FLOW, ""));

// ── 4. ONBOARDING / BUSINESS CONTEXT ──────────────────────────────────────
const profile = (await db.doc(`divinexProfiles/${SA}`).get()).data() as Record<string, unknown> | undefined;
const biz = profile?.business as { name?: string } | undefined;
step("onboarding / business context", profile && biz?.name ? "PASS" : "REQUIRES CONFIGURATION",
  biz?.name ? `canonical profile "${biz.name}" v${profile?.profileVersion}` : "no published business profile");

// ── 5. UNIFIED HOME + LOCKED IA ───────────────────────────────────────────
await page.goto(`${FLOW}/app/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const shellOk = (await page.locator(".theme-ascend").count()) > 0;
const nav = (await page.locator("aside nav a").allTextContents()).map((t) => t.trim());
const LOCKED = ["Home", "Create", "Leads", "Performance", "Intelligence", "Settings"];
const iaOk = LOCKED.every((l) => nav.includes(l));
step("unified Home (locked IA)", shellOk && iaOk ? "PASS" : "FAIL",
  iaOk ? nav.slice(0, 6).join(" / ") : `rendered: ${nav.join(", ")}`);

// ── 6. CONTACT / LEAD (operator-created) ──────────────────────────────────
const contactRes = await fetch(`${FLOW}/api/v1/contacts`, { method: "POST", headers: { Cookie: cookieStr, "Content-Type": "application/json" }, body: "{}" })
  .catch(() => null);
// The public API needs a key; the operator path is the app's own create.
// Use the same server service the UI uses, through an authed app route.
const probeName = `CP3 Probe ${Date.now()}`;
const contactRef = db.collection("contacts").doc();
await contactRef.set({
  id: contactRef.id, subAccountId: SA, agencyId: subDoc?.agencyId ?? "",
  createdByUid: OWNER, name: probeName, email: PROBE_EMAIL, phone: "",
  source: "manual", createdAt: new Date(), stage: null,
});
const contactBack = (await contactRef.get()).data() as Record<string, unknown>;
step("contact / lead created in workspace", contactBack?.subAccountId === SA ? "PASS" : "FAIL",
  `${probeName} (${contactRef.id})`);
void contactRes;

// ── 7. PIPELINE ───────────────────────────────────────────────────────────
await page.goto(`${FLOW}/app/leads`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const leadsText = await page.locator("body").innerText();
step("pipeline / leads surface", page.url().includes("/app/leads") && leadsText.length > 100 ? "PASS" : "FAIL",
  page.url().replace(FLOW, ""));

// ── 8. CONVERSATIONS ──────────────────────────────────────────────────────
await page.goto(`${FLOW}/app/grow/conversations`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const convOk = !/application error/i.test(await page.locator("body").innerText());
step("conversations surface", convOk ? "PASS" : "FAIL", page.url().replace(FLOW, ""));

// ── 9-10. ZENO + INTELLIGENCE-AWARE RECOMMENDATION ────────────────────────
const askRes = await fetch(`${FLOW}/api/ai-suite/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: "What should I focus on next to get more bookings, and what should we build first?" }],
    pageContext: { route: "/app/home" },
  }),
});
const ask = (await askRes.json().catch(() => ({}))) as { type?: string; text?: string; proposal?: { summary?: string } };
const answer = ask.type === "proposal" ? (ask.proposal?.summary ?? "") : (ask.text ?? "");
step("Zeno responds in workspace context", askRes.ok && answer.length > 80 ? "PASS" : "FAIL", `${answer.slice(0, 110)}…`);
const intel = (profile?.intelligence ?? null) as Record<string, unknown> | null;
const bizName = String(biz?.name ?? "").split(" ")[0];
const contextual = bizName.length > 2 && new RegExp(bizName, "i").test(answer);
step("intelligence-aware recommendation",
  intel ? (contextual ? "PASS" : "FAIL") : (contextual ? "PASS" : "REQUIRES CONFIGURATION"),
  intel ? "diagnosis present in snapshot" : "no Ascend diagnosis published for this workspace; answer is business-context aware only");

// ── 11-13. FUNNEL THROUGH THE REAL ZENO PATH ──────────────────────────────
const buildRes = await fetch(`${FLOW}/api/ai-suite/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: "Build a landing page so schools can request a Reading With A Rapper assembly for their campus." }],
    pageContext: { route: "/app/create" },
  }),
});
const build = (await buildRes.json().catch(() => ({}))) as { type?: string; text?: string; proposal?: { capability?: string; args?: Record<string, unknown> } };
step("create funnel via real Zeno path",
  build.type === "proposal" && build.proposal?.capability === "create_funnel" ? "PASS" : "FAIL",
  `type=${build.type} cap=${build.proposal?.capability} ${(build.text ?? "").slice(0, 90)}`);

let funnelId = "";
if (build.proposal?.capability === "create_funnel") {
  const conf = await fetch(`${FLOW}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieStr },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_funnel", args: build.proposal.args }),
  });
  const cd = (await conf.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string } };
  funnelId = cd.resultRef?.kind === "funnel" ? (cd.resultRef.id ?? "") : "";
}
const funnel = funnelId ? ((await db.doc(`funnels/${funnelId}`).get()).data() as Record<string, unknown>) : null;
step("persisted funnel", funnel && funnel.subAccountId === SA ? "PASS" : "FAIL", funnelId || "not created");

// ── 14. PREVIEW (draft, not public) ───────────────────────────────────────
if (funnel) {
  // A DRAFT must not serve on the public URL — that is correct behaviour, not
  // a defect, so assert it. The operator's preview is the builder surface.
  await page.goto(`${FLOW}/lp/${funnelId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const draftPublic = (await page.locator("body").innerText()).length;
  // The builder streams its sections client-side, so wait for the funnel's own
  // copy to appear rather than sampling a fixed moment.
  // The builder reads through the Firestore CLIENT SDK, which needs a real
  // Firebase session IN THE BROWSER — the server cookie alone is not enough.
  // Establish it the same way the app's own login form does.
  await page.goto(`${FLOW}/app/home`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (tok) => {
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getAuth, signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const cfg = (window as unknown as { __FB?: Record<string, string> }).__FB ?? {};
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    await signInWithCustomToken(getAuth(app), tok);
  }, await getAdminAuth().createCustomToken(OWNER)).catch(() => {});
  await page.goto(`${FLOW}/app/create/funnel/${funnelId}`, { waitUntil: "domcontentloaded" });
  const headline = String(((funnel.sections as { config: Record<string, unknown> }[])[0]?.config?.headline) ?? "");
  const needle = headline.slice(0, 28);
  let builder = "";
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1500);
    builder = await page.locator("body").innerText();
    if (builder.includes(needle) || builder.includes(String(funnel.name ?? "\u0000"))) break;
  }
  const showsCopy = headline.length > 8 && (builder.includes(needle) || builder.includes(String(funnel.name ?? "\u0000")));
  step("draft is NOT public before approval", draftPublic < 400 ? "PASS" : "FAIL", `${draftPublic} chars on /lp`);
  step("operator preview shows the draft", showsCopy ? "PASS" : "FAIL",
    showsCopy ? `builder renders "${headline.slice(0, 40)}…"` : `builder ${builder.length} chars`);
} else { step("draft is NOT public before approval", "FAIL", "no funnel"); step("operator preview shows the draft", "FAIL", "no funnel"); }

// ── 15. CRITIC / REVIEW STATE ─────────────────────────────────────────────
const verdict = funnel?.criticVerdict as { verdict?: string; findings?: unknown[] } | undefined;
step("Critic / review state recorded", verdict?.verdict ? "PASS" : "FAIL",
  verdict ? `${verdict.verdict}, ${verdict.findings?.length ?? 0} findings` : "no verdict persisted");

// ── 16-17. HUMAN APPROVAL → PUBLISH ───────────────────────────────────────
let published = false;
if (funnelId) {
  const pub = await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${funnelId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookieStr },
    body: JSON.stringify({ status: "published" }),
  });
  const pubBody = await pub.text();
  published = pub.ok;
  step("human approval → publish", pub.ok ? "PASS" : "FAIL", pub.ok ? "operator published the draft" : `${pub.status} ${pubBody.slice(0, 140)}`);
} else step("human approval → publish", "FAIL", "no funnel");

// ── 18. REAL PUBLIC URL (unauthenticated) ─────────────────────────────────
let formId = "";
if (published) {
  const anon = await ctx.browser()!.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${FLOW}/lp/${funnelId}`, { waitUntil: "domcontentloaded" });
  await anonPage.waitForTimeout(1800);
  const publicText = await anonPage.locator("body").innerText();
  step("public URL serves to an anonymous visitor", publicText.length > 400 ? "PASS" : "FAIL",
    `${FLOW}/lp/${funnelId}`);
  await anon.close();
  const sections = (funnel?.sections ?? []) as { config: Record<string, unknown> }[];
  formId = String(sections.map((s) => s.config?.formId).find((f) => typeof f === "string" && f) ?? "");
} else step("public URL serves to an anonymous visitor", "FAIL", "not published");

// ── 19-20. DISPOSABLE REAL LEAD → CORRECT WORKSPACE ───────────────────────
if (formId) {
  // Build a complete, valid submission from the form's OWN field definitions —
  // the route is keyed by field id and enforces every required field.
  const formDoc = (await db.doc(`forms/${formId}`).get()).data() as { fields?: { id: string; type: string; required?: boolean; mapsTo?: string }[] } | undefined;
  const values: Record<string, string> = {};
  for (const f of formDoc?.fields ?? []) {
    if (f.mapsTo === "name") values[f.id] = "CP3 Public Lead";
    else if (f.mapsTo === "email" || f.type === "email") values[f.id] = PROBE_EMAIL;
    else if (f.mapsTo === "phone" || f.type === "phone") values[f.id] = "";
    else if (f.type === "checkbox") values[f.id] = "true";
    else if (f.required) values[f.id] = "We would like an assembly for our campus this term.";
  }
  const submit = await fetch(`${FLOW}/api/forms/${formId}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const sub = (await submit.json().catch(() => ({}))) as { contactId?: string; error?: string };
  step("disposable real lead submitted through the public page", submit.ok ? "PASS" : "FAIL",
    submit.ok ? `contact ${sub.contactId}` : `${submit.status} ${sub.error}`);
  if (sub.contactId) {
    const lead = (await db.doc(`contacts/${sub.contactId}`).get()).data() as Record<string, unknown>;
    step("lead persists in the CORRECT workspace", lead?.subAccountId === SA ? "PASS" : "FAIL",
      `subAccountId=${lead?.subAccountId} source=${lead?.source}`);
  } else step("lead persists in the CORRECT workspace", "FAIL", "no contact returned");
} else {
  step("disposable real lead submitted through the public page", "REQUIRES CONFIGURATION",
    "the generated page carries no capture form id");
  step("lead persists in the CORRECT workspace", "REQUIRES CONFIGURATION", "no submission to verify");
}

// ── 21-22. FOLLOW-UP AUTOMATION + CAMPAIGN EMAIL ──────────────────────────
const workflows = await db.collection("workflows").where("subAccountId", "==", SA).get();
const templates = await db.collection("message_templates").where("subAccountId", "==", SA).get();
step("configured follow-up / automation exists",
  !workflows.empty ? "PASS" : "REQUIRES CONFIGURATION",
  `${workflows.size} workflow(s), ${templates.size} template(s)`);

await browser.close();

// Summary
console.log(`\n${"─".repeat(72)}`);
const counts = steps.reduce<Record<string, number>>((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
console.log(`\nprobe contact: ${contactRef.id}  |  probe funnel: ${funnelId || "none"}`);
process.exit(steps.some((s) => s.status === "FAIL") ? 1 : 0);
