/**
 * FUNNEL QUALITY — WHAT A VISITOR ACTUALLY GETS (§6).
 *
 * Templates are certified structurally elsewhere (distinct section sequences,
 * honest copy, no fabricated proof). This asks the customer's question instead:
 * if I pick a template, fill in the capture form and publish it, is the page a
 * stranger lands on something I would be comfortable putting my name to?
 *
 * Three representative journeys rather than all 24 templates:
 *   A. Lead generation  — landing page + capture + measurement
 *   B. Lead magnet      — opt-in with a delivery promise
 *   C. Booking / qualification — multi-step + booking destination
 *
 * Judged on the RENDERED page at two viewports, because every property that
 * matters here — tap targets, sideways scroll, contradictory promises,
 * placeholder text leaking to a visitor — is invisible in the document.
 *
 * Run: E2E_BASE=<staging> EDIT_SA=<workspace> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-funnel-quality.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const SA = process.env.EDIT_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium, devices } = await import("@playwright/test");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { createFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const { getFunnelTemplate } = await import("../src/lib/funnels/templates.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`  ${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// Text a VISITOR must never see. Distinct from the operator-facing builder,
// where "add your headline" is a legitimate prompt.
const LEAKED = /lorem ipsum|\bTODO\b|\bTBD\b|\[(?:your|insert|headline|audience|offer)[^\]]*\]|Write your headline here|placeholder/i;
const FABRICATED = /\b\d+% (?:of|more|increase)|\bguarantee\b|\brefund\b|award[- ]winning|\b\d{2,}\+? (?:clients|customers)\b/i;

const STAMP = Date.now();
const trash: string[] = [];

/** Build a real funnel from a template, wire a real form, publish it. */
async function buildJourney(templateId: string, label: string, multiStep: boolean) {
  const t = getFunnelTemplate(templateId)!;
  const formRef = db.collection("forms").doc();
  trash.push(`forms/${formRef.id}`);
  await formRef.set({
    subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
    name: `[FQ ${STAMP}] ${label}`, slug: formRef.id, enabled: true, submissionCount: 0,
    fields: [
      { id: "need", type: "text", label: "What do you need help with?", placeholder: "", required: true, options: [], mapsTo: "notes" },
      { id: "name", type: "text", label: "Your name", placeholder: "", required: true, options: [], mapsTo: "name" },
      { id: "email", type: "email", label: "Email", placeholder: "", required: true, options: [], mapsTo: "email" },
    ],
    settings: {
      pipelineStageId: null, autoTags: ["form"], thankYouMessage: "Thanks, we'll be in touch shortly.",
      redirectUrl: "", createDeal: false, dealTitleTemplate: "", dealValue: 0, dealCurrency: "USD",
      appearance: { hideTitle: false },
    },
    createdAt: new Date(), updatedAt: new Date(),
  });

  const funnelId = await createFunnelServerSide({
    subAccountId: SA, createdByUid: OWNER, name: `[FQ ${STAMP}] ${label}`,
    genre: t.genre, designPack: t.designPack,
    ...(t.depth ? { depth: t.depth } : {}), ...(t.complexity ? { complexity: t.complexity } : {}),
  });
  trash.push(`funnels/${funnelId}`);

  const doc = (await db.doc(`funnels/${funnelId}`).get()).data() as { sections: { id: string; type: string; config: Record<string, unknown> }[] };
  let sections = doc.sections.map((s) => {
    if (s.type === "hero") {
      return { ...s, config: { ...s.config, headline: t.headline, subheadline: t.subheadline, ctaLabel: t.ctaLabel, formId: formRef.id, cta: { style: "inline" } } };
    }
    if (s.type === "offer") return { ...s, config: { ...s.config, formId: formRef.id } };
    return s;
  });
  if (multiStep) {
    sections = [{
      id: "ms", type: "multi_step_form",
      config: {
        headline: t.headline, subheadline: t.subheadline, formId: formRef.id, submitLabel: t.ctaLabel,
        steps: [
          { id: "s1", title: "What do you need help with?", fieldIds: ["need"] },
          { id: "s2", title: "Where should we send it?", fieldIds: ["name", "email"] },
        ],
        completion: { mode: "message", message: "Thanks, we'll be in touch shortly." },
      },
    }, ...sections.filter((s) => s.type !== "hero")];
  }
  // Publish through the real write boundary so the completeness guard applies.
  await db.doc(`funnels/${funnelId}`).set({ sections, status: "published" }, { merge: true });
  return { funnelId, formId: formRef.id, template: t };
}

