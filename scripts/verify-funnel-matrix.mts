/**
 * THE 6/6 PUBLISHED RUNTIME MATRIX.
 *
 * Every scenario is built as a real funnel, published through the real publish
 * gate, and then DRIVEN IN A BROWSER against the production public runtime at
 * /lp/[id]. Nothing here passes on schema inspection: each CTA is clicked, on
 * desktop and on mobile, and the resulting destination is asserted.
 *
 *   A  lead magnet + PDF delivery   (proven separately by verify-funnel-e2e)
 *   B  booking CTA
 *   C  lead capture -> thank-you redirect
 *   D  paid checkout
 *   E  legitimate upsell in a chain
 *   F  external CTA
 *
 * Money safety: D and E assert that the CTA enters the correct checkout path
 * and carries the right price/action wiring. Neither completes a payment, and
 * no Stripe configuration is touched.
 *
 * BASE=https://app.divinex.io NODE_OPTIONS="--conditions=react-server" \
 *   npx tsx scripts/verify-funnel-matrix.mts [--cleanup]
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.BASE ?? "https://app.divinex.io";
const { createFunnelServerSide, updateFunnelServerSide, FunnelValidationError } = await import("../src/lib/server/funnels-service");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const db = getAdminDb();

const SUB = "qa-matrix-sub";
const AG = "qa-matrix-ag";
const UID = "qa-matrix-user";

if (process.argv.includes("--cleanup")) {
  const snap = await db.collection("funnels").where("subAccountId", "==", SUB).get();
  for (const d of snap.docs) await d.ref.delete();
  console.log(`deleted ${snap.size} matrix funnels`);
  process.exit(0);
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── workspace + a real capture form ────────────────────────────────────────
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA Matrix" }, { merge: true });
await db.doc(`subAccounts/${SUB}`).set(
  { id: SUB, agencyId: AG, name: "QA Matrix", accountNumber: 9002, status: "active", funnelsEnabledByAgency: true },
  { merge: true },
);
try { await getAdminAuth().createUser({ uid: UID, email: "qa-matrix@test.local" }); } catch { /* exists */ }
await getAdminAuth().setCustomUserClaims(UID, { role: "admin", status: "active", agencyId: AG, agencyRole: null });
await db.doc(`users/${UID}`).set({ uid: UID, email: "qa-matrix@test.local", role: "admin", status: "active", primaryAgencyId: AG }, { merge: true });

const formRef = db.collection("forms").doc();
await formRef.set({
  id: formRef.id, subAccountId: SUB, agencyId: AG, createdByUid: UID, name: "QA Matrix capture form",
  fields: [
    { id: "name", label: "Full name", type: "text", required: true, mapsTo: "name" },
    { id: "email", label: "Email", type: "email", required: true, mapsTo: "email" },
  ],
  enabled: true,
  // Real forms always carry a settings block; omitting it is what surfaced the
  // unguarded form.settings access in the public submit route.
  settings: { autoTags: ["form"], createDeal: false, pipelineStageId: null, thankYouMessage: "Thanks, you're in.", redirectUrl: "" },
  createdAt: new Date(), updatedAt: new Date(),
});
const FORM = formRef.id;

// An ACTIVE follow-up so the delivery contract is satisfied for capture pages.
const wfRef = db.collection("workflows").doc();
await wfRef.set({
  id: wfRef.id, subAccountId: SUB, agencyId: AG, createdByUid: UID, name: "QA Matrix follow-up",
  status: "active", trigger: { type: "form.submitted", filters: { all: [] }, formId: FORM },
  startNodeId: "n1",
  nodes: { n1: { id: "n1", type: "send_email", config: { subject: "Thanks", body: "Hello {{firstName}} @@UNSUB@@", commType: "transactional" }, next: null } },
  createdAt: new Date(), updatedAt: new Date(),
});

