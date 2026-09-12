/**
 * LANDING PAGE DESIGN QUALITY — the permanent fixture set.
 *
 * Ascend's pitch is that it diagnoses weak marketing experiences and builds the
 * fix. That makes the visual quality of a GENERATED page a product requirement,
 * not polish: a page that converts badly is the exact defect the product exists
 * to find. So this generates representative pages through the real customer
 * path, publishes them, and captures what a visitor would actually see.
 *
 * FIVE FIXTURES, chosen to span the decisions the generator makes — genre,
 * emotional transformation, whether an opt-in exists, whether money changes
 * hands. If the generator only knows one page shape, these five will look the
 * same, and that is the finding.
 *
 * DETERMINISTIC vs JUDGEMENT. The checks below are the half a machine can
 * honestly own: overflow, broken media, distorted aspect ratios, clipped or
 * empty sections, actionless CTAs, and whether the page is six identical card
 * grids in a row. Taste is not asserted here — the screenshots exist so a human
 * makes that call, which is the only honest division.
 *
 * Everything is created in a throwaway workspace and deleted at the end,
 * including the published pages.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-landing-page-quality.mts
 *   BASE=https://flow-growth-scan-staging.onrender.com ... to shoot a deployment
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const OUT = process.env.SHOT_DIR ?? "/private/tmp/landing-quality";
mkdirSync(OUT, { recursive: true });

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { updateFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** The five fixtures. Deterministic inputs, so a page can always be rebuilt. */
const FIXTURES = [
  {
    id: "local-service",
    label: "Local service lead-gen",
    args: {
      funnel_name: "Emergency AC Repair",
      genre: "lead_gen",
      headline: "AC down in this heat? We can be there today.",
      subheadline: "Same-day emergency repair across the metro area, including weekends.",
      bullets: "Technician dispatched today, Upfront price before work starts, We fix it or you don't pay the call-out",
      cta_label: "Get my repair booked",
      emotional_transformation: "panic_to_relief",
      awareness: "most_aware",
      traffic_temperature: "hot",
      sales_argument: {
        prospect: "A homeowner whose air conditioning died in a heatwave",
        arrival_context: "Searching on a phone in a hot house, needs someone today",
        current_belief: "Everyone is booked out and I'll be told Thursday",
        belief_chain: "Same-day is a dispatch problem, and we hold slots for emergencies",
        mechanism: "Held same-day emergency slots and a technician already in your area",
        core_promise: "Cool air back today",
        primary_objection: "They'll quote me a fortune once they're here",
        close_reason: "The price is agreed before any work starts",
      },
    },
  },
  {
    id: "consultant",
    label: "Consultant / professional service",
    args: {
      funnel_name: "Operations Strategy Review",
      genre: "application",
      headline: "Your revenue grew. Your operations did not.",
      subheadline: "A structured review of where delivery breaks when volume doubles.",
      bullets: "For services businesses past the founder-led stage, Written findings in ten working days, Fixed scope and fixed fee",
      cta_label: "Apply for a review",
      emotional_transformation: "stagnation_to_clarity",
      awareness: "solution_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "A services founder whose delivery is straining at higher volume",
        arrival_context: "Reading after another week of firefighting",
        current_belief: "We need to hire our way out of this",
        belief_chain: "Headcount multiplies an unclear process rather than fixing it",
        mechanism: "A delivery-path map that finds where the work actually stalls",
        core_promise: "Know what to fix before you hire again",
        primary_objection: "Consultants produce a deck and disappear",
        close_reason: "Fixed scope, written findings, no retainer attached",
      },
    },
  },
  {
    id: "lead-magnet",
    label: "Lead magnet",
    args: {
      funnel_name: "The First 30 Nights Guide",
      genre: "lead_magnet",
      headline: "The one schedule change that ends most toddler night waking",
      subheadline: "An 18-page guide written for 1 to 3 year olds, readable in a single sitting.",
      bullets: "Built around wake windows rather than sleep training, Nothing to buy to use it, Written by a paediatric sleep consultant",
      cta_label: "Send me the guide",
      emotional_transformation: "discouragement_to_possibility",
      awareness: "problem_aware",
      traffic_temperature: "cold",
      sales_argument: {
        prospect: "A parent of a toddler who has not slept through in months",
        arrival_context: "Searching at 2am after another broken night",
        current_belief: "Every method has failed so something is wrong with my child",
        belief_chain: "The method was never the problem, the schedule underneath it was",
        mechanism: "A wake-window audit that finds the one mistimed nap",
        core_promise: "Know the single change to make tonight",
        primary_objection: "I have tried everything already",
        close_reason: "It is free, and it takes one evening to test",
      },
    },
  },
  {
    id: "booking",
    label: "Appointment / booking",
    args: {
      funnel_name: "New Patient Consultation",
      genre: "lead_gen",
      headline: "Dental care designed for people who dread the dentist",
      subheadline: "Longer appointments, sedation options, and no lecture about flossing.",
      bullets: "Tell us your worries before you arrive, Sedation available for any treatment, Evening appointments twice a week",
      cta_label: "Book my first visit",
      emotional_transformation: "fear_to_safety",
      awareness: "problem_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "An adult who has avoided the dentist for years out of anxiety",
        arrival_context: "Finally looking because something now hurts",
        current_belief: "I will be judged for how long I left it",
        belief_chain: "Avoidance is a treatment-design problem, not a character flaw",
        mechanism: "A first visit that is assessment only, with no treatment on the day",
        core_promise: "Get seen without being lectured or surprised",
        primary_objection: "They will start drilling on the first visit",
        close_reason: "The first appointment is a conversation and an exam, nothing else",
      },
    },
  },
  {
    id: "paid-offer",
    label: "Paid offer",
    args: {
      funnel_name: "Pricing Teardown",
      genre: "tripwire",
      headline: "Your pricing page is costing you more than your ad budget",
      subheadline: "A recorded teardown of your pricing page with the three changes to make first.",
      bullets: "Recorded walkthrough of your own page, Three prioritised changes with the reasoning, Delivered within five working days",
      cta_label: "Get my teardown",
      price_cents: 4900,
      emotional_transformation: "confusion_to_clarity",
      awareness: "solution_aware",
      traffic_temperature: "warm",
      sales_argument: {
        prospect: "A founder whose traffic converts worse than it should",
        arrival_context: "Has traffic and knows the page is the weak link",
        current_belief: "I need more traffic before pricing matters",
        belief_chain: "Pricing decides what the traffic you already have is worth",
        mechanism: "A teardown against how buyers actually compare options",
        core_promise: "Know the three changes to make first",
        primary_objection: "Generic advice I could have found myself",
        close_reason: "It is your page, recorded, not a checklist",
      },
    },
  },
] as const;

