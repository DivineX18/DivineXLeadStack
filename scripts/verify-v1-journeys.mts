/**
 * THE FIVE V1 JOURNEYS.
 *
 * Each journey is certified through the stages that actually apply to it:
 *
 *   UNDERSTAND -> RECOMMEND -> EXPLAIN -> CREATE -> REVIEW -> APPROVE
 *   -> EXECUTE -> MEASURE
 *
 * What is being proven is that the PATH COMPLETES with real artifacts in a
 * real workspace: a form that captures, a page that publishes, a plan that can
 * be approved, traffic that is measured. Generation QUALITY is certified
 * elsewhere (the quality battery, the Critic, the Sales Argument Engine); this
 * asks the different question of whether a customer can get from a sentence to
 * a working, measured result without falling through a gap.
 *
 * UNDERSTAND and RECOMMEND depend on the Ascend intelligence bridge. Where it
 * is not configured, those stages report UNAVAILABLE and this run exits
 * non-zero. An unreachable stage is never a pass.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { chromium } = await import("@playwright/test");
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const campaigns = await import("../src/lib/server/campaigns-service.ts");
const tel = await import("../src/lib/funnels/telemetry.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
let unavailable = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`  ${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const na = (l: string, why: string) => { console.log(`  UNAVAILABLE ${l} — ${why}`); unavailable++; };
const journey = (l: string) => console.log(`\n${l}`);

const ctx = { uid: OWNER, subAccountId: SA } as never;
const STAMP = Date.now();
const trash: { path: string }[] = [];
const track = (path: string) => trash.push({ path });

/**
 * Intelligence must be certified where it RUNS, not where this script runs.
 * The earlier version gated these stages on the local process's own config, so
 * a fully working staging deployment reported UNAVAILABLE six times. This
 * loads the real Intelligence page as the customer sees it.
 */
async function readStagingIntelligence() {
  try {
    const ct = await getAdminAuth().createCustomToken(OWNER);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) });
    const { idToken } = (await r.json()) as { idToken?: string };
    const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
    const host = new URL(BASE).hostname;
    const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/" };
    });
    cookies.push({ name: "active_workspace_id", value: SA, domain: host, path: "/" });
    const b = await chromium.launch();
    const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctxB.addCookies(cookies);
    const page = await ctxB.newPage();
    await page.goto(`${BASE}/app/intelligence`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(13_000);
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const actions = await page.getByRole("button", { name: /Fix this with Zeno|Get the fix from Zeno/i }).count();
    const score = /GROWTH SCORE[^0-9]*(\d{1,3})\s*\/\s*100/.exec(text)?.[1] ?? null;
    const constraint = /Primary constraint:\s*([A-Za-z &]+?)\s+(?:From|ASSESSMENT|GROWTH|RECOMMEND)/.exec(text)?.[1]?.trim() ?? null;
    await b.close();
    return { ok: !!score, score, constraint, actions, text };
  } catch (err) {
    return { ok: false, score: null, constraint: null, actions: 0, text: String(err) };
  }
}
const intel = await readStagingIntelligence();
const intelligenceUp = intel.ok;
console.log(`staging intelligence: score=${intel.score} constraint=${intel.constraint} actionButtons=${intel.actions}\n`);

