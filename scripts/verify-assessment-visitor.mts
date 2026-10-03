/**
 * THE ASSESSMENT, WALKED BY A STRANGER.
 *
 * Everything else about this journey is checked by reading code. This one
 * opens the published page in a browser with no session, answers the
 * questions the way a lead would, and checks that a real contact comes out
 * the other side and the completion sends them to the booking page.
 *
 * It builds the funnel through the same service call create_funnel makes,
 * so the model's choice of arguments is the only thing it does not cover.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.VISITOR_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = "U5SBAHsB0nZ7ce552H9h";

const { getAdminDb } = await import("../src/lib/firebase/admin");
const { createFunnelServerSide, updateFunnelServerSide } = await import("../src/lib/server/funnels-service");
const { createFormServerSide } = await import("../src/lib/server/forms-service");
const { assessmentFormFields, assessmentSteps } = await import("../src/lib/funnels/assessment-form");
const { chromium } = await import("/Users/boss/DivineXLeadStack/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs");

const db = getAdminDb();
let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const RUN = Date.now().toString(36).slice(-6);
const SA = `tmp-visit-${RUN}`;
await db.doc(`subAccounts/${SA}`).set({ name: `Visitor ${RUN}`, agencyId: AG, funnelsEnabledByAgency: true, createdAt: new Date(), updatedAt: new Date() });
await db.doc(`subAccounts/${SA}/subAccountMembers/${OWNER}`).set({ uid: OWNER, role: "subAccountAdmin", status: "active", agencyId: AG, createdAt: new Date(), updatedAt: new Date() });

const QUESTIONS = [
  { question: "How long have you been dealing with fatigue?", options: ["Under 6 months", "6 to 24 months", "Over 2 years"] },
  { question: "Which symptom affects you most?", options: ["Energy crashes", "Bloating", "Brain fog"] },
  { question: "Have you been told your labs are normal?", options: ["Yes", "No"] },
  { question: "What would make the biggest difference?", options: [] },
];

// A booking page for the assessment to finish into, made the real way.
const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
const hours = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 9 * 60, endMinute: 17 * 60 }));
const { slug: BOOK } = await createBookingPageServerSide({
  subAccountId: SA, createdByUid: OWNER,
  data: {
    name: "Root Cause Call", slug: `root-cause-call-${RUN}`, description: "A 30 minute call to go through your answers.",
    durationMinutes: 30, bufferMinutes: 0, workingHours: hours, timezone: "America/Chicago",
    visibleDays: 14, minNoticeHours: 2, maxPerDay: null, intakeFields: [], hosts: [{ uid: OWNER, name: "Clinic" }],
    status: "published", remindersEnabled: false, reminderOffsetMinutes: [],
    confirmationMessage: "", accentColor: "#5B5BD6",
  },
});
await getAdminDb().doc(`subAccounts/${SA}/bookingPages/${BOOK}`).update({ status: "published" }).catch(() => {});

const formId = await createFormServerSide({
  subAccountId: SA, createdByUid: OWNER, name: "Root Cause Diagnostic, capture form",
  fields: assessmentFormFields(QUESTIONS),
} as never);

const funnelId = await createFunnelServerSide({
  subAccountId: SA, agencyId: AG, createdByUid: OWNER,
  name: "Root Cause Health Diagnostic", genre: "lead_gen", status: "draft",
  sections: [
    { id: "hero", type: "hero", config: { headline: "Find out what is actually driving your fatigue", subheadline: "A four question diagnostic built from ten years of clinical patterns.", ctaLabel: "Start the diagnostic" } },
    { id: "assess", type: "multi_step_form", config: {
      formId, steps: assessmentSteps(QUESTIONS),
      completion: { mode: "booking", bookingSlug: BOOK },
    } },
  ],
} as never);

// createFunnelServerSide seeds the full scaffold; the publish gate rightly
// refuses the empty ones, so keep only the two this test is about.
await db.doc(`funnels/${funnelId}`).update({ sections: [
  { id: "hero", type: "hero", config: { headline: "Find out what is actually driving your fatigue", subheadline: "A four question diagnostic built from ten years of clinical patterns.", ctaLabel: "Start the diagnostic", ctaHref: "#assess" } },
  { id: "assess", type: "multi_step_form", config: { formId, steps: assessmentSteps(QUESTIONS), completion: { mode: "booking", bookingSlug: BOOK } } },
] });
await updateFunnelServerSide({ subAccountId: SA, funnelId, uid: OWNER, patch: { status: "published" } } as never);
console.log(`\nfunnel ${funnelId} published in ${SA}\n`);

console.log("1. A stranger opens the page");
const br = await chromium.launch();
const pg = await br.newPage();
await pg.goto(`${BASE}/lp/${funnelId}`, { waitUntil: "networkidle", timeout: 60000 });
const h1 = ((await pg.locator("h1").first().textContent().catch(() => "")) ?? "").trim();
console.log(`   headline: "${h1.slice(0, 70)}"`);
check("the published page renders with no session", h1.length > 0);

console.log("\n2. They are asked one thing at a time");
const EMAIL = `visitor+${RUN}@example.com`;
const screens: string[] = [];
let landedOnBooking = false;
for (let i = 0; i < 12; i++) {
  const url = pg.url();
  if (url.includes(`/b/${SA}/`)) { landedOnBooking = true; break; }
  const visible = await pg.locator("input:visible, select:visible, textarea:visible").count();
  const label = ((await pg.locator("label:visible, h2:visible, h3:visible").first().textContent().catch(() => "")) ?? "").trim();
  if (label) screens.push(label.slice(0, 55));
  // One screen should never hold the whole questionnaire.
  if (visible > 2) check(`screen ${i + 1} does not dump every question at once`, false, `${visible} inputs`);

  const nameI = pg.locator('input[name="name"], input[placeholder*="Jane"]').first();
  if ((await nameI.count()) && (await nameI.isVisible().catch(() => false))) {
    await nameI.fill("Dana Visitor");
    const em = pg.locator('input[type="email"]:visible').first();
    if (await em.count()) await em.fill(EMAIL);
  }
  const sel = pg.locator("select:visible").first();
  if (await sel.count()) {
    const v = await sel.locator("option").nth(1).getAttribute("value").catch(() => null);
    if (v) await sel.selectOption(v);
  }
  const txt = pg.locator('input[type="text"]:visible, textarea:visible').first();
  if ((await txt.count()) && !(await txt.inputValue().catch(() => "x"))) await txt.fill("Energy crashes every afternoon");

  const next = pg.locator("button:visible").filter({ hasNotText: /back/i }).last();
  if (!(await next.count())) break;
  await next.click().catch(() => {});
  await pg.waitForTimeout(1500);
}
console.log(`   screens: ${screens.length} — ${screens.slice(0, 6).join(" / ")}`);
check("the assessment is presented one question at a time", screens.length >= 4, `${screens.length} screens`);

console.log("\n3. It ends where the customer asked it to end");
await pg.waitForTimeout(2500);
const finalUrl = pg.url();
console.log(`   ended at: ${finalUrl.replace(BASE, "")}`);
check("completion sends them into the booking diary, not a dead end",
  landedOnBooking || finalUrl.includes(`/b/${SA}/${BOOK}`), finalUrl.replace(BASE, ""));

console.log("\n4. The answers became a real CRM record");
const leads = await db.collection("contacts").where("subAccountId", "==", SA).get();
check("exactly one contact, not one per screen", leads.size === 1, `${leads.size} contacts`);
if (leads.size) {
  const c = leads.docs[0].data();
  check("their identity was captured", c.email === EMAIL, String(c.email));
}
const subs = await db.collection(`forms/${formId}/submissions`).get();
check("one submission holding every answer", subs.size === 1, `${subs.size} submissions`);
if (subs.size) {
  // Answers are keyed by field id, not by the question text, so match on the
  // ids assessmentFormFields generates rather than on the label.
  const data = subs.docs[0].data() as Record<string, unknown>;
  const vals = (data.values ?? data.data ?? data) as Record<string, unknown>;
  console.log(`   submission keys: ${Object.keys(vals).join(", ").slice(0, 160)}`);
  const ids = assessmentFormFields(QUESTIONS).filter((f) => f.mapsTo === null).map((f) => f.id);
  const answered = ids.filter((id) => {
    const v = (vals as Record<string, unknown>)[id];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
  check("every question's answer is on the submission", answered === QUESTIONS.length, `${answered}/${QUESTIONS.length} (ids ${ids.join(",")})`);
}

console.log("\n5. The completion page can hold the call CTA without a third funnel");
await updateFunnelServerSide({ subAccountId: SA, funnelId, uid: OWNER,
  patch: { bridge: { nextHref: `/b/${SA}/${BOOK}`, nextCta: "Pick a time" } } } as never);
await pg.goto(`${BASE}/lp/${funnelId}/thanks`, { waitUntil: "networkidle", timeout: 60000 });
const thanksBody = ((await pg.locator("body").innerText().catch(() => "")) ?? "");
const href = await pg.locator(`a[href="/b/${SA}/${BOOK}"]`).count();
check("bridge.nextHref renders a real link on the completion page", href > 0, `${href} links`);
check("and it carries the operator's own wording", /pick a time/i.test(thanksBody));

await br.close();
await db.recursiveDelete(db.doc(`subAccounts/${SA}`));
for (const col of ["funnels", "forms", "contacts"]) {
  const s = await db.collection(col).where("subAccountId", "==", SA).get();
  for (const d of s.docs) await db.recursiveDelete(d.ref);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
console.log("ALL PASS");
process.exit(0);
