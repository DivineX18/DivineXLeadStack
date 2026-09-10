/**
 * END-TO-END acceptance for the published-funnel runtime repair.
 *
 * Deliberately NOT a schema test. It builds a funnel through the real
 * creation path, uploads a real PDF over HTTP, publishes through the real
 * publish gate, then drives the PUBLISHED PUBLIC PAGE in a real browser:
 * clicks the CTA, fills the form, submits, and then checks that a contact
 * was created, that the follow-up actually sent (the run log says so), and
 * that the delivered asset URL returns real PDF bytes.
 *
 * A button that "looks clickable" proves nothing. This clicks it.
 *
 * BASE=https://flow-growth-scan-staging.onrender.com \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-e2e.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const DELIVER_TO = process.env.DELIVER_TO ?? "hello+funnel-qa@divinex.io";

const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { updateFunnelServerSide, FunnelValidationError } = await import("../src/lib/server/funnels-service");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
type Ctx = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;
const db = getAdminDb();
const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const SUB = "qa-e2e-sub";
const AG = "qa-e2e-ag";
const UID = "qa-e2e-user";
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA E2E" }, { merge: true });
await db.doc(`subAccounts/${SUB}`).set(
  { id: SUB, agencyId: AG, name: "QA E2E", accountNumber: 9001, status: "active", funnelsEnabledByAgency: true },
  { merge: true },
);
try { await getAdminAuth().createUser({ uid: UID, email: "qa-e2e@test.local" }); } catch { /* exists */ }
// Custom claims are what the auth helpers read; without an active status the
// live routes correctly answer 403 "Account inactive".
await getAdminAuth().setCustomUserClaims(UID, { role: "admin", status: "active", agencyId: AG, agencyRole: null });
await db.doc(`users/${UID}`).set(
  { uid: UID, email: "qa-e2e@test.local", displayName: "QA E2E", role: "admin", status: "active", primaryAgencyId: AG },
  { merge: true },
);
await db.doc(`subAccounts/${SUB}/subAccountMembers/${UID}`).set(
  { uid: UID, subAccountId: SUB, agencyId: AG, role: "subAccountAdmin", status: "active", email: "qa-e2e@test.local", assignedTerritoryIds: ["global"] },
  { merge: true },
);
await db.doc(`userMemberships/${UID}/subAccounts/${SUB}`).set({ subAccountId: SUB, agencyId: AG, role: "subAccountAdmin", name: "QA E2E" }, { merge: true });
const ctx = { uid: UID, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as Ctx;

// ── 1. Build through the real creation path ────────────────────────────────
console.log("\n── 1. build (real create_funnel, real model) ──");
const brief =
  "Build a funnel for Northwind Sleep Coaching offering a free PDF guide, 'The First 30 Nights', for new parents who are not sleeping. Traffic is Instagram. Real facts: the guide is 18 pages and covers a night-by-night routine for the first month. No testimonials to publish.";
const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. Call create_funnel with COMPLETE arguments. Never fabricate testimonials, statistics, guarantees, scarcity or credentials.";
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5",
    messages: [{ role: "system", content: system }, { role: "user", content: brief }],
    tools: [{ type: "function", function: { name: cap.name, description: cap.description, parameters: cap.parameters } }],
    tool_choice: { type: "function", function: { name: cap.name } },
    max_tokens: 8000,
  }),
  signal: AbortSignal.timeout(240_000),
});
const j = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
const v = cap.validate!(JSON.parse(j.choices![0]!.message!.tool_calls![0]!.function!.arguments!));
if (!v.ok) { console.log("validate failed", JSON.stringify(v).slice(0, 300)); process.exit(1); }
const built = await cap.execute!(ctx, v.args);
const funnelId = built.ref!.id;
const fDoc = () => db.doc(`funnels/${funnelId}`).get().then((s) => s.data() as Record<string, unknown>);
let f = await fDoc();
const formId = [...new Set((f.sections as { config: { formId?: string } }[]).map((s) => s.config.formId).filter(Boolean))][0] as string;
check("a capture form was wired to the page", !!formId, formId);
const wfSnap = await db.collection("workflows").where("subAccountId", "==", SUB).where("trigger.formId", "==", formId).get();
const workflowId = wfSnap.docs[0]?.id;
check("a follow-up workflow was built for that form", !!workflowId, `${workflowId} status=${wfSnap.docs[0]?.data().status}`);