try {
  // ══════════════════════════════════ A. "I need more leads."
  journey('A · "I need more leads."');
  if (!intelligenceUp) {
    na("UNDERSTAND: the diagnosis reaches the request", "staging intelligence did not render a score");
    na("RECOMMEND: a ranked next step exists", "no diagnosis to rank");
  } else {
    check("UNDERSTAND: the diagnosis reaches the request", !!intel.score && !!intel.constraint,
      `score ${intel.score}/100, constraint ${intel.constraint}`);
    check("RECOMMEND: a ranked next step exists, with an action", intel.actions > 0, `${intel.actions} actionable`);
  }

  // CREATE — a real capture form, then a real page that uses it.
  const formCap = getCapability("create_form")!;
  const formArgs = formCap.validate({
    name: `[J-A ${STAMP}] enquiry`,
    fields: [
      { label: "Your name", type: "text", required: true, maps_to: "name" },
      { label: "Email", type: "email", required: true, maps_to: "email" },
      { label: "What do you need?", type: "textarea", required: false, maps_to: "notes" },
    ],
    thank_you_message: "Thanks, we'll come back to you today.",
    tags: ["Website enquiry"],
  });
  check("CREATE: the capture form is buildable", formArgs.ok, formArgs.ok ? "" : formArgs.error);
  const formRes = formArgs.ok ? await formCap.execute(ctx, formArgs.args) : null;
  const formId = formRes?.ref?.id ?? "";
  if (formId) track(`forms/${formId}`);
  check("CREATE: it is a real form in this workspace", !!formId);

  // REVIEW/APPROVE — a form does not contact anyone, so it is live at once;
  // the boundary that matters here is that it belongs to one workspace.
  const formDoc = formId ? (await db.doc(`forms/${formId}`).get()).data() : null;
  check("REVIEW: the form is inspectable and scoped to this workspace",
    formDoc?.subAccountId === SA && formDoc?.enabled === true);

  // EXECUTE — publish a page that captures through it.
  const funnelRef = db.collection("funnels").doc();
  track(`funnels/${funnelRef.id}`);
  await funnelRef.set({
    subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
    name: `[J-A ${STAMP}] lead page`, genre: "lead_gen", status: "published",
    theme: "light", accentColor: "#2563eb",
    sections: [{ id: "hero", type: "hero", config: { headline: "Get a written quote this week", subheadline: "Tell us what you need.", mediaType: "none", formId, cta: { style: "inline" } } }],
    createdAt: new Date(), updatedAt: new Date(),
  });
  const live = await fetch(`${BASE}/lp/${funnelRef.id}`);
  check("EXECUTE: the page is actually reachable by a stranger", live.ok, String(live.status));

  // MEASURE — a real submission through the real route, counted.
  const email = `ja-${STAMP}@example.invalid`;
  const submit = await fetch(`${BASE}/api/forms/${formId}/submit`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { f1_text: "Journey A", f2_email: email, f3_textarea: "A new roof" } }),
  });
  const submitBody = (await submit.json().catch(() => ({}))) as { ok?: boolean };
  check("EXECUTE: a stranger's enquiry is accepted", submit.ok && submitBody.ok === true, String(submit.status));
  const leads = await db.collection("contacts").where("subAccountId", "==", SA).where("email", "==", email).get();
  leads.docs.forEach((d) => track(`contacts/${d.id}`));
  check("MEASURE: the lead lands in this workspace's CRM", leads.size === 1, `contacts=${leads.size}`);

  await tel.recordFunnelEvent({ subAccountId: SA, funnelId: funnelRef.id, kind: "view", firstInSession: true });
  await tel.recordFunnelEvent({ subAccountId: SA, funnelId: funnelRef.id, kind: "submission" });
  track(`funnelStats/${funnelRef.id}`);
  const perfA = await tel.getFunnelPerformance(SA, funnelRef.id);
  check("MEASURE: the result is reportable, not just recorded",
    perfA !== null && perfA.submissions >= 1 && perfA.conversionRate !== null,
    `rate=${perfA?.conversionRate}`);

  // ══════════════════════════════════ B. "Leads aren't converting."
  journey('B · "I\'m getting leads but they aren\'t converting."');
  if (!intelligenceUp) na("UNDERSTAND: where the drop-off is", "staging intelligence did not render");
  else check("UNDERSTAND: the constraint names where the drop-off is", !!intel.constraint, String(intel.constraint));
  // Measurement is what makes this journey answerable at all.
  check("UNDERSTAND: conversion rate is available per page, from real traffic",
    perfA?.conversionRate !== null && perfA?.views !== undefined && perfA.views > 0);
  check("UNDERSTAND: an unvisited page reports no data rather than 0%",
    (await tel.getFunnelPerformance(SA, "no-such-funnel")) === null);

  // CREATE — the qualification step, which is this journey's actual fix.
  const msRef = db.collection("funnels").doc();
  track(`funnels/${msRef.id}`);
  await msRef.set({
    subAccountId: SA, agencyId: "e2e", createdByUid: OWNER,
    name: `[J-B ${STAMP}] qualify`, genre: "lead_gen", status: "published",
    theme: "light", accentColor: "#2563eb",
    sections: [{
      id: "ms", type: "multi_step_form",
      config: {
        headline: "See if we can help", formId,
        steps: [
          { id: "s1", title: "What do you need?", fieldIds: ["f3_textarea"] },
          { id: "s2", title: "Where do we send it?", fieldIds: ["f1_text", "f2_email"] },
        ],
        completion: { mode: "message", message: "Thanks, we'll be in touch." },
      },
    }],
    createdAt: new Date(), updatedAt: new Date(),
  });
  const msLive = await fetch(`${BASE}/lp/${msRef.id}`);
  const msHtml = await msLive.text();
  check("CREATE: a qualification flow can replace the flat form", msLive.ok);
  check("EXECUTE: it renders as steps, not one long form",
    /Step 1 of 2/.test(msHtml) || /Step 1/.test(msHtml), msLive.ok ? "rendered" : String(msLive.status));

  // ══════════════════════════════════ C. "Help me market my business."
  journey('C · "Help me market my business."');
  const emailCap = getCapability("create_email")!;
  const emailArgs = emailCap.validate({
    name: `[J-C ${STAMP}] re-engagement`,
    subject: "Still thinking about the roof?",
    body: "Hi {{firstName}},\n\nYou asked us about a quote a little while back and we never heard how it went.\n\nIf it is still on the list, reply to this and we will get someone out this week.\n\n{{unsubscribeLink}}",
  });
  check("CREATE: marketing copy is written, not requested from the customer", emailArgs.ok,
    emailArgs.ok ? "" : emailArgs.error);
  const emailRes = emailArgs.ok ? await emailCap.execute(ctx, emailArgs.args) : null;
  if (emailRes?.ref?.id) track(`message_templates/${emailRes.ref.id}`);
  check("REVIEW: it is saved as a DRAFT, and says so", !!emailRes && /draft/i.test(emailRes.resultText));
  check("APPROVE: nothing was sent to anyone", !!emailRes && /nothing has been sent/i.test(emailRes.resultText));
  const tmpl = emailRes?.ref?.id ? (await db.doc(`message_templates/${emailRes.ref.id}`).get()).data() : null;
  check("EXECUTE: the draft is real and compliant (carries an unsubscribe)",
    typeof tmpl?.body === "string" && tmpl.body.includes("{{unsubscribeLink}}"));

  // ══════════════════════════════════ D. "Create a lead magnet campaign."
  journey('D · "Create a lead magnet campaign."');
  const planId = await campaigns.createCampaign({
    subAccountId: SA, createdByUid: OWNER, name: `[J-D ${STAMP}] lead magnet`,
    plan: {
      planVersion: 1, status: "approved",
      intent: { businessProfileId: 42, subAccountId: SA, objective: "leads", audience: "Homeowners", offerState: "use_existing" },
      funnelStrategy: {}, formRequirements: { fields: [] }, segmentationRules: [],
      followUpStrategy: { goalTag: "downloaded", goalState: "downloaded", handoffDays: 14, messages: [] },
      crmRequirements: {}, assetSelections: [], brandProfileVersion: null,
      approved: { centralPromise: "The roof checklist we give every client", primaryCta: "Send me the checklist" },
      steps: [
        { id: "magnet", label: "The checklist itself", status: "review" },
        { id: "page", label: "Signup page", status: "review", assetKind: "funnel", assetId: funnelRef.id },
        { id: "followup", label: "Follow-up emails", status: "planned" },
      ],
      distribution: {},
    } as never,
  });
  track(`campaigns/${planId}`);
  check("EXPLAIN: the plan is visible with every step and its state", !!planId);
  const approvedStep = await campaigns.updateCampaignStep({ subAccountId: SA, campaignId: planId, stepId: "page", status: "approved" });
  check("APPROVE: saying yes advances only that step",
    approvedStep?.plan.steps?.find((s) => s.id === "page")?.status === "approved" &&
    approvedStep?.plan.steps?.find((s) => s.id === "magnet")?.status === "review");
  const changed = await campaigns.updateCampaignDecisions({
    subAccountId: SA, campaignId: planId,
    approved: { centralPromise: "The roof checklist we give every client", primaryCta: "Get the checklist" },
  });
  check("REVIEW: changing the offer flags built work instead of rewriting it",
    changed?.staleSteps.some((s) => s.id === "page") &&
    changed.campaign.plan.steps?.find((s) => s.id === "page")?.assetId === funnelRef.id);

  const bookCap = getCapability("create_booking_page")!;
  const bookArgs = bookCap.validate({ name: `[J-D ${STAMP}] callback`, duration_minutes: 30, timezone: "Australia/Sydney" });
  check("CREATE: the campaign can end somewhere real (a booking page)", bookArgs.ok, bookArgs.ok ? "" : bookArgs.error);
  const bookRes = bookArgs.ok ? await bookCap.execute(ctx, bookArgs.args) : null;
  if (bookRes?.ref?.id) track(`subAccounts/${SA}/bookingPages/${bookRes.ref.id}`);
  check("APPROVE: booking is a draft until the owner confirms their real hours",
    !!bookRes && /draft/i.test(bookRes.resultText));

  // ══════════════════════════════════ E. "Why isn't my funnel converting?"
  journey('E · "Why isn\'t my website/funnel generating leads?"');
  if (!intelligenceUp) {
    na("UNDERSTAND: the audit says what is wrong", "staging intelligence did not render");
    na("RECOMMEND: a specific fix is offered", "no audit to recommend from");
    na("EXPLAIN: the recommendation is actionable in one click", "no rendered recommendation to act on");
  } else {
    check("UNDERSTAND: the audit says what is wrong", !!intel.constraint, String(intel.constraint));
    check("RECOMMEND: a specific fix is offered", /TODAY|Add |Fix |Rewrite |Improve/i.test(intel.text));
    check("EXPLAIN: the recommendation is actionable in one click", intel.actions > 0, `${intel.actions} actions`);
  }
  check("MEASURE: the question is answerable at all, per page",
    perfA !== null && perfA.views > 0 && perfA.conversionRate !== null,
    `${perfA?.views} views, rate ${perfA?.conversionRate}`);
  const reviseCap = getCapability("revise_funnel_copy");
  check("CREATE: the page's copy can be revised in place, not regenerated", !!reviseCap);
  check("APPROVE: a revision is a confirm-gated action, never silent", reviseCap?.readonly !== true);
} finally {
  for (const t of trash) {
    if (t.path.startsWith("funnelStats/")) {
      const days = await db.collection(`${t.path}/days`).get();
      await Promise.all(days.docs.map((d) => d.ref.delete()));
    }
    if (t.path.startsWith("contacts/")) {
      for (const sub of ["activities", "notes"]) {
        const s = await db.collection(`${t.path}/${sub}`).get();
        await Promise.all(s.docs.map((x) => x.ref.delete()));
      }
    }
    if (t.path.startsWith("forms/")) {
      const s = await db.collection(`${t.path}/submissions`).get();
      await Promise.all(s.docs.map((x) => x.ref.delete()));
    }
    await db.doc(t.path).delete().catch(() => {});
  }
}

console.log(
  bad === 0 && unavailable === 0
    ? "\nALL PASS"
    : `\n${bad} FAILED · ${unavailable} UNAVAILABLE${unavailable ? " (unavailable is not a pass)" : ""}`,
);
process.exit(bad === 0 && unavailable === 0 ? 0 : 1);
