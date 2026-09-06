/**
 * THE MEASURED LOOP, END TO END (P0.2 + P0.3).
 *
 * Not a unit test of the telemetry module — that's verify-funnel-measurement.
 * This drives a real browser against a real deployment and asserts the
 * RENDERED outcome, because the claim being certified is a customer-visible
 * one: "publish something, get traffic, and the app tells you honestly whether
 * it worked — then hands the fix back to Zeno."
 *
 *   LAUNCHED  a real published page
 *   TRAFFIC   three real browser visits (the beacon, not a seeded counter)
 *   CONVERSION a real form submission that creates a real contact
 *   RESULT    Performance reports those numbers for THAT page
 *   NEXT      a recommendation carries into Zeno as an actionable request
 *
 * Anything that cannot be exercised because a dependency is missing is
 * reported UNAVAILABLE and exits non-zero. An unavailable step is never a pass.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-measured-loop-e2e.mts
 *      E2E_BASE=http://localhost:3114  EDIT_SA=<workspace>
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
let unavailable = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const na = (l: string, why: string) => { console.log(`UNAVAILABLE ${l} — ${why}`); unavailable++; };

// ---------------------------------------------------------------- disposable
// A throwaway form + page. Never a real customer artifact, and every id
// created here is deleted at the end.
const STAMP = Date.now();
const formRef = db.collection("forms").doc();
await formRef.set({
  subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
  name: `[E2E ${STAMP}] measured loop`,
  fields: [
    { id: "name", type: "text", label: "Name", required: true, mapsTo: "name" },
    { id: "email", type: "email", label: "Email", required: true, mapsTo: "email" },
  ],
  enabled: true,
  // Real form shape — the submit route reads settings, so a fixture that
  // omits them would fail for a reason that has nothing to do with the loop.
  settings: {
    pipelineStageId: null, autoTags: ["e2e"], thankYouMessage: "Thanks!",
    redirectUrl: "", createDeal: false, dealTitleTemplate: "", dealValue: 0,
    dealCurrency: "USD",
    appearance: { hideTitle: false },
  },
  createdAt: new Date(), updatedAt: new Date(),
});

const funnelRef = db.collection("funnels").doc();
const FID = funnelRef.id;
await funnelRef.set({
  subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
  name: `[E2E ${STAMP}] measured loop page`,
  genre: "lead_magnet", status: "published", theme: "light", accentColor: "#2563eb",
  sections: [{
    id: "hero", type: "hero",
    config: {
      headline: "Book a same-week appointment",
      subheadline: "Tell us where to send the details.",
      mediaType: "none",
      formId: formRef.id,
      cta: { style: "inline" },
    },
  }],
  createdAt: new Date(), updatedAt: new Date(),
});

async function cleanup() {
  const days = await db.collection(`funnelStats/${FID}/days`).get();
  await Promise.all(days.docs.map((d) => d.ref.delete()));
  await db.doc(`funnelStats/${FID}`).delete().catch(() => {});
  await funnelRef.delete().catch(() => {});
  const subs = await formRef.collection("submissions").get();
  await Promise.all(subs.docs.map((d) => d.ref.delete()));
  await formRef.delete().catch(() => {});
  const contacts = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", `e2e-${STAMP}@example.invalid`).get();
  await Promise.all(contacts.docs.map((d) => d.ref.delete()));
}

const browser = await chromium.launch();
try {
  // ------------------------------------------------------------ 1. TRAFFIC
  // A real browser, a fresh context per visit — three distinct sessions, the
  // way three real people would arrive.
  for (const utm of ["?utm_source=facebook&utm_medium=cpc", "", ""]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/lp/${FID}${utm}`, { waitUntil: "networkidle" });
    await ctx.close();
  }

  // --------------------------------------------------------- 2. CONVERSION
  const convCtx = await browser.newContext();
  const conv = await convCtx.newPage();
  await conv.goto(`${BASE}/lp/${FID}`, { waitUntil: "networkidle" });
  const nameInput = conv.locator('input').first();
  const visible = await nameInput.isVisible().catch(() => false);
  if (!visible) {
    na("a real capture form renders on the published page", "the page rendered no input — cannot submit");
  } else {
    await conv.fill('input[type="text"]', "E2E Visitor").catch(() => {});
    await conv.fill('input[type="email"]', `e2e-${STAMP}@example.invalid`);
    await conv.locator('button[type="submit"]').first().click();
    await conv.waitForTimeout(2500);
  }
  await convCtx.close();

  // Beacons are fire-and-forget; give the writes a moment to land.
  await new Promise((r) => setTimeout(r, 1500));

  // ------------------------------------------------------------- 3. RESULT
  const tel = await import("../src/lib/funnels/telemetry.ts");
  const perf = await tel.getFunnelPerformance(SA, FID);
  check("real browser visits were measured", (perf?.views ?? 0) >= 3, `views=${perf?.views}`);
  check("visits were counted as distinct sessions", (perf?.sessions ?? 0) >= 3, `sessions=${perf?.sessions}`);
  check("the paid visit kept its source", (perf?.bySource ?? []).some((s) => s.key === "meta-ads"),
    (perf?.bySource ?? []).map((s) => s.key).join(","));

  const contactSnap = await db.collection("contacts").where("subAccountId", "==", SA)
    .where("email", "==", `e2e-${STAMP}@example.invalid`).get();
  check("the submission created a real lead in the right workspace", contactSnap.size === 1, `contacts=${contactSnap.size}`);
  check("the conversion was measured", (perf?.submissions ?? 0) >= 1, `submissions=${perf?.submissions}`);
  check("conversion rate is derived, not invented",
    perf !== null && perf.conversionRate !== null && Math.abs(perf.conversionRate - perf.submissions / perf.views) < 1e-9,
    String(perf?.conversionRate));

  // --------------------------------------------- 4. REPORTED to the customer
  // Authenticate the way the app's own login does — no test-only bypass.
  const ct = await getAdminAuth().createCustomToken(OWNER);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  const host = new URL(BASE).hostname;
  const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/" };
  });

  const app = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // The shell resolves the active workspace from this cookie, exactly as the
  // workspace switcher sets it — an owner with several memberships is
  // deliberately not guessed for.
  await app.addCookies([...cookies, { name: "active_workspace_id", value: SA, domain: host, path: "/" }]);
  const page = await app.newPage();

  await page.goto(`${BASE}/app/performance`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2500);
  const perfText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const inUnifiedShell = new URL(page.url()).pathname.startsWith("/app/");
  if (!inUnifiedShell) {
    // The unified shell only mounts for a Complete-mode workspace on the
    // Ascend host. Reporting this as a FAIL would blame the feature for the
    // environment; reporting it as a PASS would be a lie. It is UNAVAILABLE,
    // and this run still exits non-zero.
    na("Performance reports the page's own numbers",
      `this environment redirected /app/performance to ${new URL(page.url()).pathname} — run against a Complete-mode workspace`);
  } else {
    check("Performance names the live page", perfText.includes(`[E2E ${STAMP}]`), perfText.slice(0, 200));
    check("Performance shows its visitor count", /\b4\b/.test(perfText));
    check("Performance shows a real conversion rate, not a placeholder",
      /\d+\.\d%/.test(perfText), (perfText.match(/\d+\.\d%/) ?? ["none"])[0]);
    check("Performance never claims 0% for an unvisited page",
      !/No visits yet.*0\.0%/.test(perfText));
  }

  // ------------------------------------------------------- 5. NEXT (P0.3)
  await page.goto(`${BASE}/app/intelligence`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2500);
  const fixButton = page.getByRole("button", { name: /Fix this with Zeno/i }).first();
  const hasRec = await fixButton.isVisible().catch(() => false);

  if (!hasRec) {
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    na("a recommendation offers an action",
      `no recommendation rendered in this workspace — ${body.includes("Unavailable") ? "intelligence unavailable" : "none generated"}`);
    na("clicking the action opens Zeno pre-loaded", "no recommendation to click");
  } else {
    const recText = (await fixButton.locator("xpath=..").innerText()).replace(/\s+/g, " ");
    await fixButton.click();
    await page.waitForTimeout(800);
    const composer = page.locator('textarea[placeholder*="Ask a question"]').first();
    check("clicking the action opens Zeno", await composer.isVisible().catch(() => false));
    const seeded = await composer.inputValue().catch(() => "");
    check("Zeno receives the recommendation itself, not a summary",
      seeded.length > 0 && recText.slice(0, 40).split(" ").slice(0, 5).every((w) => seeded.includes(w)),
      seeded.slice(0, 120));
    check("nothing was generated or changed by opening it",
      !seeded.includes("Created") && (await page.locator("text=/Approve|Confirm/i").count()) === 0);

    // Declining = closing. The account must be exactly as it was.
    const beforeFunnels = (await db.collection("funnels").where("subAccountId", "==", SA).get()).size;
    await page.keyboard.press("Escape");
    await page.locator('button[aria-label="Close Zeno"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const afterFunnels = (await db.collection("funnels").where("subAccountId", "==", SA).get()).size;
    check("declining changes nothing", beforeFunnels === afterFunnels, `${beforeFunnels} -> ${afterFunnels}`);
  }

  await app.close();
} finally {
  await browser.close();
  await cleanup();
}

console.log(
  bad === 0 && unavailable === 0
    ? "\nALL PASS"
    : `\n${bad} FAILED · ${unavailable} UNAVAILABLE` + (unavailable ? " (unavailable is not a pass)" : ""),
);
process.exit(bad === 0 && unavailable === 0 ? 0 : 1);
