/**
 * THREE REAL BUSINESSES, THROUGH THE REAL PATH, INSPECTED AS RENDERED.
 *
 * Not a unit test. This generates through the SAME chat route a customer
 * uses, with a planted canonical Business/Brand profile, then renders the
 * result at desktop and mobile and extracts what a human needs to judge it:
 * the actual headline, the actual bullets, the images, the CTAs.
 *
 * It exists to answer two questions that no structural test can:
 *   1. Does the generated work demonstrably correspond to THIS business, or
 *      could the copy be pasted onto a competitor unchanged?
 *   2. Would I be comfortable showing this during a live sales walkthrough?
 *
 * The profile-grounding assertions are the point. A page can be beautiful and
 * still be about nobody, which is precisely the failure the profile fix was
 * made for.
 *
 *   FLOW_PROBE_UID=<owner-uid> NODE_OPTIONS=... tsx scripts/verify-beta-real-output.mts
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = process.env.FLOW_PROBE_UID!;
if (!OWNER) throw new Error("FLOW_PROBE_UID is required (the owner uid to sign in as).");
const OUT = "/tmp/beta-real-output";
mkdirSync(OUT, { recursive: true });

const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { chromium } = await import("/Users/boss/DivineXLeadStack/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs");
const db = getAdminDb();
const auth = getAdminAuth();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`  ${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

/**
 * A MAPPED WORKSPACE, NOT A FRESH ONE.
 *
 * Profile context is gated by tenant authorization: the stored snapshot's
 * businessProfileId must equal the id the workspace is canonically mapped
 * to, or everything is withheld (correctly, since a mismatch could be
 * another company's data). A brand-new workspace has no mapping at all, so
 * generating in one would silently test the UNGROUNDED path and prove
 * nothing about the thing this run exists to check.
 *
 * So this runs in an existing mapped workspace and plants each business
 * under that workspace's real profile id, restoring the original at the end.
 */
const SA = process.env.BETA_SA ?? "MqYPgGQt5BJ9DeUb5Bb1";
const PROFILE_ID = Number(process.env.BETA_PROFILE_ID ?? 4);
const profileRef = db.doc(`divinexProfiles/${SA}`);
const priorProfile = (await profileRef.get()).data();
if (!priorProfile) throw new Error(`${SA} has no profile to restore afterwards; refusing to run.`);

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

/** One chat turn against the real route, auto-confirming a proposal. */
async function chat(cookie: string, prompt: string, route = "/app/create"): Promise<{ type: string; text: string; proposal?: Record<string, unknown> }> {
  // A model turn that never returns must fail this run, not stall it.
  const res = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, messages: [{ role: "user", content: prompt }], pageContext: { route } }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`chat ${res.status}: ${JSON.stringify(d).slice(0, 300)}`);
  const p = d.proposal as { summary?: string } | undefined;
  return { type: String(d.type ?? ""), text: String(d.type === "proposal" ? (p?.summary ?? "") : (d.text ?? "")), proposal: d.proposal as Record<string, unknown> | undefined };
}