// ── 2. Real PDF upload over HTTP ───────────────────────────────────────────
console.log("\n── 2. upload a real PDF through the live route ──");
const ct = await getAdminAuth().createCustomToken(UID);
const si = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await si.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const pdfBytes = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);
const fd = new FormData();
fd.append("file", new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), "the-first-30-nights.pdf");
const up = await fetch(`${BASE}/api/sub-accounts/${SUB}/funnels/${funnelId}/assets`, { method: "POST", headers: { cookie }, body: fd });
const upText = await up.text();
check("the upload returns JSON, not an error page", up.status === 200 && upText.trimStart().startsWith("{"), `${up.status} ${up.headers.get("content-type")} ${upText.slice(0, 120)}`);
const upJson = JSON.parse(upText) as { url: string };
f = await fDoc();
check("the funnel now carries the lead-magnet asset", !!f.leadMagnetAsset, JSON.stringify(f.leadMagnetAsset));
const assetRes = await fetch(`${BASE}${upJson.url}`);
const assetBuf = Buffer.from(await assetRes.arrayBuffer());
check("the delivered asset URL serves real PDF bytes", assetRes.status === 200 && assetBuf.subarray(0, 5).toString() === "%PDF-", `${assetRes.status} ${assetRes.headers.get("content-type")} ${assetBuf.length}B head=${JSON.stringify(assetBuf.subarray(0, 8).toString("latin1"))}`);

const wfAfter = (await db.doc(`workflows/${workflowId}`).get()).data() as { nodes: Record<string, { type?: string; config?: { body?: string } }> };
const emailBodies = Object.values(wfAfter.nodes).filter((n) => n.type === "send_email").map((n) => n.config?.body ?? "");
check("the download link was wired into the follow-up email", emailBodies.some((b) => b.includes(upJson.url)), emailBodies[0]?.slice(-90));

// ── 3. The publish gate ────────────────────────────────────────────────────
console.log("\n── 3. the publish gate ──");
const blocked = await updateFunnelServerSide({ subAccountId: SUB, funnelId, patch: { status: "published" } })
  .then(() => "PUBLISHED")
  .catch((e) => (e instanceof FunnelValidationError ? `REFUSED: ${e.message}` : `ERROR: ${(e as Error).message}`));
check("publishing is refused while the follow-up is still draft", blocked.startsWith("REFUSED"), blocked.slice(0, 160));

await db.doc(`workflows/${workflowId}`).update({ status: "active" });
const published = await updateFunnelServerSide({ subAccountId: SUB, funnelId, patch: { status: "published" } })
  .then(() => "PUBLISHED")
  .catch((e) => `REFUSED: ${(e as Error).message}`);
check("publishing succeeds once the follow-up is switched on", published === "PUBLISHED", published.slice(0, 200));

// ── 4. Drive the PUBLISHED PUBLIC PAGE in a real browser ───────────────────
console.log("\n── 4. the published public page, clicked for real ──");
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();
const testEmail = DELIVER_TO;
const stamp = Date.now();

