// FLOW 10-CUSTOMER STRESS TEST — production generation path, zero fixtures.
// Each scenario is a natural-language business brief (facts only, no
// architecture prescribed). The production model gets the production system
// context + the real create_funnel / link_funnel_steps / check_funnel_status
// tools with tool_choice AUTO, in a multi-turn loop — whatever it decides is
// what ships. Results (stored docs + workflows + templates + forms) are
// dumped to a JSON report for inspection; funnels are published in place so
// /lp/{id} renders live.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/stress10.mts
//       --cleanup deletes everything created by prior stress10 runs.

import { readFileSync, writeFileSync } from "node:fs";
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
const TOOLS = ["create_funnel", "link_funnel_steps", "check_funnel_status"]
  .map((n) => AI_SUITE_CAPABILITIES.find((c) => c.name === n)!)
  .filter(Boolean);
const capByName = new Map(TOOLS.map((c) => [c.name, c]));

const SUB = "qa-stress10-sub";
const AG = "qa-stress10-ag";

if (process.argv.includes("--cleanup")) {
  for (const col of ["funnels", "workflows", "forms", "message_templates"]) {
    const snap = await db.collection(col).where("subAccountId", "==", SUB).get();
    for (const d of snap.docs) await d.ref.delete();
    console.log(`${col}: deleted ${snap.size}`);
  }
  process.exit(0);
}

const SCENARIOS: { key: string; brief: string }[] = [
  {
    key: "1-lead-magnet",
    brief:
      "I'm a personal finance content creator. I want a funnel for my free '7-Day Spending Reset' PDF guide. I'll be sending cold traffic from Instagram and Reels. My audience is people who feel like their money just disappears every month — they aren't out looking for financial planning, they just feel that end-of-month squeeze. I want email signups.",
  },
  {
    key: "2-assessment",
    brief:
      "I'm a business growth consultant. I want a funnel for my free 'Growth Bottleneck Scorecard' — a self-assessment that helps a business owner figure out whether their growth stall is a traffic problem, a conversion problem, a sales problem, an operations problem, or a retention problem. Traffic will be LinkedIn and organic. The people coming know growth has stalled but don't know why. After the assessment I'd like the door open to a strategy call with me.",
  },
  {
    key: "3-ecom-skincare",
    brief:
      "We're a skincare company for sensitive skin. I want a funnel selling our $39 Sensitive Skin Starter Kit. We'll run cold Meta ads. Our buyers already know products like ours exist — the problem is they're skeptical because previous products have irritated their skin before. The goal is the purchase.",
  },
  {
    key: "4-webinar",
    brief:
      "I'm a tax strategist who works with established small businesses. I want a registration funnel for my free live webinar: '5 Tax Mistakes Costing 6-Figure Businesses Money'. Traffic is cold LinkedIn and Meta ads. My audience is business owners who suspect they might be overpaying on taxes but are rightly skeptical of aggressive tax-savings promises. After the webinar I offer a consultation.",
  },
  {
    key: "5-coaching",
    brief:
      "I'm an executive career coach. I want a funnel for my $4,500 twelve-week leadership acceleration program. Cold Meta traffic. My people are mid-career managers and directors who feel professionally stuck and are skeptical of generic career coaching. I want applications — I qualify applicants and then get on a call with the ones who fit.",
  },
  {
    key: "6-dentist",
    brief:
      "I run a local dental practice. I want a funnel for our new-patient exam. Traffic is high-intent Google search. The patients I most want to reach have been avoiding the dentist for years — anxiety, fear of pain, embarrassment about how their teeth look, fear of being judged or lectured. What makes us different is that we intentionally give anxious patients more control over the pace and communication during their visit. Goal: book an appointment.",
  },
  {
    key: "7-hvac",
    brief:
      "We're an HVAC company in Phoenix. I want a funnel for same-day emergency AC repair. Traffic is high-intent Google search — the person's AC isn't cooling RIGHT NOW in the heat. What matters to them: speed, trust, availability, knowing what happens next, and not getting surprise costs. True facts about us you can use: a real dispatcher answers the phone during operating hours; same-day appointments may be available depending on capacity; we give pricing before any repair work begins. Goal: phone call or service request.",
  },
  {
    key: "8-b2b-warehouse",
    brief:
      "We're a warehouse automation integrator — implementations run $75,000 to $250,000. I want a funnel for cold outbound and LinkedIn traffic. Our buyers are operations executives responsible for throughput, labor efficiency, implementation risk, and keeping operations running during a rollout. Several stakeholders are usually involved in the decision. The conversion we want is a site assessment / discovery engagement.",
  },
  {
    key: "9-enterprise-saas",
    brief:
      "We're an enterprise cybersecurity software company — typical contracts are $100,000+ annually. I want a funnel for branded and high-intent search traffic. These buyers already understand the category and are often comparing vendors. Security, IT, operations, procurement, and leadership can all be involved. The conversion path is demo, then technical evaluation, then the sales process.",
  },
  {
    key: "10-nonprofit",
    brief:
      "We're a children's literacy nonprofit. I want a donation funnel for a recurring $25/month gift. Traffic is cold social — story-driven. The people arriving are emotionally receptive but have never heard of us. Donations support children's literacy programs — that's the true fact you can build on. Goal: recurring donation signups.",
  },
];