const RUN = `lpq${Date.now()}`;
const AGENCY = `test-agency-${RUN}`;
const SA = `test-sa-${RUN}`;
const UID = `test-uid-${RUN}`;
const ctx = { uid: UID, subAccountId: SA } as never;
const made: { funnelId: string; id: string; label: string }[] = [];

await db.doc(`agencies/${AGENCY}`).set({ name: "LPQ Verify", createdAt: new Date() });
await db.doc(`subAccounts/${SA}`).set({
  name: "LPQ Verify",
  agencyId: AGENCY,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

try {
  // ── Generate + publish through the real path ────────────────────────────
  console.log("\n══ generating ══");
  const funnel = getCapability("create_funnel")!;
  for (const fx of FIXTURES) {
    const v = funnel.validate!({ ...fx.args } as never);
    if (!(v as { ok: boolean }).ok) {
      check(`${fx.label}: validates`, false, (v as { reason?: string }).reason ?? "");
      continue;
    }
    const res = await funnel.execute(ctx, (v as { args: Record<string, unknown> }).args);
    const funnelId = (res as { ref?: { id: string } }).ref?.id;
    if (!funnelId) {
      check(`${fx.label}: generated`, false);
      continue;
    }
    check(`${fx.label}: generated`, true, funnelId);
    // A customer publishes the follow-up before the page, because the page
    // promises the email the workflow sends — the delivery guard refuses
    // otherwise, correctly. Doing it here walks the same sequence rather than
    // bypassing the guard.
    const wfs = await db.collection("workflows").where("subAccountId", "==", SA).where("status", "==", "draft").get();
    for (const w of wfs.docs) await w.ref.update({ status: "active" });

    // Publishing runs the real completeness + CTA + delivery guards, so a
    // fixture that cannot publish is itself a quality finding.
    try {
      await updateFunnelServerSide({ subAccountId: SA, funnelId, patch: { status: "published" } });
      made.push({ funnelId, id: fx.id, label: fx.label });
    } catch (e) {
      check(`${fx.label}: publishes (completeness guards)`, false, String(e).slice(0, 120));
    }
  }

  // ── Look at them ────────────────────────────────────────────────────────
  console.log("\n══ rendering ══");
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();

  for (const m of made) {
    for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
      const c = await browser.newContext({ viewport: { width, height } });
      const page = await c.newPage();
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      const res = await page.goto(`${BASE}/lp/${m.funnelId}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
      await page.waitForTimeout(1200);

      // WALK THE PAGE BEFORE LOOKING AT IT. Sections reveal on scroll via
      // IntersectionObserver, so a full-page screenshot taken from the top
      // captures everything below the fold still at opacity 0 — which reads as
      // a page of blank bands and is a finding about the camera, not the
      // product. Scrolling through fires every observer first.
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < pageHeight; y += 500) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(260);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);

      const tag = `${m.id}-${device}`;
      await page.screenshot({ path: `${OUT}/${tag}-fold.png` });
      await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });

      check(`${tag}: renders`, (res?.status() ?? 0) === 200, String(res?.status()));
      check(`${tag}: no JS errors`, errs.length === 0, errs[0]?.slice(0, 90) ?? "");
      check(`${tag}: no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));

      // ── Deterministic quality ────────────────────────────────────────────
      const audit = await page.evaluate(() => {
        const imgs = Array.from(document.images);
        const broken = imgs.filter((i) => i.currentSrc && i.naturalWidth === 0).length;
        // A rendered box wildly off the image's own ratio is a stretch/squash.
        const distorted = imgs.filter((i) => {
          if (!i.naturalWidth || !i.naturalHeight || !i.clientWidth || !i.clientHeight) return false;
          const nat = i.naturalWidth / i.naturalHeight;
          const box = i.clientWidth / i.clientHeight;
          const style = getComputedStyle(i);
          if (style.objectFit === "cover" || style.objectFit === "contain") return false;
          return Math.abs(nat - box) / nat > 0.15;
        }).length;
        const srcs = imgs.map((i) => i.currentSrc).filter(Boolean);
        const repeated = srcs.length - new Set(srcs).size;

        const sections = Array.from(document.querySelectorAll("section"));
        const empty = sections.filter((s) => (s.textContent ?? "").trim().length === 0 && !s.querySelector("img,video,svg")).length;
        // A section still transparent after the page has been walked is a real
        // reveal bug, not a capture artifact.
        const invisible = sections.filter((s) => Number(getComputedStyle(s).opacity) < 0.9).length;

        // CTAs that go nowhere.
        const ctas = Array.from(document.querySelectorAll("a,button")) as HTMLElement[];
        const actionless = ctas.filter((el) => {
          const t = (el.textContent ?? "").trim();
          if (t.length < 3 || t.length > 40) return false;
          if (el.tagName === "A") {
            const href = (el as HTMLAnchorElement).getAttribute("href") ?? "";
            return href === "" || href === "#";
          }
          return false;
        }).length;

        // Placeholder text that escaped.
        const body = document.body.innerText;
        const placeholders = (body.match(/\[[A-Z_ ]{3,}\]|lorem ipsum|TODO|XXXX/gi) ?? []).length;

        // Line length: a measure of whether text is readable or a wall.
        const paras = Array.from(document.querySelectorAll("p")).filter((p) => (p.textContent ?? "").length > 120);
        const tooWide = paras.filter((p) => p.getBoundingClientRect().width > 900).length;

        // Section rhythm: if every section is the same height-to-content shape
        // and they all contain a grid, the page is one pattern repeated.
        const gridy = sections.filter((s) => {
          const el = s.querySelector("[class*='grid']");
          return !!el;
        }).length;

        return {
          images: imgs.length,
          broken,
          distorted,
          repeated,
          sections: sections.length,
          empty,
          invisible,
          actionless,
          placeholders,
          tooWide,
          gridy,
          imagesWithoutAlt: imgs.filter((i) => !i.getAttribute("alt")).length,
          height: document.body.scrollHeight,
        };
      });

      console.log(
        `     ${tag}: ${audit.sections} sections, ${audit.images} imgs, ${audit.gridy} grid-sections, ${audit.height}px`,
      );
      check(`${tag}: every section is visible after scrolling`, audit.invisible === 0, `${audit.invisible} still at opacity 0`);
      check(`${tag}: no broken media`, audit.broken === 0, `${audit.broken}`);
      check(`${tag}: no distorted media`, audit.distorted === 0, `${audit.distorted}`);
      check(`${tag}: no empty sections`, audit.empty === 0, `${audit.empty}`);
      check(`${tag}: no actionless CTA`, audit.actionless === 0, `${audit.actionless}`);
      check(`${tag}: no placeholder text`, audit.placeholders === 0, `${audit.placeholders}`);
      check(`${tag}: images carry alt text`, audit.imagesWithoutAlt === 0, `${audit.imagesWithoutAlt} without alt`);
      if (device === "desktop") {
        check(`${tag}: no wall-of-text line lengths`, audit.tooWide === 0, `${audit.tooWide} paragraphs >900px`);
        // The headline finding: is the page one pattern repeated?
        check(
          `${tag}: the page is not one layout repeated`,
          audit.sections === 0 || audit.gridy / audit.sections < 0.6,
          `${audit.gridy}/${audit.sections} sections are card grids`,
        );
        check(`${tag}: the page carries media at all`, audit.images > 0, `${audit.images} images`);
      }
      await c.close();
    }
  }
  await browser.close();
  console.log(`\nscreenshots: ${OUT}`);
} finally {
  for (const m of made) await db.doc(`funnels/${m.funnelId}`).delete().catch(() => {});
  for (const coll of ["forms", "workflows", "message_templates"]) {
    const snap = await db.collection(coll).where("subAccountId", "==", SA).get().catch(() => null);
    if (snap) for (const d of snap.docs) await d.ref.delete().catch(() => {});
  }
  await db.doc(`subAccounts/${SA}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY}`).delete().catch(() => {});
}

console.log(failures === 0 ? "\nDETERMINISTIC QUALITY: ALL CHECKS PASSED\n" : `\nDETERMINISTIC QUALITY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
