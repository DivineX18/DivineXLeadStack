// STEP 4-12 — GENERALIZATION BATTERY (real model, production path, no
// forced architecture). 12 buying situations; the model reasons funnel type,
// depth, complexity, argument, copy, design itself. Compact stored-data
// traces; published QA copies at funnels/qa-bat-<key> for rendering.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/battery.mts --slice 1,6
//       NODE_OPTIONS="--conditions=react-server" npx tsx scripts/battery.mts --slice 7,12
//       ... --cleanup removes QA docs.

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { CONVERSION_FRAMEWORKS, renderFrameworksAsCards } = await import("../src/lib/conversion/framework-library");
const { listActivePrinciplesForArchetype, renderPrinciplesAsCards } = await import("../src/lib/design-intelligence/principles");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
type Ctx = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const db = getAdminDb();
const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;

const S = [
  { n: 1, key: "ebook", brief: "Build a funnel for marriage counselor Dana Wells offering a free ebook, 'Five Conversations Before It's Too Late' — a short PDF for couples who feel distant. Traffic comes from her Instagram posts about relationships. Real facts: she's a licensed marriage and family therapist with 12 years in practice; the ebook is 24 pages with five scripted conversations. No testimonials to publish." },
  { n: 2, key: "checklist", brief: "Build a funnel for Hartline Home Inspections offering a free pre-listing inspection checklist for home sellers. Traffic is mostly realtor referrals who send sellers a link. Real facts: 22-point checklist, covers the items that most often kill deals in escrow, written by a licensed inspector with 3,000+ inspections performed. No testimonials." },
  { n: 3, key: "assessment", brief: "Build a funnel for Beacon Digital, a web agency, offering a free 10-minute website conversion scorecard — the visitor answers questions and gets a scored report on why their site isn't converting. Traffic is LinkedIn posts to small-business owners. Real facts: the scorecard checks 12 conversion factors; the report includes 3 prioritized fixes. No testimonials." },
  { n: 4, key: "ecom29", brief: "Build a funnel selling the Cascade Pour-Over Set — a $29 ceramic pour-over coffee brewer with a reusable steel filter. Sold direct on Instagram ads to home coffee drinkers. Real facts: ceramic body keeps water temp stable during the pour, steel micro-filter means no paper waste, dishwasher safe, ships in 3 days from Portland. No reviews collected yet." },
  { n: 5, key: "workshop97", brief: "Build a funnel for a $97 live workshop, 'Notion for Freelancers,' by operations coach Riley Chen — a 3-hour live session teaching freelancers to run their whole business from one Notion workspace. Traffic is Riley's YouTube channel audience. Real facts: includes the live 3-hour session, a template pack of 9 Notion templates, and a recording. Runs on the first Saturday of next month. No testimonials to publish." },
  { n: 6, key: "course500", brief: "Build a funnel for a $500 self-paced course, 'The Posing Playbook,' for wedding photographers who freeze up directing couples. Sold to a warm email list of photographers who follow the creator's posing content. Real facts: 40 video lessons, a 120-pose reference library, real-wedding breakdown footage, lifetime access. Creator has shot 300+ weddings over 11 years. No student testimonials yet." },
  { n: 7, key: "coach2500", brief: "Build a funnel for a $2,500 8-week career-change coaching program by coach Maya Torres, for mid-career professionals stuck in jobs they've outgrown. Traffic is cold Meta ads. Real facts: weekly 1:1 sessions, a skills-mapping framework, interview preparation, and a job-search operating system; capped at 10 clients per cohort because sessions are 1:1. Application call required before enrollment. No client testimonials cleared for publishing." },
  { n: 8, key: "consult10k", brief: "Build a funnel for Meridian Pricing, a $10,000 consulting engagement that rebuilds pricing strategy for marketing agencies doing $1M-$5M revenue. Traffic is podcast guest appearances and referrals. Real facts: 6-week engagement, pricing diagnostic across the whole service catalog, value-based pricing model design, sales-call scripts for the new pricing, and 60 days of implementation support. Founder previously ran pricing at two agencies. Starts with a fit call." },
  { n: 9, key: "b2b50k", brief: "Build a funnel for Gridworks Integration, a $50,000+ warehouse automation integration service for mid-size distribution companies. Buyers are operations directors and CFOs; traffic is outbound email and industry-site visits. Real facts: they integrate conveyor/scanner/WMS systems without halting operations (phased cutover methodology), typical project 10-14 weeks, fixed-scope proposals after a site assessment, and they maintain the systems post-launch. The next step is booking a site assessment." },
  { n: 10, key: "entsaas", brief: "Build a funnel for Meridian Comply, an enterprise compliance-management platform for hospital systems. The visitors are compliance officers who ALREADY know the product — they searched for it by name after an analyst report; they're evaluating for procurement. Real facts: SOC 2 Type II and HIPAA compliant, SSO/SAML, integrates with Epic and Workday, dedicated implementation team with a 90-day rollout plan, 24/7 support with a 1-hour SLA, per-facility licensing. Next step is booking a demo with the solutions team." },
  { n: 11, key: "nonprofit", brief: "Build a donation funnel for Harborlight Service Dogs, a nonprofit that trains and places service dogs with veterans with PTSD at no cost to the veteran. Traffic is Facebook shares of placement stories. Real facts: training one dog takes 18 months and costs about $28,000; the org has placed 47 dogs since 2019; 100% of the program is donor-funded; monthly donors get quarterly updates on a dog in training. Seeking recurring monthly donors." },
  { n: 12, key: "emergency", brief: "Build a funnel for RapidFlow Plumbing — 24/7 emergency plumbing in Denver (burst pipes, water heaters, sewage backups). Customers find them on Google searching 'emergency plumber near me' with water actively leaking. Real facts: real person answers 24/7, technician dispatched within 90 minutes across metro Denver, upfront flat pricing before work starts, licensed and insured, trucks stocked for common failures. Phone: +13035550177." },
];

