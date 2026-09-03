/**
 * FINAL LAUNCH PASS — LANDING PAGE QUALITY BATTERY.
 *
 * Three materially different businesses, each built through the TRUE Zeno
 * path (chat -> proposal -> confirm), then the FINISHED CUSTOMER-VISIBLE PAGE
 * is rendered in a real browser and inspected.
 *
 * The question is "would we confidently let a paying customer run traffic to
 * this?", which no script can answer. What this DOES do is make the real
 * artifact inspectable and fail the mechanical disqualifiers — a page with
 * fabricated proof, placeholder text, dead CTAs, empty shells or copy that
 * could belong to any business is not worth a human's judgment. Everything
 * that survives is printed in full for that judgment.
 *
 * The Critic's verdict is reported as supporting evidence only; it is
 * explicitly NOT the pass condition.
 *
 * Run: FLOW_PROBE_SA=<sa> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-quality-battery.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA;
if (!SA) throw new Error("FLOW_PROBE_SA is required.");
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await r.json()) as { idToken?: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

// Three genuinely different decision shapes, not three variations of one.
const CASES = [
  {
    label: "1. LOCAL SERVICE",
    ask: "Build a landing page for Halvorsen Roofing in Duluth, Minnesota. We do storm-damage roof repair and full replacements for homeowners. Most people find us after a hailstorm and they're dealing with an insurance claim they don't understand. Free inspection, we handle the insurance paperwork, 25 years in business.",
    mustMention: /roof|storm|hail|insurance|shingle|duluth/i,
  },
  {
    label: "2. B2B / PROFESSIONAL SERVICE",
    ask: "Build a landing page for Meridian Payroll Partners. We're an outsourced payroll and compliance firm for 20-200 employee manufacturing companies across the Midwest. Their in-house person is drowning in multi-state tax filings and they're scared of penalties. We take it over completely. Free compliance risk review.",
    mustMention: /payroll|compliance|multi-?state|tax|filing|penalt/i,
  },
  {
    label: "3. HIGHER-TICKET / CONSULTING",
    ask: "Build a landing page for Ashgrove Advisory. I do 6-month operational turnaround engagements for founder-led manufacturing businesses doing $5-30M who've stalled out. Engagements start at $60,000. Buyers are skeptical of consultants and have usually been burned before. It starts with a paid diagnostic.",
    mustMention: /turnaround|operational|founder|manufactur|diagnostic|engagement/i,
  },
];

interface Built { label: string; funnelId: string; mustMention: RegExp }
const built: Built[] = [];

for (const c of CASES) {
  console.log(`\n${"=".repeat(70)}\n${c.label}\n${"=".repeat(70)}`);
  const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      level: "sub-account", subAccountId: SA,
      messages: [{ role: "user", content: c.ask }],
      pageContext: { route: `/sa/${SA}/funnels` },
    }),
  });
  const chat = (await chatRes.json().catch(() => ({}))) as { type?: string; text?: string; proposal?: { capability?: string; args?: Record<string, unknown> } };
  if (chat.type !== "proposal" || chat.proposal?.capability !== "create_funnel") {
    check(`${c.label}: Zeno proposed a funnel`, false, `type=${chat.type} ${(chat.text ?? "").slice(0, 120)}`);
    continue;
  }
  check(`${c.label}: Zeno proposed a funnel`, true);
  const conf = await fetch(`${BASE}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_funnel", args: chat.proposal.args }),
  });
  const cd = (await conf.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string }; error?: string };
  const funnelId = cd.resultRef?.kind === "funnel" ? cd.resultRef.id : undefined;
  check(`${c.label}: the page was built`, !!funnelId, funnelId ?? JSON.stringify(cd).slice(0, 160));
  if (funnelId) built.push({ label: c.label, funnelId, mustMention: c.mustMention });
}

// ── Publish each so the CUSTOMER-VISIBLE page is what gets judged ─────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

for (const b of built) {
  console.log(`\n${"─".repeat(70)}\n${b.label} — FINISHED PAGE\n${"─".repeat(70)}`);
  const doc = (await db.doc(`funnels/${b.funnelId}`).get()).data() as Record<string, unknown>;
  const sections = (doc.sections ?? []) as { type: string; config: Record<string, unknown> }[];
  const verdict = doc.criticVerdict as { verdict?: string; findings?: unknown[] } | undefined;

  // Publish (the human approval step) so /lp renders the real public page.
  await db.doc(`funnels/${b.funnelId}`).update({ status: "published" });
  await page.goto(`${BASE}/lp/${b.funnelId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  const headings = await page.locator("h1, h2").allInnerTexts();
  const ctas = await page.locator("button, a[href]").allInnerTexts();

  console.log(`sections: ${sections.map((s) => s.type).join(" > ")}`);
  console.log(`criticVerdict (supporting evidence only): ${verdict?.verdict} (${verdict?.findings?.length ?? 0} findings)`);
  console.log(`\nHEADINGS:\n  ${headings.slice(0, 12).join("\n  ")}`);
  console.log(`\nCTAs: ${[...new Set(ctas.map((x) => x.trim()).filter(Boolean))].slice(0, 8).join(" | ")}`);
  console.log(`\nPAGE COPY (first 1400 chars):\n${text.slice(0, 1400)}\n`);

  // ── Mechanical disqualifiers ────────────────────────────────────────────
  check(`  ${b.label}: the page actually renders content`, text.length > 800, `${text.length} chars`);
  check(`  ${b.label}: copy is about THIS business, not generic`, b.mustMention.test(text));
  check(`  ${b.label}: no placeholder/filler text`,
    !/\[insert|\[your |lorem ipsum|placeholder|TODO|xxx+/i.test(text));
  check(`  ${b.label}: no empty section shells`,
    (await import("../src/lib/funnels/section-completeness.ts")).evaluateSections(sections as never)
      .every((e) => e.state !== "empty"));
  check(`  ${b.label}: has a real call to action`, ctas.some((x) => x.trim().length > 3));
  // Fabricated proof is the one thing that must NEVER appear.
  const testimonials = sections.find((s) => s.type === "testimonials");
  const stats = sections.find((s) => s.type === "stats");
  check(`  ${b.label}: no fabricated testimonials`,
    !testimonials || ((testimonials.config.items as unknown[] | undefined)?.length ?? 0) === 0);
  check(`  ${b.label}: no fabricated statistics`,
    !stats || ((stats.config.items as unknown[] | undefined)?.length ?? 0) === 0);
  check(`  ${b.label}: headings are not duplicated verbatim`,
    new Set(headings.map((h) => h.trim().toLowerCase())).size === headings.length,
    `${headings.length} headings, ${new Set(headings.map((h) => h.trim().toLowerCase())).size} unique`);

  await page.screenshot({ path: `/tmp/claude-501/-Users-boss-DivineXLeadStack/432eee0f-986f-4d37-b180-af86812886c5/scratchpad/page-${b.funnelId}.png`, fullPage: true });
  console.log(`  screenshot: page-${b.funnelId}.png`);
  console.log(`  live: ${BASE}/lp/${b.funnelId}`);
}

await browser.close();
console.log(`\n${bad === 0 ? "QUALITY BATTERY: no mechanical disqualifiers — HUMAN JUDGMENT REQUIRED on the copy above" : `QUALITY BATTERY: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