/** Confirm a proposal exactly as the chat UI does. */
async function confirm(cookie: string, proposal: Record<string, unknown>): Promise<{ ok: boolean; ref?: { kind: string; id: string } | null; error?: string }> {
  const res = await fetch(`${BASE}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: proposal.capability, args: proposal.args }),
    signal: AbortSignal.timeout(300_000),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; resultRef?: { kind: string; id: string } | null; error?: string };
  return { ok: res.ok && d.ok === true, ref: d.resultRef, error: d.error };
}

interface Rendered {
  status: number; h1: string; headings: string[]; ctas: string[];
  images: number; brokenImages: number; placeholderSlots: number; forms: number;
  overflowX: number; height: number; bracketPlaceholders: string[]; text: string;
}

/** What a human needs in order to judge a rendered page. */
async function inspect(page: import("playwright").Page, url: string): Promise<Rendered | null> {
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
  if (!res || res.status() >= 400) return null;
  await page.evaluate(`new Promise((r) => { let y = 0; const t = setInterval(() => { window.scrollTo(0, y); y += 600; if (y > document.body.scrollHeight) { clearInterval(t); window.scrollTo(0, 0); r(); } }, 40); })`);
  await page.waitForTimeout(700);
  // NO INNER FUNCTION BINDINGS IN HERE. tsx compiles with esbuild's keepNames,
  // which injects a __name() call around any named function or arrow assigned
  // to a const. That helper does not exist in the page, so the evaluate throws
  // "__name is not defined" and the whole render reads as a failure.
  return page.evaluate(`(() => {
    const visible = [];
    for (const e of document.querySelectorAll("img")) {
      const r = e.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) visible.push(e);
    }
    let broken = 0;
    for (const i of visible) if (!i.naturalWidth) broken++;
    const heads = [];
    for (const h of document.querySelectorAll("h2,h3")) {
      const t = (h.textContent || "").trim();
      if (t) heads.push(t);
    }
    const ctas = [];
    for (const b of document.querySelectorAll("button,a[href]")) {
      const r = b.getBoundingClientRect();
      const t = (b.textContent || "").trim();
      if (r.width > 2 && r.height > 2 && t.length > 1 && t.length < 60) ctas.push(t);
    }
    let slots = 0;
    for (const e of document.querySelectorAll("*")) {
      if (e.children.length === 0 && /Photo needed|Intentionally text-led|Add your photo/i.test(e.textContent || "")) slots++;
    }
    const h1el = document.querySelector("h1");
    return {
      status: 200,
      h1: h1el ? (h1el.textContent || "").trim() : "",
      headings: heads.slice(0, 12),
      ctas: ctas.slice(0, 8),
      images: visible.length,
      brokenImages: broken,
      placeholderSlots: slots,
      forms: document.querySelectorAll("form,input[type=email]").length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: document.body.scrollHeight,
      bracketPlaceholders: (document.body.innerText.match(/\\[[A-Z_]{3,}\\]/g) || []).slice(0, 5),
      text: document.body.innerText.slice(0, 2500),
    };
  })()`) as Promise<Rendered>;
}

interface Biz {
  id: string; label: string;
  profile: Record<string, unknown>;
  /** The sentence a real customer would type. */
  ask: string;
  /** Words that must appear for the page to be about THIS business. */
  mustGround: string[];
  /** Words that would mean it drifted to a different business. */
  mustNotDrift: string[];
}

const BUSINESSES: Biz[] = [
  {
    id: "roofing",
    label: "Local service, website-grounded (Summit Roofing, Houston)",
    profile: {
      business: { name: "Summit Roofing", type: "residential roofing contractor",
        audience: "Houston homeowners whose roofs were hit by storms",
        offer: "a free 25-point roof inspection ending in photos and a written recommendation",
        websiteUrl: "https://summitroofing.test" },
      offers: [{ id: "off_inspect", name: "Free 25-point roof inspection", kind: "service" }],
      brand: { voice: { tone: "plain-spoken, reassuring, no hard sell" } },
    },
    ask: "Build me a landing page so storm-hit homeowners book the free inspection.",
    mustGround: ["roof", "inspection"],
    mustNotDrift: ["dental", "ceramic", "bookkeep", "payroll"],
  },
  {
    id: "grooming",
    label: "No website at all, context-only (mobile dog grooming)",
    profile: {
      business: { name: "Paws & Pavement", type: "mobile dog grooming van",
        audience: "busy dog owners in inner-west Sydney who cannot get to a salon",
        offer: "a full groom done in a van outside the owner's house" },
      offers: [{ id: "off_groom", name: "At-home full groom", kind: "service" }],
      brand: { voice: { tone: "friendly, practical, local" } },
    },
    ask: "I need a page that gets people to book a groom.",
    mustGround: ["groom", "dog"],
    mustNotDrift: ["roof", "dental", "ceramic", "software"],
  },
  {
    id: "cfo",
    label: "B2B professional service (fractional CFO)",
    profile: {
      business: { name: "Ledgerline Advisory", type: "fractional CFO practice",
        audience: "founders of $2M-$10M ecommerce brands with no finance lead",
        offer: "a monthly fractional CFO engagement starting with a cash-flow and margin review" },
      offers: [{ id: "off_cfo", name: "Fractional CFO engagement", kind: "service" }],
      brand: { voice: { tone: "measured, numerate, unhyped" } },
    },
    ask: "Build a page that gets ecommerce founders to book the first review call.",
    mustGround: ["cash", "margin", "cfo", "finance", "founder"],
    mustNotDrift: ["roof", "groom", "dental"],
  },
];

const cookie = await session(OWNER);
const browser = await chromium.launch();
browser.contexts().forEach((c) => c.setDefaultTimeout(30_000));
const results: Record<string, unknown>[] = [];

try {
  for (const biz of BUSINESSES) {
    console.log(`\n${"=".repeat(74)}\n${biz.label}\n${"=".repeat(74)}`);

    // Plant the canonical profile, exactly as the DivineX bridge publishes it.
    await db.doc(`divinexProfiles/${SA}`).set({
      contract: "divinex.profile", contractVersion: 1, profileVersion: 1,
      publishedAt: new Date().toISOString(), flowSubAccountId: SA,
      businessProfileId: PROFILE_ID,
      ...biz.profile, assets: [], provenance: {},
    }, { merge: false });

    // Prove the plant is actually ADMITTED before judging the output. A
    // withheld profile would make every grounding assertion below a test of
    // the ungrounded path wearing this business's name.
    const { getAuthorizedProfileSnapshot } = await import("../src/lib/divinex/authorized-profile");
    const authd = await getAuthorizedProfileSnapshot(SA);
    check(`${biz.id}: the profile is AUTHORIZED (not withheld)`, authd.ok,
      authd.ok ? "" : (authd as { reason: string }).reason);
    if (!authd.ok) continue;

    const before = await db.collection("funnels").where("subAccountId", "==", SA).get();
    const seen = new Set(before.docs.map((d) => d.id));

    let reply: Awaited<ReturnType<typeof chat>>;
    try { reply = await chat(cookie, biz.ask); }
    catch (e) { check(`${biz.id}: Zeno answered`, false, (e as Error).message.slice(0, 160)); continue; }
    console.log(`\n--- Zeno ---\n${reply.text.slice(0, 700)}\n------------`);

    // GROUNDING, on the ANSWER. The profile fix is only real if the reply is
    // about this business rather than a request to describe it.
    const lower = reply.text.toLowerCase();
    // Advisory on the SUMMARY: it is a single sentence and may legitimately
    // not contain a keyword the rendered page does. The binding grounding
    // assertion is on the rendered page further down.
    const summaryGrounded = biz.mustGround.some((w) => lower.includes(w));
    console.log(`  note  ${biz.id}: proposal summary mentions the business: ${summaryGrounded}`);
    check(`${biz.id}: it did not drift to another business`,
      !biz.mustNotDrift.some((w) => lower.includes(w)));
    check(`${biz.id}: it did not re-ask what the business is`,
      !/what (?:does|do) (?:your|the) .{0,24}(?:business|company|practice) (?:actually )?(?:do|sell)/i.test(reply.text) &&
      !/who (?:is|are) your (?:ideal )?(?:client|customer|audience)/i.test(reply.text),
      "re-ask detected");

    // ── Confirm, exactly as the chat UI does, then render it ───────────
    if (reply.type !== "proposal" || !reply.proposal) {
      check(`${biz.id}: Zeno proposed a build`, false, `type=${reply.type}`);
      continue;
    }
    check(`${biz.id}: Zeno proposed a build`, true, String(reply.proposal.capability));
    const made = await confirm(cookie, reply.proposal);
    check(`${biz.id}: the build was accepted on confirm`, made.ok, made.error ?? "");
    if (!made.ok) continue;

    const after = await db.collection("funnels").where("subAccountId", "==", SA).get();
    const fresh = after.docs.filter((d) => !seen.has(d.id));
    check(`${biz.id}: a funnel actually exists afterwards`, fresh.length > 0, `${fresh.length} new`);
    if (fresh.length === 0) continue;
    const funnelId = (made.ref?.kind === "funnel" && made.ref.id) || fresh[0].id;

    // A DRAFT IS CORRECTLY NOT PUBLIC. create_funnel never auto-publishes
    // (real money and real email sit behind "live"), so /lp/ refuses a draft
    // and an earlier version of this harness read that refusal as a render
    // failure. Walk the sequence a customer walks: activate the follow-up
    // workflow the page promises, then publish through the real guards.
    const wfs = await db.collection("workflows").where("subAccountId", "==", SA).where("status", "==", "draft").get();
    for (const w of wfs.docs) await w.ref.update({ status: "active" });
    const { updateFunnelServerSide } = await import("../src/lib/server/funnels-service");
    try {
      await updateFunnelServerSide({ subAccountId: SA, funnelId, patch: { status: "published" } });
      check(`${biz.id}: publishes through the real completeness guards`, true);
    } catch (e) {
      check(`${biz.id}: publishes through the real completeness guards`, false, String(e).slice(0, 150));
      continue;
    }

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const dp = await desktop.newPage(); const mp = await mobile.newPage();
    const url = `${BASE}/lp/${funnelId}`;
    const d = await inspect(dp, url);
    const m = await inspect(mp, url);
    if (d) { await dp.screenshot({ path: `${OUT}/${biz.id}-desktop.png`, fullPage: true }); }
    if (m) { await mp.screenshot({ path: `${OUT}/${biz.id}-mobile.png`, fullPage: true }); }

    check(`${biz.id}: the page renders`, !!d && !!m);
    if (d && m) {
      check(`${biz.id}: no horizontal overflow on desktop`, d.overflowX <= 1, `${d.overflowX}px`);
      check(`${biz.id}: no horizontal overflow on mobile`, m.overflowX <= 1, `${m.overflowX}px`);
      check(`${biz.id}: no broken images`, d.brokenImages === 0, `${d.brokenImages}`);
      check(`${biz.id}: no bracket placeholders in the copy`, d.bracketPlaceholders.length === 0, d.bracketPlaceholders.join(","));
      // THE CTA OPENS A POPUP. Counting inline <form> elements read every
      // booking page as having no way to capture a lead, which was wrong:
      // cta_style popup_form is the documented default when no booking slug
      // or phone number exists. Click the real CTA and look at what opens.
      let captured = d.forms > 0;
      if (!captured) {
        // Do not guess the wording. "Pick a time" missed a verb list that
        // had book/get/start/send/request/claim in it, and the page whose
        // CTA copy is most specific to the business is exactly the page the
        // guess fails on. Take the first visible button instead.
        const cta = dp.locator("button:visible").first();
        if (await cta.count()) {
          await cta.click({ timeout: 5000 }).catch(() => {});
          await dp.waitForTimeout(900);
          captured = await dp.evaluate(`(() => {
            const n = document.querySelectorAll("form,input[type=email],input[name=email]").length;
            return n > 0;
          })()`) as boolean;
          await dp.screenshot({ path: `${OUT}/${biz.id}-capture.png` });
        }
      }
      check(`${biz.id}: the page captures a lead`, captured,
        captured ? "" : `${d.forms} inline, and the CTA opened nothing`);
      // THE GROUNDING TEST THAT MATTERS: the RENDERED copy, not the proposal.
      const pageLower = d.text.toLowerCase();
      check(`${biz.id}: the rendered page is about THIS business`,
        biz.mustGround.some((w) => pageLower.includes(w)), biz.mustGround.join("/"));
      check(`${biz.id}: the rendered page did not drift`,
        !biz.mustNotDrift.some((w) => pageLower.includes(w)));
      console.log(`\n  H1: ${d.h1}`);
      console.log(`  headings: ${d.headings.slice(0, 6).join(" | ")}`);
      console.log(`  CTAs: ${d.ctas.slice(0, 4).join(" | ")}`);
      console.log(`  images=${d.images} placeholderSlots=${d.placeholderSlots} forms=${d.forms} height=${d.height}px`);
    }
    await desktop.close(); await mobile.close();
    results.push({ id: biz.id, label: biz.label, funnelId, url, proposal: reply.text, desktop: d, mobile: m });
  }
} finally {
  await profileRef.set(priorProfile, { merge: false });
  console.log("\n(original workspace profile restored)");
  await browser.close();
  console.log(`\nartifacts: ${OUT}`);
  console.log(`workspace: ${SA} (left in place for inspection)`);
}
import { writeFileSync } from "node:fs";
writeFileSync(`${OUT}/replies.json`, JSON.stringify(results, null, 2));
console.log(bad === 0 ? "\nGROUNDING: ALL PASS" : `\nGROUNDING: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