if (process.argv.includes("--cleanup")) {
  for (const s of S) await db.doc(`funnels/qa-bat-${s.key}`).delete().catch(() => {});
  console.log("battery QA docs deleted");
  process.exit(0);
}
const sliceArg = process.argv[process.argv.indexOf("--slice") + 1] ?? "1,12";
const [lo, hi] = sliceArg.split(",").map(Number);

const cards: string[] = [];
try { cards.push(...renderPrinciplesAsCards(await listActivePrinciplesForArchetype(null))); } catch {}
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\nREFERENCE MATERIAL (reason from these principles; never copy verbatim):\n" + cards.join("\n");

async function callModel(brief: string): Promise<Record<string, unknown>> {
  const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: brief }],
      tools: [{ type: "function", function: { name: cap.name, description: cap.description, parameters: cap.parameters } }],
      tool_choice: { type: "function", function: { name: cap.name } },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const a = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!a) throw new Error("no tool call");
  return JSON.parse(a) as Record<string, unknown>;
}

// Reusable QA workspace (stable ids so both slices share it).
const SUB = "qa-battery-sub";
const AG = "qa-battery-ag";
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA Battery" }, { merge: true });
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA Battery", funnelsEnabledByAgency: true }, { merge: true });
const { getAdminAuth: _ } = { getAdminAuth };
let uid = "qa-battery-user";
try { await getAdminAuth().createUser({ uid, email: "qa-battery@test.local" }); } catch { /* exists */ }
const ctx = { uid, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as Ctx;

for (const s of S.filter((x) => x.n >= lo && x.n <= hi)) {
  try {
    const raw = await callModel(s.brief);
    const v = cap.validate!(raw);
    if (!v.ok) { console.log(`#${s.n} ${s.key} VALIDATE-FAIL ${JSON.stringify(v).slice(0, 200)}`); continue; }
    const result = await cap.execute!(ctx, v.args);
    const d = (await db.doc(`funnels/${result.ref!.id}`).get()).data()!;
    const sa = d.salesArgument ?? {};
    const secs = (d.sections ?? []).map((x: { type: string; argumentRole?: string }) => `${x.type}(${x.argumentRole ?? "-"})`).join(" ");
    const price = (v.args.priceCents as number | null) != null ? `$${((v.args.priceCents as number) / 100).toFixed(0)}` : "free";
    console.log(`#${s.n} ${s.key} | genre=${d.genre} depth=${d.persuasionDepth} cx=${d.decisionComplexity} | ${d.artDirection?.transformation}/${d.artDirection?.energy} | price=${price} form=${v.args.includeCaptureForm !== false} cta=${(v.args.ctaStyle as string) || "auto"} | chain=${(sa.beliefChain ?? []).length}`);
    console.log(`   promise: ${String(sa.corePromise ?? "").slice(0, 110)}`);
    console.log(`   chain:   ${(sa.beliefChain ?? []).join(" -> ").slice(0, 260)}`);
    console.log(`   secs(${(d.sections ?? []).length}): ${secs}`);
    await db.doc(`funnels/qa-bat-${s.key}`).set({ ...d, id: `qa-bat-${s.key}`, name: `[QA-BAT] ${d.name}`, status: "published" });
  } catch (e) {
    console.log(`#${s.n} ${s.key} ERROR: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
  }
}
process.exit(0);