const only = process.argv.find((x) => x.startsWith("--only="))?.slice(7)?.split(",") ?? null;
const RUN_SCENARIOS = only ? SCENARIOS.filter((sc) => only.some((o) => sc.key.startsWith(o))) : SCENARIOS;

// ── Production-equivalent system context ────────────────────────────────────
const cards: string[] = [];
try {
  cards.push(...renderPrinciplesAsCards(await listActivePrinciplesForArchetype(null)));
} catch { /* none yet */ }
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. " +
  "When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. " +
  "Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\n" +
  "REFERENCE MATERIAL (reason from these principles; never copy them verbatim):\n" +
  cards.join("\n");

// ── QA workspace (stable ids so --cleanup can find everything) ──────────────
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA Stress10" });
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA Stress10", funnelsEnabledByAgency: true });
const user = await auth.createUser({ email: `qa-stress10-${Date.now()}@test.local` }).catch(async () => {
  const list = await auth.getUserByEmail("qa-stress10@test.local").catch(() => null);
  return list ?? auth.createUser({ email: "qa-stress10@test.local" });
});
const ctx = { uid: user.uid, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as AiSuiteActionContext;

const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
type Msg = Record<string, unknown>;

interface ScenarioResult {
  key: string;
  funnelIds: string[];
  toolCalls: { name: string; ok: boolean; note: string }[];
  finalReply: string;
  error?: string;
}
const results: ScenarioResult[] = [];

for (const sc of RUN_SCENARIOS) {
  console.log(`\n════════ ${sc.key} ════════`);
  const r: ScenarioResult = { key: sc.key, funnelIds: [], toolCalls: [], finalReply: "" };
  results.push(r);
  const messages: Msg[] = [
    { role: "system", content: system },
    { role: "user", content: sc.brief },
  ];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOLS.map((c) => ({ type: "function", function: { name: c.name, description: c.description, parameters: c.parameters } })),
          max_tokens: 8000,
        }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[];
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("no message");
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        r.finalReply = String(msg.content ?? "").slice(0, 1500);
        break;
      }
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name ?? "?";
        const cap = capByName.get(name);
        let toolResult = `ERROR: unknown tool ${name}`;
        let ok = false;
        let note = "";
        if (cap) {
          try {
            const raw = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
            const v = cap.validate!(raw);
            if (!v.ok) {
              toolResult = `ERROR: ${v.error}`;
              note = `validate: ${v.error}`;
            } else {
              const result = await cap.execute!(ctx, v.args);
              toolResult = result.resultText;
              ok = true;
              if (name === "create_funnel" && result.ref?.id) {
                r.funnelIds.push(result.ref.id);
                note = `created ${result.ref.id}`;
              } else note = toolResult.slice(0, 100);
            }
          } catch (err) {
            toolResult = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
            note = toolResult.slice(0, 150);
          }
        }
        console.log(`  [t${turn}] ${name}: ${ok ? "ok" : "FAIL"} ${note.slice(0, 110)}`);
        r.toolCalls.push({ name, ok, note });
        messages.push({ role: "tool", tool_call_id: call.id, content: toolResult });
      }
    }
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    console.log(`  SCENARIO ERROR: ${r.error}`);
  }
}

