// STEP 3 — REAL MODEL-DRIVEN BENCHMARK (no fixtures, no forced strategy).
// Generates funnels through the production reasoning path: the REAL model
// (production default, haiku-4.5 via OpenRouter) receives the production
// context — the create_funnel tool schema, the Conversion Framework Library
// cards, and any learned design principles — plus a plain business brief a
// real user would type. The model must construct the SalesArgumentPlan,
// depth/complexity signals, copy, and design choices ITSELF; the script only
// validates + executes the returned tool call and prints the STORED trace.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/benchmark-real.mts
// Docs: published QA copies land at funnels/qa-real-{hvac,dental} for
//       rendering/screenshots; --cleanup removes them.

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { CONVERSION_FRAMEWORKS, renderFrameworksAsCards } = await import("../src/lib/conversion/framework-library");
const { listActivePrinciplesForArchetype, renderPrinciplesAsCards } = await import("../src/lib/design-intelligence/principles");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const db = getAdminDb();
const auth = getAdminAuth();
const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;

const BENCH = [
  {
    key: "hvac",
    qaId: "qa-real-hvac",
    brief:
      "Build a funnel for Summit HVAC in Phoenix, Arizona. We do emergency AC repair — same-day service. Almost all our customers find us on Google searching things like 'emergency AC repair near me' when their AC dies in extreme heat. Real facts about us you can use: a live dispatcher answers 24/7 (never voicemail), we quote a flat price and get approval BEFORE any work starts, our trucks carry the common failure parts so most repairs finish in one visit, we're licensed and insured, and nights/weekends cost the same as weekdays. We don't have customer testimonials collected yet. Our phone number is +16025550142.",
  },
  {
    key: "dental",
    qaId: "qa-real-dental",
    brief:
      "Build a funnel for Lakeside Family Dental. We want new patients to book a first cleaning + exam. Our specialty is anxious patients — people who've been avoiding the dentist for years because they dread the lecture, feel embarrassed about the gap, worry about pain, or hate feeling out of control in the chair. Real facts: we talk before we treat (first minutes are a conversation), we explain every instrument and step before it happens, patients can raise a hand and we stop immediately, numbing and pacing are set by the patient's comfort, and you see the same team every visit. New patients mostly find us via Google searching for a dentist. We don't have publishable testimonials yet. Booking is through our online form.",
  },
];

if (process.argv.includes("--cleanup")) {
  for (const b of BENCH) await db.doc(`funnels/${b.qaId}`).delete().catch(() => {});
  console.log("QA docs deleted.");
  process.exit(0);
}

// ── Production-equivalent reference context ─────────────────────────────────
const cards: string[] = [];
try {
  const principles = await listActivePrinciplesForArchetype(null);
  cards.push(...renderPrinciplesAsCards(principles));
} catch { /* no principles yet */ }
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));

const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. " +
  "When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. " +
  "Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\n" +
  "REFERENCE MATERIAL (reason from these principles; never copy them verbatim):\n" +
  cards.join("\n");

async function callModel(brief: string): Promise<Record<string, unknown>> {
  const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: brief },
      ],
      tools: [{ type: "function", function: { name: cap.name, description: cap.description, parameters: cap.parameters } }],
      tool_choice: { type: "function", function: { name: cap.name } },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const argStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argStr) throw new Error("model returned no tool call");
  return JSON.parse(argStr) as Record<string, unknown>;
}

// ── QA workspace ────────────────────────────────────────────────────────────
const RUN = Date.now();
const SUB = `qa-real-sub-${RUN}`;
const AG = `qa-real-ag-${RUN}`;
const user = await auth.createUser({ email: `qa-real-${RUN}@test.local` });
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA Real" });
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA Real", funnelsEnabledByAgency: true });
const ctx = { uid: user.uid, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as AiSuiteActionContext;

function printTrace(data: Record<string, never> | any) {
  const sa = data.salesArgument ?? {};
  console.log(`  genre=${data.genre}  archetype=${data.designStrategy?.visualArchetype}  palette=${data.designStrategy?.paletteId}`);
  console.log(`  persuasionDepth=${data.persuasionDepth}  decisionComplexity=${data.decisionComplexity}`);
  console.log(`  artDirection=${JSON.stringify(data.artDirection)}`);
  console.log(`  ── SalesArgumentPlan (stored) ──`);
  console.log(`  prospect:        ${sa.prospect ?? "(none)"}`);
  console.log(`  arrivalContext:  ${sa.arrivalContext ?? ""}`);
  console.log(`  currentBelief:   ${sa.currentBelief ?? ""}`);
  console.log(`  beliefChain:${(sa.beliefChain ?? []).map((b: string, i: number) => `\n     ${i + 1}. ${b}`).join("")}`);
  console.log(`  oldWay:          ${sa.oldWay ?? ""}`);
  console.log(`  whyOldWayFails:  ${sa.whyOldWayFails ?? ""}`);
  console.log(`  mechanism:       ${sa.mechanism ?? ""}`);
  console.log(`  corePromise:     ${sa.corePromise ?? ""}`);
  console.log(`  primaryObjection:${sa.primaryObjection ?? ""}`);
  console.log(`  riskReversal:    ${sa.riskReversal ?? ""}`);
  console.log(`  closeReason:     ${sa.closeReason ?? ""}`);
  console.log(`  ── Sections (stored) ──`);
  for (const s of data.sections ?? []) {
    const c = s.config ?? {};
    const evidence = c.headline || c.problemHeadline || (Array.isArray(c.items) && c.items.length ? `${c.items.length} items` : "") || (Array.isArray(c.bullets) && c.bullets.length ? c.bullets.join("; ") : "") || (Array.isArray(c.paragraphs) && c.paragraphs.length ? `${c.paragraphs.length} paragraphs` : "");
    console.log(`  [${s.type}] role=${s.argumentRole ?? "-"} canvas=${s.canvas ?? "-"} variant=${c.variant ?? "-"}`);
    console.log(`     serves: ${s.servesBelief ?? "-"}`);
    if (evidence) console.log(`     copy:   ${String(evidence).slice(0, 100)}`);
  }
}

try {
  for (const b of BENCH) {
    console.log(`\n════════ ${b.key.toUpperCase()} — real model generation ════════`);
    const raw = await callModel(b.brief);
    const v = cap.validate!(raw);
    if (!v.ok) { console.log(`VALIDATE FAILED: ${JSON.stringify(v).slice(0, 400)}`); continue; }
    const result = await cap.execute!(ctx, v.args);
    const doc = (await db.doc(`funnels/${result.ref!.id}`).get()).data()!;
    printTrace(doc);
    // Publish a QA copy for rendering/screenshots (same doc, published).
    await db.doc(`funnels/${b.qaId}`).set({ ...doc, id: b.qaId, name: `[QA-REAL] ${doc.name}`, status: "published" });
    console.log(`  → published copy: /lp/${b.qaId}`);
  }
} finally {
  // Keep the QA sub-account alive so forms referenced by the published copies
  // still resolve for rendering; record ids for later cleanup.
  console.log(`\nQA workspace (leave until screenshots done): sub=${SUB} agency=${AG} user=${user.uid}`);
}
process.exit(0);
