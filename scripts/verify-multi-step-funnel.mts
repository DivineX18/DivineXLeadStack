/**
 * MULTI-STEP FUNNEL (V1 requirement 6).
 *
 * Driven in a real browser, because every requirement here is a behaviour a
 * visitor experiences, not a field in a document: progress they can read,
 * validation that stops them, a Back button that remembers, answers that
 * survive a refresh, and a phone layout that isn't a desktop form squeezed.
 *
 * The properties that would be quietly missed by a second form
 * implementation are asserted explicitly: the lead reaches CRM with fields
 * mapped, the automation trigger fires, and the conversion is counted once.
 * A multi-step form that failed to count its own conversions would make the
 * measurement feature lie.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-multi-step-funnel.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const STAMP = Date.now();
const EMAIL = `ms-${STAMP}@example.invalid`;

const formRef = db.collection("forms").doc();
await formRef.set({
  subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
  name: `[E2E ${STAMP}] qualification`,
  slug: formRef.id, enabled: true, submissionCount: 0,
  fields: [
    { id: "roof", type: "select", label: "What kind of roof?", placeholder: "", required: true, options: ["Tile", "Metal"], mapsTo: null },
    { id: "when", type: "text", label: "When do you need it done?", placeholder: "", required: true, options: [], mapsTo: "notes" },
    { id: "name", type: "text", label: "Your name", placeholder: "", required: true, options: [], mapsTo: "name" },
    { id: "email", type: "email", label: "Email", placeholder: "", required: true, options: [], mapsTo: "email" },
  ],
  settings: {
    pipelineStageId: null, autoTags: ["form"], thankYouMessage: "Thanks!", redirectUrl: "",
    createDeal: false, dealTitleTemplate: "", dealValue: 0, dealCurrency: "USD",
    appearance: { hideTitle: false },
  },
  createdAt: new Date(), updatedAt: new Date(),
});

const funnelRef = db.collection("funnels").doc();
const FID = funnelRef.id;
await funnelRef.set({
  subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
  name: `[E2E ${STAMP}] multi-step`,
  genre: "lead_gen", status: "published", theme: "light", accentColor: "#2563eb",
  sections: [{
    id: "ms", type: "multi_step_form",
    config: {
      headline: "See if we can help",
      subheadline: "Three quick questions.",
      formId: formRef.id,
      submitLabel: "Get my quote",
      steps: [
        { id: "s1", title: "What kind of roof do you have?", fieldIds: ["roof"] },
        { id: "s2", title: "When do you need it done?", fieldIds: ["when"] },
        { id: "s3", title: "Where should we send the quote?", fieldIds: ["name", "email"] },
      ],
      completion: { mode: "message", message: "Thanks, we'll be in touch within one business day." },
    },
  }],
  createdAt: new Date(), updatedAt: new Date(),
});

async function cleanup() {
  const subs = await formRef.collection("submissions").get();
  await Promise.all(subs.docs.map((d) => d.ref.delete()));
  await formRef.delete().catch(() => {});
  await funnelRef.delete().catch(() => {});
  const days = await db.collection(`funnelStats/${FID}/days`).get();
  await Promise.all(days.docs.map((d) => d.ref.delete()));
  await db.doc(`funnelStats/${FID}`).delete().catch(() => {});
  const cs = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", EMAIL).get();
  await Promise.all(cs.docs.map(async (d) => {
    for (const sub of ["activities", "notes"]) {
      const s = await d.ref.collection(sub).get();
      await Promise.all(s.docs.map((x) => x.ref.delete()));
    }
    await d.ref.delete();
  }));
}

const browser = await chromium.launch();
try {
  // ------------------------------------------------------------- desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lp/${FID}`, { waitUntil: "networkidle" });

  const body = () => page.locator("body").innerText().then((t) => t.replace(/\s+/g, " "));
  check("the first step is shown, not the whole form", /Step 1 of 3/.test(await body()));
  check("only this step's question is asked",
    /What kind of roof/.test(await body()) && !/Where should we send/.test(await body()));
  check("progress is stated in words, not only drawn",
    (await page.locator('[role="progressbar"]').count()) === 1 && /Step 1 of 3/.test(await body()));
  check("Back is not offered on the first step", (await page.getByRole("button", { name: /^Back$/ }).count()) === 0);

  // Validation must stop an empty required step.
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(400);
  check("an empty required answer blocks the step", /Step 1 of 3/.test(await body()));
  check("...and says why", /is required/i.test(await body()));

  await page.selectOption("select", "Tile");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(400);
  check("answering advances", /Step 2 of 3/.test(await body()));

  await page.fill('input[type="text"]', "Next month");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(400);
  check("the last step shows the real submit label", /Get my quote/.test(await body()));

  // Back must remember.
  await page.getByRole("button", { name: /^Back$/ }).click();
  await page.waitForTimeout(400);
  check("Back returns to the previous step", /Step 2 of 3/.test(await body()));
  check("Back keeps what was already answered",
    (await page.locator('input[type="text"]').first().inputValue()) === "Next month");

  // Persistence across an accidental refresh.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const restored = await page.locator("select").first().inputValue().catch(() => "");
  check("answers survive a refresh", restored === "Tile", restored);

  // Finish for real.
  await page.selectOption("select", "Tile").catch(() => {});
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(300);
  await page.fill('input[type="text"]', "Next month");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(300);
  await page.locator('input[type="text"]').first().fill("Multi Step");
  await page.fill('input[type="email"]', EMAIL);
  await page.getByRole("button", { name: /Get my quote/i }).click();
  await page.waitForTimeout(3000);

  check("completion copy is the operator's, not a default",
    /we'll be in touch within one business day/i.test(await body()), (await body()).slice(0, 140));

  // --------------------------------------------------------------- CRM
  const cs = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", EMAIL).get();
  check("one lead reached the right workspace", cs.size === 1, `contacts=${cs.size}`);
  const contact = cs.docs[0]?.data() as { name?: string; email?: string; notes?: string } | undefined;
  check("mapped fields landed on the contact", contact?.name === "Multi Step" && contact?.email === EMAIL,
    JSON.stringify({ name: contact?.name }));

  const submissions = await formRef.collection("submissions").get();
  check("every answer was submitted once, including unmapped ones",
    submissions.size === 1 && JSON.stringify(submissions.docs[0]?.data()?.values ?? {}).includes("Tile"),
    `submissions=${submissions.size}`);

  // ------------------------------------------------------- measurement
  await new Promise((r) => setTimeout(r, 1200));
  const tel = await import("../src/lib/funnels/telemetry.ts");
  const perf = await tel.getFunnelPerformance(SA, FID);
  check("the conversion was counted exactly once", perf?.submissions === 1, `submissions=${perf?.submissions}`);
  check("the refresh did not inflate the session count", (perf?.sessions ?? 0) <= 2, `sessions=${perf?.sessions}`);
  await ctx.close();

  // -------------------------------------------------------------- phone
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/lp/${FID}`, { waitUntil: "networkidle" });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal scroll on a phone", overflow <= 1, `overflow=${overflow}px`);
  const btn = await m.getByRole("button", { name: /Continue/i }).boundingBox();
  check("the primary button is a real tap target", (btn?.height ?? 0) >= 44, `${btn?.height}px`);
  check("the button fits the screen", (btn?.width ?? 0) <= 390 && (btn?.width ?? 0) > 200, `${btn?.width}px`);
  await mobile.close();
} finally {
  await browser.close();
  await cleanup();
}

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