// ── Publish + dump everything for inspection ────────────────────────────────
const report: Record<string, unknown>[] = [];
for (const r of results) {
  const entry: Record<string, unknown> = { key: r.key, toolCalls: r.toolCalls, error: r.error ?? null, funnels: [] };
  report.push(entry);
  for (const id of r.funnelIds) {
    const snap = await db.doc(`funnels/${id}`).get();
    if (!snap.exists) continue;
    const d = snap.data()!;
    await snap.ref.update({ status: "published" });
    // associated workflow (trigger.formId ∈ this funnel's section formIds)
    const formIds = new Set<string>();
    for (const s of d.sections ?? []) {
      const c = s.config ?? {};
      if (c.formId) formIds.add(c.formId);
      for (const t of c.tiers ?? []) if (t.formId) formIds.add(t.formId);
    }
    const wfSnap = await db.collection("workflows").where("subAccountId", "==", SUB).get();
    const workflows = wfSnap.docs
      .map((w) => ({ id: w.id, ...w.data() }) as Record<string, unknown>)
      .filter((w) => formIds.has((w.trigger as { formId?: string } | undefined)?.formId ?? ""));
    entry.funnels = [
      ...(entry.funnels as unknown[]),
      {
        id,
        url: `/lp/${id}`,
        name: d.name,
        genre: d.genre,
        persuasionDepth: d.persuasionDepth,
        decisionComplexity: d.decisionComplexity,
        artDirection: d.artDirection,
        bridge: d.bridge ?? null,
        salesArgument: d.salesArgument
          ? { beliefChain: d.salesArgument.beliefChain, corePromise: d.salesArgument.corePromise, primaryObjection: d.salesArgument.primaryObjection }
          : null,
        sections: (d.sections ?? []).map((s: { type: string; canvas?: string; argumentRole?: string; servesBelief?: string; config?: Record<string, unknown> }) => ({
          type: s.type,
          canvas: s.canvas ?? null,
          role: s.argumentRole ?? null,
          serves: s.servesBelief ?? null,
          headline: (s.config?.headline as string) ?? (s.config?.problemHeadline as string) ?? null,
          cta: (s.config?.ctaLabel as string) ?? null,
          priceCents: (s.config?.priceCents as number) ?? null,
        })),
        workflows: workflows.map((w) => ({
          id: w.id,
          name: w.name,
          trigger: w.trigger,
          nodes: Object.values((w.nodes ?? {}) as Record<string, { type: string; config?: Record<string, unknown> }>).map((n) => ({
            type: n.type,
            subject: n.config?.subject ?? null,
            bodyPreview: typeof n.config?.body === "string" ? (n.config.body as string).slice(0, 400) : null,
            seconds: n.config?.seconds ?? null,
            tag: n.config?.tag ?? null,
          })),
        })),
      },
    ];
  }
}
const outPath = new URL(only ? "../.stress10-verify.json" : "../.stress10-report.json", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReport: ${outPath}`);
for (const r of results) {
  console.log(`${r.key}: ${r.funnelIds.map((id) => `https://crm.divinex.io/lp/${id}`).join("  ") || "NO FUNNEL"}${r.error ? `  ERROR: ${r.error}` : ""}`);
}
process.exit(0);