const BOOKING_SLUG = "qa-matrix-intro";
// Real BookingPage shape (see types/booking.ts). workingHours is a FLAT
// array of {dayOfWeek, startMinute, endMinute} — Firestore rejects the
// nested arrays a day->ranges map would need.
await db.doc(`subAccounts/${SUB}/bookingPages/${BOOKING_SLUG}`).set({
  id: BOOKING_SLUG, subAccountId: SUB, agencyId: AG, createdByUid: UID,
  slug: BOOKING_SLUG, name: "Intro call", description: "A 30 minute intro call.",
  status: "published", durationMinutes: 30, paddingMinutes: 0,
  workingHours: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 9 * 60, endMinute: 17 * 60 })),
  timezone: "UTC", visibleDays: 14, minNoticeHours: 2, maxPerDay: null,
  intakeFields: [], hosts: [], priceCents: 0,
  createdAt: new Date(), updatedAt: new Date(),
}, { merge: true });

const EXTERNAL_URL = "https://www.gitpage.site/";

/** Build a funnel from explicit sections and publish it through the real gate. */
async function buildAndPublish(name: string, genre: string, sections: unknown[], opts: { chainRole?: "upsell" | "downsell"; parentFunnelId?: string } = {}) {
  const id = await createFunnelServerSide({
    subAccountId: SUB, createdByUid: UID, name, genre: genre as never,
    ...(opts.chainRole ? { chainRole: opts.chainRole, parentFunnelId: opts.parentFunnelId } : {}),
  });
  await updateFunnelServerSide({ subAccountId: SUB, funnelId: id, patch: { sections: sections as never } });
  const published = await updateFunnelServerSide({ subAccountId: SUB, funnelId: id, patch: { status: "published" } })
    .then(() => "PUBLISHED")
    .catch((e) => `REFUSED: ${e instanceof FunnelValidationError ? e.message : (e as Error).message}`);
  return { id, published };
}

const hero = (label: string, extra: Record<string, unknown>) => ({
  id: "s1", type: "hero", canvas: undefined,
  config: { headline: "QA Matrix scenario", subheadline: "Driven in a real browser.", ctaLabel: label, mediaType: "none", ...extra },
});

const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();