const browser = await chromium.launch();
try {
  const journeys: { label: string; templateId: string; multiStep: boolean; oneFold?: boolean }[] = [
    { label: "A lead generation", templateId: "trades-quote-request", multiStep: false },
    // The lead-magnet framework is deliberately ONE FOLD: hero captures
    // directly, because scroll between the ask and the field costs conversions
    // on an email-for-asset trade. It is a thin PAGE by design, not a thin
    // page by accident, so it gets a floor that reflects that.
    { label: "B lead magnet", templateId: "consultant-lead-magnet", multiStep: false, oneFold: true },
    { label: "C booking / qualification", templateId: "coach-strategy-call", multiStep: true },
  ];

  for (const j of journeys) {
    console.log(`\n${j.label} — template "${j.templateId}"`);
    const built = await buildJourney(j.templateId, j.label, j.multiStep);

    for (const size of [
      { name: "desktop", opts: { viewport: { width: 1440, height: 900 } } },
      { name: "phone", opts: { ...devices["iPhone 13"] } },
    ]) {
      const ctx = await browser.newContext(size.opts as never);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/lp/${built.funnelId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(2500);
      const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");

      const floor = j.oneFold ? 120 : 200;
      check(`${size.name}: the page renders real content`, text.length > floor, `${text.length} chars${j.oneFold ? " (one-fold)" : ""}`);
      check(`${size.name}: the template's promise is on the page`,
        text.includes(built.template.headline.slice(0, 25)), built.template.headline.slice(0, 40));
      check(`${size.name}: no placeholder text reaches the visitor`, !LEAKED.test(text), (text.match(LEAKED) ?? [""])[0]);
      check(`${size.name}: no fabricated proof reaches the visitor`, !FABRICATED.test(text), (text.match(FABRICATED) ?? [""])[0]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${size.name}: no sideways scroll`, overflow <= 1, `${overflow}px`);

      // One primary action, reachable. A page with no way to act is not a funnel.
      const actionable = await page.locator('button[type="submit"], form button, a[href^="http"], a[href^="/"]').count();
      check(`${size.name}: the visitor has something to do`, actionable > 0, `${actionable} controls`);

      if (size.name === "phone") {
        const small = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll("button, input, select, textarea"))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.height < 40) out.push(`${el.tagName} ${Math.round(r.height)}px`);
          }
          return out;
        });
        check("phone: every control is a real tap target", small.length === 0, small.slice(0, 4).join(", "));
      }
      await ctx.close();
    }

    // The capture path must actually work end to end.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/lp/${built.funnelId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2000);
    const email = `fq-${STAMP}-${j.templateId}@example.invalid`;
    try {
      if (j.multiStep) {
        await page.locator('input[type="text"]').first().fill("A new roof");
        await page.getByRole("button", { name: /Continue/i }).click();
        await page.waitForTimeout(600);
      }
      const texts = page.locator('input[type="text"]');
      const n = await texts.count();
      for (let i = 0; i < n; i++) await texts.nth(i).fill(i === 0 && !j.multiStep ? "A new roof" : "FQ Visitor");
      await page.locator('input[type="email"]').first().fill(email);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    } catch { /* asserted below */ }
    const contacts = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", email).get();
    contacts.docs.forEach((d) => trash.push(`contacts/${d.id}`));
    check("the capture path produces a real lead", contacts.size === 1, `contacts=${contacts.size}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const path of trash) {
    if (path.startsWith("contacts/")) {
      for (const sub of ["activities", "notes"]) {
        const s = await db.collection(`${path}/${sub}`).get();
        await Promise.all(s.docs.map((x) => x.ref.delete()));
      }
    }
    if (path.startsWith("forms/")) {
      const s = await db.collection(`${path}/submissions`).get();
      await Promise.all(s.docs.map((x) => x.ref.delete()));
    }
    if (path.startsWith("funnels/")) {
      const id = path.split("/")[1];
      const days = await db.collection(`funnelStats/${id}/days`).get();
      await Promise.all(days.docs.map((x) => x.ref.delete()));
      await db.doc(`funnelStats/${id}`).delete().catch(() => {});
    }
    await db.doc(path).delete().catch(() => {});
  }
}

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