for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.goto(`${BASE}/lp/${funnelId}`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1200);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check(`${device}: the page does not scroll sideways`, !overflow);

  // Every visible button/link must have a real action. This is the check that
  // would have caught "Schedule Now": an inert <button> with no handler.
  const inert = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("button, a"))) {
      const text = (el.textContent ?? "").trim();
      if (!text || (el as HTMLElement).offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 24) continue; // not a primary CTA
      if (el.tagName === "A") {
        const href = el.getAttribute("href") ?? "";
        if (!href || href === "#") out.push(`A:${text.slice(0, 40)}`);
      } else if (el.getAttribute("type") === "submit") {
        continue; // inside a form
      } else if (!(el as HTMLElement).onclick && !(el as { __reactProps$?: unknown }).__reactProps$) {
        // React attaches handlers via its own props key; absence of both is
        // the inert-button signature.
        const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
        const props = key ? (el as unknown as Record<string, { onClick?: unknown }>)[key] : null;
        if (!props?.onClick) out.push(`BUTTON:${text.slice(0, 40)}`);
      }
    }
    return out;
  });
  check(`${device}: no button renders without an action`, inert.length === 0, inert.join(" | "));

  const cta = page.locator("button", { hasText: /get|download|send|guide|start|yes/i }).first();
  const ctaCount = await cta.count();
  check(`${device}: a primary CTA is present`, ctaCount > 0);
  if (ctaCount > 0) {
    await cta.click({ timeout: 15_000 });
    await page.waitForTimeout(900);
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const opened = (await emailInput.count()) > 0 && (await emailInput.isVisible());
    check(`${device}: clicking the CTA actually opens the capture form`, opened);

    if (opened && device === "desktop") {
      // Fill EVERY visible field in the form. The rendered inputs carry no
      // `name` attribute, so selecting by name silently matches nothing and
      // leaves a required field blank; the form then correctly refuses to
      // submit and the test looks like a product failure when it is a
      // harness one. Filling by position is what a person actually does.
      const inputs = page.locator("form input:visible, form textarea:visible");
      for (let i = 0; i < (await inputs.count()); i++) {
        const el = inputs.nth(i);
        const type = (await el.getAttribute("type")) ?? (await el.evaluate((n) => n.tagName.toLowerCase()));
        await el.fill(
          type === "email" ? testEmail
            : type === "tel" ? "+15551230000"
            : type === "textarea" ? "Automated end-to-end check."
            : "Funnel QA",
        );
      }
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForTimeout(6000);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      check("desktop: the page confirms the submission to the visitor", /you'?re in|thank|check your|on the way|success/i.test(body), body.slice(0, 160));
    }
  }
  await page.close();
}
await browser.close();

// ── 5. Did it actually deliver? ────────────────────────────────────────────
console.log("\n── 5. what actually happened server side ──");
await new Promise((r) => setTimeout(r, 12_000));

const subs = await db.collection(`forms/${formId}/submissions`).get();
check("the submission was recorded", subs.size > 0, `${subs.size} submission(s)`);
const contacts = await db.collection("contacts").where("subAccountId", "==", SUB).where("email", "==", testEmail).get();
check("a contact was created from the submission", contacts.size > 0, `${contacts.size} contact(s) for ${testEmail}`);

const runs = await db.collection("workflowRuns").where("subAccountId", "==", SUB).get();
check("the follow-up workflow actually ran", runs.size > 0, `${runs.size} run(s)`);
let sentOk = false;
let sendLog = "(no send_email step reached)";
runs.forEach((d) => {
  const r = d.data() as { history?: { nodeId?: string; type?: string; result?: string }[]; status?: string };
  for (const h of r.history ?? []) {
    if (h.type !== "send_email") continue;
    sendLog = `${h.nodeId}:${h.result}`;
    // execSendEmail records "ok" only after sendEmail() returns without
    // throwing, i.e. after the provider accepted the message.
    if (h.result === "ok") sentOk = true;
  }
});
check("the confirmation email was accepted by the email provider", sentOk, sendLog);
console.log(`\n   delivered to: ${testEmail}`);
console.log(`   published page: ${BASE}/lp/${funnelId}`);
console.log(`   asset: ${BASE}${upJson.url}`);
console.log(`   (stamp ${stamp})`);

console.log(`\n${failures === 0 ? "FUNNEL E2E: ALL CHECKS PASSED" : `FUNNEL E2E: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
