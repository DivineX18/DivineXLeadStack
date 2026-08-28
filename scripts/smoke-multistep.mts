// MULTISTEP JOURNEY E2E SMOKE (increment 4 — one-prompt orchestration).
// A real multi-turn agent loop: the production model gets ONE user prompt
// asking for a multistep funnel (magnet → paid offer) and the create_funnel
// tool. It must chain TWO calls itself — downstream offer first, then the
// magnet with bridge_next_funnel_id set from the Funnel ID in the first tool
// result. The script executes each call through the production capability
// and asserts the stored bridge link points the right way.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-multistep.mts
//       --cleanup removes the published QA docs.

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

if (process.argv.includes("--cleanup")) {
  const snap = await db.collection("funnels").where("subAccountId", ">=", "qa-multi-sub-").where("subAccountId", "<", "qa-multi-sub-").get();
  for (const d of snap.docs) await d.ref.delete();
  console.log(`Deleted ${snap.size} QA multistep funnels.`);
  process.exit(0);
}

let failures = 0;
const check = (l: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures++; };

// ── Production-equivalent context (same as benchmark-real) ──────────────────
const cards: string[] = [];
try {
  cards.push(...renderPrinciplesAsCards(await listActivePrinciplesForArchetype(null)));
} catch { /* no principles yet */ }
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
try {
  const { listAscendFrameworks, renderAscendFrameworksAsCards } = await import("../src/lib/conversion/ascend-frameworks");
  cards.push(...renderAscendFrameworksAsCards(await listAscendFrameworks()).map((c) => `${c.title}\n${c.body}`) as never[]);
} catch { /* no synced frameworks */ }

const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. " +
  "When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. " +
  "Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\n" +
  "REFERENCE MATERIAL (reason from these principles; never copy them verbatim):\n" +
  cards.join("\n");

const PROMPT =
  "Build me a multistep funnel for my pottery studio, Kiln & Clay in Austin. " +
  "Step 1: a free downloadable guide, '7 Beginner Pottery Mistakes (and how to fix them)' — people sign up with their email to get it. " +
  "Step 2: right after they sign up, I want them offered my $97 'First Wheel Weekend' beginner workshop (two 3-hour sessions, clay + firing included, max 8 people per class so everyone gets hands-on coaching). " +
  "Real facts: I've taught pottery for 12 years, the studio has 10 wheels, and beginners keep telling me they wish they'd started sooner. No testimonials collected yet.";

// ── QA workspace ────────────────────────────────────────────────────────────
const RUN = Date.now();
const SUB = `qa-multi-sub-${RUN}`;
const AG = `qa-multi-ag-${RUN}`;
const user = await auth.createUser({ email: `qa-multi-${RUN}@test.local` });
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA Multi" });
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA Multi", funnelsEnabledByAgency: true });
const ctx = { uid: user.uid, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as AiSuiteActionContext;

// ── Multi-turn agent loop ───────────────────────────────────────────────────
type Msg = Record<string, unknown>;
const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
const messages: Msg[] = [
  { role: "system", content: system },
  { role: "user", content: PROMPT },
];
const createdIds: string[] = [];
const argsById = new Map<string, Record<string, unknown>>();

for (let turn = 0; turn < 5; turn++) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: [{ type: "function", function: { name: cap.name, description: cap.description, parameters: cap.parameters } }],
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[];
  };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error("no message");
  const calls = msg.tool_calls ?? [];
  if (calls.length === 0) {
    console.log(`\n[turn ${turn}] model finished: ${String(msg.content ?? "").slice(0, 300)}`);
    break;
  }
  messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
  for (const call of calls) {
    const raw = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
    console.log(`\n[turn ${turn}] create_funnel: name=${String(raw.name ?? raw.headline ?? "").slice(0, 60)} genre=${raw.genre} bridge_next=${raw.bridge_next_funnel_id ?? "-"} price=${raw.price_cents ?? "-"}`);
    const v = cap.validate!(raw);
    let toolResult: string;
    if (!v.ok) {
      toolResult = `ERROR: ${v.error}`;
      console.log(`  validate failed: ${v.error}`);
    } else {
      try {
        const result = await cap.execute!(ctx, v.args);
        toolResult = result.resultText;
        if (result.ref?.id) {
          createdIds.push(result.ref.id);
          argsById.set(result.ref.id, raw);
        }
        console.log(`  → executed, funnel ${result.ref?.id}`);
      } catch (err) {
        toolResult = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        console.log(`  execute failed: ${toolResult.slice(0, 200)}`);
      }
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: toolResult });
  }
}

// ── Assertions on STORED docs ───────────────────────────────────────────────
console.log("\n════════ ASSERTIONS (stored docs, not model claims) ════════");
check("A. model chained exactly two create_funnel calls", createdIds.length === 2);

if (createdIds.length === 2) {
  const docs = await Promise.all(createdIds.map(async (id) => ({ id, data: (await db.doc(`funnels/${id}`).get()).data()! })));
  const magnet = docs.find((d) => d.data.bridge?.nextFunnelId);
  const offer = docs.find((d) => !d.data.bridge?.nextFunnelId);
  check("B. exactly one funnel carries the bridge link", !!magnet && !!offer && magnet.id !== offer.id);
  check("C. bridge points at the OTHER created funnel", magnet?.data.bridge?.nextFunnelId === offer?.id);
  const offerPriced = (offer?.data.sections ?? []).some((s: { config?: { priceCents?: number } }) => (s.config?.priceCents ?? 0) > 0);
  const magnetFree = !(magnet?.data.sections ?? []).some((s: { config?: { priceCents?: number } }) => (s.config?.priceCents ?? 0) > 0);
  check("D. direction correct: FREE magnet bridges to PAID offer", offerPriced && magnetFree);
  check("E. both funnels have a sales argument stored", !!magnet?.data.salesArgument?.beliefChain?.length && !!offer?.data.salesArgument?.beliefChain?.length);

  // Publish IN PLACE (bridge links reference real ids, so copies would break the chain).
  for (const d of docs) await db.doc(`funnels/${d.id}`).update({ status: "published" });
  console.log(`\nLive QA journey:`);
  console.log(`  magnet:   /lp/${magnet?.id}`);
  console.log(`  thanks:   /lp/${magnet?.id}/thanks   (should show download-default copy + next-offer card)`);
  console.log(`  offer:    /lp/${offer?.id}`);
}

console.log(`\nQA workspace: sub=${SUB} agency=${AG} user=${user.uid}`);
console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
process.exit(failures > 0 ? 1 : 0);
