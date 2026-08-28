// BUSINESS REALITY ENGINE — A/B/C certification generator.
// For each of the four probes (spending-reset, skincare, dentist,
// enterprise-security) generates:
//   B = BRE with a realistic WORKSPACE (name + contact — what every real
//       deployment has) and NO supplied assets: must compose gracefully.
//   C = BRE with real-asset FIXTURES supplied the way a customer would —
//       in the brief (logo URL, product photo URL, rating, credentials,
//       address). Fixture image URLs are fetched live from Pexels at run
//       time (stable CDN links standing in for "the customer's own photo").
// A = the existing [v6] baselines, already live (screenshotted separately).
// Each variant runs in its OWN QA sub-account so workspace identity is
// per-business, exactly like real deployments.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/bre-certify.mts
//       --cleanup removes all qa-bre-* workspaces' funnels.

import { readFileSync, writeFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { CONVERSION_FRAMEWORKS, renderFrameworksAsCards } = await import("../src/lib/conversion/framework-library");
const { listActivePrinciplesForArchetype, renderPrinciplesAsCards } = await import("../src/lib/design-intelligence/principles");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { searchSubjectImages, imageryConfigured } = await import("../src/lib/funnels/imagery");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const db = getAdminDb();
const auth = getAdminAuth();
const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;

if (process.argv.includes("--cleanup")) {
  for (const col of ["funnels", "forms", "workflows", "message_templates"]) {
    const snap = await col ? await db.collection(col).where("subAccountId", ">=", "qa-bre-").where("subAccountId", "<=", "qa-bre-zzzz").get() : null;
    if (snap) { for (const d of snap.docs) await d.ref.delete(); console.log(`${col}: ${snap.size}`); }
  }
  process.exit(0);
}

// ── Live fixture assets (Pexels CDN links standing in for customer uploads) ──
const fixture = async (q: string) => (imageryConfigured() ? (await searchSubjectImages(q, 1))[0]?.url ?? "" : "");
const FIX = {
  skincareProduct: await fixture("cosmetic cream jar white background"),
  skincareFounder: await fixture("woman scientist laboratory portrait"),
  dentistPortrait: await fixture("dentist portrait smiling"),
  guideAuthor: await fixture("professional woman portrait office"),
  secTeam: await fixture("engineer team office meeting"),
};
console.log("fixtures:", JSON.stringify(FIX, null, 1));

interface Probe {
  key: string;
  workspace: { name: string; businessName: string; email: string; phone: string };
  briefB: string;
  briefC: string;
}
const PROBES: Probe[] = [
  {
    key: "spending-reset",
    workspace: { name: "Reset Money Co", businessName: "Reset Money", email: "hello@resetmoney.co", phone: "" },
    briefB:
      "I'm a personal finance content creator. I want a funnel for my free '7-Day Spending Reset' PDF guide. Cold Instagram/Reels traffic. My audience feels like money disappears every month; they aren't looking for financial planning. I want email signups.",
    briefC:
      `I'm Maya Torres, a personal finance content creator (brand: Reset Money). I want a funnel for my free '7-Day Spending Reset' PDF guide. Cold Instagram/Reels traffic; audience feels like money disappears every month. I want email signups. Real assets you can use: my author photo is at ${FIX.guideAuthor} (real photo of me, fine to show with my name), and my one-line bio is 'Maya Torres, creator of Reset Money — budgeting content followed by 120k people on Instagram' (that follower count is real, from my profile).`,
  },
  {
    key: "skincare",
    workspace: { name: "Calma Skincare", businessName: "Calma Skincare", email: "care@calmaskin.com", phone: "" },
    briefB:
      "We're a skincare company for sensitive skin. Funnel selling our $39 Sensitive Skin Starter Kit. Cold Meta ads. Buyers are skeptical because previous products irritated their skin. Goal: purchase.",
    briefC:
      `We're Calma Skincare, a sensitive-skin skincare company. Funnel selling our $39 Sensitive Skin Starter Kit. Cold Meta ads; buyers are skeptical because previous products irritated their skin. Goal: purchase. Real assets: product photo at ${FIX.skincareProduct} (our actual kit shot), founder photo at ${FIX.skincareFounder} — that's our founder-formulator Dr. Lena Park, and her line 'Formulated by Dr. Lena Park, cosmetic chemist' is accurate. Our ingredient policy is real: fragrance-free, essential-oil-free, alcohol-free, full ingredient list printed on every box. We ship free over $35 and accept returns within 30 days (that IS our real returns policy, fine to state).`,
  },
  {
    key: "dentist",
    workspace: { name: "Heights Gentle Dental", businessName: "Heights Gentle Dental", email: "front@heightsgentledental.com", phone: "+17135550188" },
    briefB:
      "I run a local dental practice. Funnel for our new-patient exam, high-intent Google traffic. Target patients avoid the dentist from anxiety, fear of pain, embarrassment, fear of judgment. Our real differentiator: anxious patients control the pace and communication. Goal: book an appointment.",
    briefC:
      `I run Heights Gentle Dental in Houston Heights. Funnel for our new-patient exam, high-intent Google traffic. Target patients avoid the dentist from anxiety, fear of pain, embarrassment, judgment. Our real differentiator: anxious patients control the pace and communication. Goal: book an appointment. Real assets: our Google rating is 4.9 from 287 reviews (profile: https://g.page/heights-gentle-dental), dentist photo at ${FIX.dentistPortrait} — that's Dr. Jane Smith, DDS, and 'Dr. Jane Smith, DDS — helping anxious patients feel comfortable since 2018' is accurate. We're at 1420 Yale St, Houston, TX. ADA member practice (real membership).`,
  },
  {
    key: "enterprise-security",
    workspace: { name: "Vantyr Security", businessName: "Vantyr", email: "security@vantyr.io", phone: "" },
    briefB:
      "We're an enterprise cybersecurity software company; contracts $100k+ annually. Funnel for branded/high-intent search. Buyers understand the category and compare vendors; security, IT, ops, procurement, leadership all involved. Path: demo, technical evaluation, sales.",
    briefC:
      `We're Vantyr, an enterprise cybersecurity software company; contracts $100k+ annually. Funnel for branded/high-intent search. Buyers compare vendors; security, IT, ops, procurement, leadership all involved. Path: demo, technical evaluation, sales. Real assets: we hold SOC 2 Type II and ISO 27001 (both current, fine to state), our evaluation team photo is at ${FIX.secTeam} (our actual detection engineering team), and our evaluations are led by our co-founder Priya Nair, formerly detection lead at a Fortune 100 bank (accurate, on her LinkedIn). HQ: Austin, TX.`,
  },
];

// ── context ──
const cards: string[] = [];
try { cards.push(...renderPrinciplesAsCards(await listActivePrinciplesForArchetype(null))); } catch { /* none */ }
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
try {
  const { listAscendFrameworks, renderAscendFrameworksAsCards } = await import("../src/lib/conversion/ascend-frameworks");
  cards.push(...renderAscendFrameworksAsCards(await listAscendFrameworks()).map((c) => `${c.title}\n${c.body}`) as never[]);
} catch { /* none */ }
const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. " +
  "When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. " +
  "Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\n" +
  "REFERENCE MATERIAL (reason from these principles; never copy them verbatim):\n" + cards.join("\n");

const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
const user = await auth.createUser({ email: `qa-bre-${Date.now()}@test.local` });
const results: Record<string, string> = {};

const onlyD = process.argv.includes("--evidence-pass");
for (const probe of PROBES) {
  for (const variant of (onlyD ? (["d"] as const) : (["b", "c"] as const))) {
    const SUB = `qa-bre-${probe.key}-${variant}`;
    await db.doc(`agencies/qa-bre-ag`).set({ id: "qa-bre-ag", name: "QA BRE" });
    await db.doc(`subAccounts/${SUB}`).set({
      id: SUB, agencyId: "qa-bre-ag", name: probe.workspace.name, funnelsEnabledByAgency: true,
      accountContact: { name: null, email: probe.workspace.email, phone: probe.workspace.phone || null },
    });
    await db.doc(`subAccounts/${SUB}/aiAgent/profile`).set({ businessName: probe.workspace.businessName });
    const ctx = { uid: user.uid, subAccountId: SUB, agencyId: "qa-bre-ag", subAccountRole: "subAccountAdmin" } as unknown as AiSuiteActionContext;
    const brief = variant === "b" ? probe.briefB : probe.briefC; // "d" = same fixtures as C, new engine

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
    if (!res.ok) { console.log(`${probe.key}-${variant}: OpenRouter ${res.status}`); continue; }
    const json = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
    const argStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argStr) { console.log(`${probe.key}-${variant}: no tool call`); continue; }
    const v = cap.validate!(JSON.parse(argStr));
    if (!v.ok) { console.log(`${probe.key}-${variant}: validate — ${v.error}`); continue; }
    try {
      const result = await cap.execute!(ctx, v.args);
      const id = result.ref!.id;
      await db.doc(`funnels/${id}`).update({ status: "published" });
      results[`${probe.key}-${variant}`] = id;
      console.log(`${probe.key}-${variant}: /lp/${id}`);
    } catch (err) {
      console.log(`${probe.key}-${variant}: execute — ${err instanceof Error ? err.message : err}`);
    }
  }
}

{
  let prior: Record<string, string> = {};
  try { prior = JSON.parse(readFileSync(new URL("../.bre-certify.json", import.meta.url), "utf8")); } catch { /* first run */ }
  writeFileSync(new URL("../.bre-certify.json", import.meta.url), JSON.stringify({ ...prior, ...results }, null, 2));
}
console.log("\nRESULTS:", JSON.stringify(results, null, 2));
process.exit(0);