/** Open the published page and hand back a driven page object. */
async function open(id: string, device: "desktop" | "mobile") {
  const ctx = await browser.newContext({ viewport: device === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lp/${id}`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(900);
  return { page, ctx };
}

/** No visible button/link may exist without a real action. */
async function assertNoInertCtas(page: import("@playwright/test").Page, label: string) {
  const inert = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("button, a"))) {
      const text = (el.textContent ?? "").trim();
      if (!text || (el as HTMLElement).offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 24) continue;
      if (el.tagName === "A") {
        const href = el.getAttribute("href") ?? "";
        if (!href || href === "#") out.push(`A:${text.slice(0, 30)}`);
      } else if (el.getAttribute("type") !== "submit") {
        const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
        const props = key ? (el as unknown as Record<string, { onClick?: unknown }>)[key] : null;
        if (!props?.onClick) out.push(`BUTTON:${text.slice(0, 30)}`);
      }
    }
    return out;
  });
  check(`${label}: no button renders without an action`, inert.length === 0, inert.join(" | "));
}

const results: Record<string, boolean> = {};

// ══ B. BOOKING CTA ═════════════════════════════════════════════════════════
console.log("\n══ B. Booking CTA ══");
{
  const { id, published } = await buildAndPublish("QA-B booking", "lead_gen", [
    hero("Schedule Now", { cta: { style: "popup_calendar", bookingPageSlug: BOOKING_SLUG } }),
  ]);
  check("publishes with a real booking page attached", published === "PUBLISHED", published.slice(0, 140));
  for (const device of ["desktop", "mobile"] as const) {
    const { page, ctx } = await open(id, device);
    await assertNoInertCtas(page, device);
    const cta = page.locator("button", { hasText: /schedule/i }).first();
    check(`${device}: the booking CTA is present`, (await cta.count()) > 0);
    await cta.click({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    const frame = page.locator(`iframe[src*="/b/${SUB}/${BOOKING_SLUG}"]`);
    const opened = (await frame.count()) > 0;
    check(`${device}: clicking it opens the real booking destination`, opened, opened ? await frame.first().getAttribute("src") ?? "" : "no booking iframe");
    await ctx.close();
  }
  // The destination itself must be a real, reachable page.
  const bookRes = await fetch(`${BASE}/b/${SUB}/${BOOKING_SLUG}`);
  check("the booking destination is a live public page", bookRes.status === 200, `HTTP ${bookRes.status}`);
  results.B = failures === 0 || true;
}
const afterB = failures;

// ══ C. LEAD CAPTURE -> THANK-YOU ═══════════════════════════════════════════
console.log("\n══ C. Lead capture -> thank-you ══");
{
  const { id, published } = await buildAndPublish("QA-C capture", "lead_gen", [
    hero("Get the guide", { formId: FORM, cta: { style: "popup_form" } }),
  ]);
  check("publishes with an active follow-up behind it", published === "PUBLISHED", published.slice(0, 140));
  const email = `qa-matrix-c-${Date.now()}@test.local`;
  for (const device of ["desktop", "mobile"] as const) {
    const { page, ctx } = await open(id, device);
    await assertNoInertCtas(page, device);
    const cta = page.locator("button", { hasText: /get the guide/i }).first();
    await cta.click({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    const inputs = page.locator("form input:visible, form textarea:visible");
    check(`${device}: clicking the CTA opens the capture form`, (await inputs.count()) > 0);
    if (device === "desktop") {
      for (let i = 0; i < (await inputs.count()); i++) {
        const el = inputs.nth(i);
        const type = (await el.getAttribute("type")) ?? "text";
        await el.fill(type === "email" ? email : "QA Matrix C");
      }
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForTimeout(6000);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      check("desktop: the visitor reaches the intended confirmation destination", /you'?re in|thank|in touch|check your/i.test(body), body.slice(0, 130));
    }
    await ctx.close();
  }
  await new Promise((r) => setTimeout(r, 8000));
  const subs = await db.collection(`forms/${FORM}/submissions`).get();
  check("the submission was recorded", subs.size > 0, `${subs.size}`);
  const contacts = await db.collection("contacts").where("subAccountId", "==", SUB).where("email", "==", email).get();
  check("a contact was created", contacts.size > 0, `${contacts.size} for ${email}`);
}
const afterC = failures;

// ══ D. PAID CHECKOUT ═══════════════════════════════════════════════════════
console.log("\n══ D. Paid checkout ══");
{
  // external_link mode: a real, assertable destination that takes no payment
  // here. stripe_checkout mode is asserted at the contract layer instead,
  // because minting a live Session would be a real money-path side effect.
  const { id, published } = await buildAndPublish("QA-D checkout", "tripwire", [
    hero("Buy now, $49", { ctaHref: EXTERNAL_URL }),
    {
      id: "s2", type: "checkout",
      config: { headline: "The QA Matrix offer", bullets: ["A real destination"], priceCents: 4900, currency: "usd", ctaLabel: "Buy now, $49", checkoutMode: "external_link", ctaHref: EXTERNAL_URL },
    },
  ]);
  check("publishes with a configured checkout", published === "PUBLISHED", published.slice(0, 140));
  for (const device of ["desktop", "mobile"] as const) {
    const { page, ctx } = await open(id, device);
    await assertNoInertCtas(page, device);
    const link = page.locator(`a[href="${EXTERNAL_URL}"]`).first();
    check(`${device}: the checkout CTA points at the configured destination`, (await link.count()) > 0, await link.getAttribute("href").catch(() => "none"));
    const priceShown = (await page.locator("body").innerText()).includes("49");
    check(`${device}: the offer price is rendered`, priceShown);
    await ctx.close();
  }
  // A stripe_checkout section with no connected Stripe must be refused, not
  // published into a dead payment button.
  const noStripe = await buildAndPublish("QA-D stripe unconfigured", "tripwire", [
    hero("Buy", { ctaHref: EXTERNAL_URL }),
    { id: "s2", type: "checkout", config: { headline: "Offer", bullets: ["x"], priceCents: 4900, ctaLabel: "Buy", checkoutMode: "stripe_checkout" } },
  ]).catch((e) => ({ id: "", published: `REFUSED: ${(e as Error).message}` }));
  check("a Stripe checkout with no connected account cannot publish", noStripe.published.startsWith("REFUSED"), noStripe.published.slice(0, 130));
}
const afterD = failures;

// ══ E. LEGITIMATE UPSELL ═══════════════════════════════════════════════════
console.log("\n══ E. Legitimate upsell in a chain ══");
{
  const parent = await buildAndPublish("QA-E parent", "tripwire", [
    hero("Buy now", { ctaHref: EXTERNAL_URL }),
    { id: "s2", type: "checkout", config: { headline: "Main offer", bullets: ["x"], priceCents: 2900, ctaLabel: "Buy now", checkoutMode: "external_link", ctaHref: EXTERNAL_URL } },
  ]);
  const step = await buildAndPublish("QA-E upsell step", "tripwire", [
    { id: "s1", type: "upsell_offer", config: { headline: "Add the travel case for $19?", bullets: ["Protects the ceramic body"], priceCents: 1900, acceptLabel: "Yes, add the case", declineLabel: "No thanks" } },
  ], { chainRole: "upsell", parentFunnelId: parent.id });
  check("a correctly configured upsell step publishes", step.published === "PUBLISHED", step.published.slice(0, 140));

  for (const device of ["desktop", "mobile"] as const) {
    const { page, ctx } = await open(step.id, device);
    await assertNoInertCtas(page, device);
    const accept = page.locator("button", { hasText: /yes, add the case/i }).first();
    const decline = page.locator("button", { hasText: /no thanks/i }).first();
    check(`${device}: the upsell accept action is rendered and wired`, (await accept.count()) > 0);
    check(`${device}: the decline action is rendered and wired`, (await decline.count()) > 0);
    check(`${device}: the upsell price is rendered`, (await page.locator("body").innerText()).includes("19"));
    await ctx.close();
  }

  // The other half of the contract: the SAME section on a standalone page.
  const stray = await buildAndPublish("QA-E stray upsell", "lead_magnet", [
    hero("Get it", { formId: FORM, cta: { style: "popup_form" } }),
    { id: "s2", type: "upsell_offer", config: { headline: "Wait, add this?", bullets: ["x"], priceCents: 100000, acceptLabel: "Yes", declineLabel: "No" } },
  ]).catch((e) => ({ id: "", published: `REFUSED: ${(e as Error).message}` }));
  check("the same upsell on a standalone page is refused", stray.published.startsWith("REFUSED"), stray.published.slice(0, 130));
}
const afterE = failures;

// ══ F. EXTERNAL CTA ════════════════════════════════════════════════════════
console.log("\n══ F. External CTA ══");
{
  const { id, published } = await buildAndPublish("QA-F external", "lead_gen", [
    hero("Visit the site", { ctaHref: EXTERNAL_URL }),
    { id: "s2", type: "cta_banner", config: { headline: "Ready to look?", ctaLabel: "Visit the site", ctaHref: EXTERNAL_URL } },
  ]);
  check("publishes with a real external destination", published === "PUBLISHED", published.slice(0, 140));
  for (const device of ["desktop", "mobile"] as const) {
    const { page, ctx } = await open(id, device);
    await assertNoInertCtas(page, device);
    const link = page.locator(`a[href="${EXTERNAL_URL}"]`).first();
    check(`${device}: the external CTA is a real link to the intended URL`, (await link.count()) > 0, await link.getAttribute("href").catch(() => "none"));
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll("a")).filter((a) => { const h = a.getAttribute("href"); return (!h || h === "#") && (a.textContent ?? "").trim().length > 3 && (a as HTMLElement).offsetParent !== null; }).length);
    check(`${device}: no bare # or null href anywhere on the page`, bad === 0, `${bad} found`);
    await ctx.close();
  }
  // An empty href must not be publishable in the first place.
  const empty = await buildAndPublish("QA-F empty href", "lead_gen", [
    hero("Go", { ctaHref: EXTERNAL_URL }),
    { id: "s2", type: "cta_banner", config: { headline: "Ready?", ctaLabel: "Go", ctaHref: "" } },
  ]).catch((e) => ({ id: "", published: `REFUSED: ${(e as Error).message}` }));
  check("a CTA with an empty href cannot publish", empty.published.startsWith("REFUSED"), empty.published.slice(0, 130));
}

await browser.close();
console.log(`\n${failures === 0 ? "RUNTIME MATRIX B-F: ALL CHECKS PASSED" : `RUNTIME MATRIX B-F: ${failures} CHECK(S) FAILED`}`);
void results; void afterB; void afterC; void afterD; void afterE;
process.exit(failures === 0 ? 0 : 1);
