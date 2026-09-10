/**
 * Fresh generation through the REAL customer-facing creation path, for the
 * pre-beta P1-A repair. Real model, real create_funnel validate() +
 * execute(), real Firestore, no forced architecture: the model picks genre,
 * depth, complexity, copy and design itself, exactly as it does for a
 * customer talking to Zeno.
 *
 * Four commercial shapes, because the defect was commercial, not cosmetic:
 *   A  free lead magnet / assessment
 *   B  standalone lead generation
 *   C  paid offer
 *   D  paid checkout chain with a legitimate configured upsell
 *
 * Publishes QA copies at funnels/qa-p1-<key> so the pages can be looked at.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-prebeta-generation.mts
 *      ... --cleanup   removes the QA docs
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { CONVERSION_FRAMEWORKS, renderFrameworksAsCards } = await import("../src/lib/conversion/framework-library");
const { listActivePrinciplesForArchetype, renderPrinciplesAsCards } = await import("../src/lib/design-intelligence/principles");
const { createFunnelServerSide, updateFunnelServerSide, FunnelValidationError } = await import("../src/lib/server/funnels-service");
const { evaluateSections } = await import("../src/lib/funnels/section-completeness");
const { invalidChainSections } = await import("../src/lib/funnels/commercial-structure");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
type Ctx = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const db = getAdminDb();
const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;

const SCENARIOS = [
  {
    key: "A-free-assessment",
    label: "A. Free lead magnet / assessment",
    paid: false,
    brief:
      "Build a funnel for Beacon Digital, a web agency, offering a FREE website growth assessment: the visitor submits their site and gets back a scored report on what is costing them customers. Traffic is LinkedIn posts to local service-business owners. Real facts: the assessment checks 12 conversion factors and the report ranks the 3 highest-impact fixes first. It is free, there is nothing to buy on this page. No testimonials to publish.",
  },
  {
    key: "B-lead-gen",
    label: "B. Standalone lead generation",
    paid: false,
    brief:
      "Build a funnel for Copperline Roofing offering a free roof inspection for homeowners in Raleigh who suspect storm damage. Traffic is Google search for storm damage roof inspection. Real facts: licensed and insured, inspection takes about 45 minutes, they photograph everything and hand over the report whether or not the homeowner hires them, and they work directly with insurance adjusters. The next step is booking the inspection. No testimonials cleared for publishing.",
  },
  {
    key: "C-paid-offer",
    label: "C. Paid offer",
    paid: true,
    brief:
      "Build a funnel selling a $97 live workshop, 'Notion for Freelancers', by operations coach Riley Chen, a 3-hour live session teaching freelancers to run their whole business from one Notion workspace. Traffic is Riley's YouTube audience. Real facts: the live 3-hour session, a pack of 9 Notion templates, and a recording. Runs the first Saturday of next month. No testimonials to publish.",
  },
  {
    key: "D-paid-chain",
    label: "D. Paid checkout chain (parent of a real upsell)",
    paid: true,
    brief:
      "Build a funnel selling the Cascade Pour-Over Set, a $29 ceramic pour-over coffee brewer with a reusable steel filter, sold direct from Instagram ads to home coffee drinkers. Real facts: the ceramic body holds water temperature steady during the pour, the steel micro-filter means no paper waste, it is dishwasher safe, and it ships in 3 days from Portland. No reviews collected yet.",
  },
];

if (process.argv.includes("--cleanup")) {
  for (const s of SCENARIOS) await db.doc(`funnels/qa-p1-${s.key}`).delete().catch(() => {});
  await db.doc("funnels/qa-p1-D-upsell-step").delete().catch(() => {});
  console.log("QA docs deleted");
  process.exit(0);
}

const cards: string[] = [];
try { cards.push(...renderPrinciplesAsCards(await listActivePrinciplesForArchetype(null))); } catch {}
cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
const system =
  "You are Zeno, the conversion strategist and funnel builder inside DivineX Flow. When the user asks you to build a funnel, call the create_funnel tool with COMPLETE arguments — you are the strategist, copy chief, offer architect, and creative director. Never fabricate testimonials, statistics, guarantees, scarcity, or credentials the user didn't give you.\n\nREFERENCE MATERIAL (reason from these principles; never copy verbatim):\n" +
  cards.join("\n");

async function callModel(brief: string, repair?: string): Promise<Record<string, unknown>> {
  const model = process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || "anthropic/claude-haiku-4-5";
  const messages: { role: string; content: string }[] = [
    { role: "system", content: system },
    { role: "user", content: brief },
  ];
  if (repair) messages.push({ role: "user", content: `The tool rejected your arguments: ${repair}\nFix them and call create_funnel again.` });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: [{ type: "function", function: { name: cap.name, description: cap.description, parameters: cap.parameters } }],
      tool_choice: { type: "function", function: { name: cap.name } },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const a = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!a) throw new Error("no tool call returned");
  return JSON.parse(a) as Record<string, unknown>;
}

const SUB = "qa-p1-sub";
const AG = "qa-p1-ag";
await db.doc(`agencies/${AG}`).set({ id: AG, name: "QA P1" }, { merge: true });
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AG, name: "QA P1", funnelsEnabledByAgency: true }, { merge: true });
const uid = "qa-p1-user";
try { await getAdminAuth().createUser({ uid, email: "qa-p1@test.local" }); } catch { /* exists */ }
const ctx = { uid, subAccountId: SUB, agencyId: AG, subAccountRole: "subAccountAdmin" } as unknown as Ctx;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Copy that stops mid-thought, the truncation symptom. */
const PLACEHOLDER_RE = /testingtesting|lorem ipsum|\[YEAR\]|\[CITY\]|\[NAME\]|\[Your Company\]|write your headline|TODO|xxx+/i;
const TRAILING_CUT_RE = /\b(for|and|to|of|with|the|a|an|in|on|that|your|plus|from|by|into|at|as)\s*$/i;

const built: { key: string; label: string; id: string; paid: boolean }[] = [];

for (const s of SCENARIOS) {
  console.log(`\n── ${s.label} ──`);
  try {
    let raw = await callModel(s.brief);
    let v = cap.validate!(raw);
    if (!v.ok) {
      // A validation error is an instruction to the author, which is the whole
      // point of the truncation fix. Give it one repair hop, as production does.
      console.log(`   (repair hop: ${String((v as { error?: string }).error ?? "").slice(0, 120)})`);
      raw = await callModel(s.brief, String((v as { error?: string }).error ?? ""));
      v = cap.validate!(raw);
    }
    if (!v.ok) { check("validate() accepts the model's arguments", false, JSON.stringify(v).slice(0, 200)); continue; }

    const result = await cap.execute!(ctx, v.args);
    const id = result.ref!.id;
    const d = (await db.doc(`funnels/${id}`).get()).data()! as Record<string, unknown>;
    const sections = (d.sections ?? []) as { id: string; type: string; canvas?: string; config: Record<string, unknown> }[];
    built.push({ key: s.key, label: s.label, id, paid: s.paid });

    console.log(
      `   genre=${d.genre} depth=${d.persuasionDepth} cx=${d.decisionComplexity} chainRole=${d.chainRole} price=${s.paid ? "paid" : "free"}`,
    );
    console.log(`   sections(${sections.length}): ${sections.map((x) => `${x.type}[${x.canvas ?? "-"}]`).join(" > ")}`);

    // ── structure ──
    check("art direction was stored", !!d.artDirection);
    check("the Critic reviewed the finished page", !!d.criticVerdict, d.criticVerdict ? `verdict=${(d.criticVerdict as { verdict?: string }).verdict}` : "no verdict");
    check("a hero opens the page", sections[0]?.type === "hero");

    // ── canvas / art direction ──
    const missingCanvas = sections.filter((x) => x.type !== "hero" && !x.canvas);
    check(
      "every rendered beat below the hero has a canvas",
      missingCanvas.length === 0,
      missingCanvas.map((x) => x.type).join(",") || "none missing",
    );
    // The story-fold law governs STORY BEATS. The hero paints its own
    // gradient and business_footer is the identity signature the page ends
    // on, not a beat in the argument, so neither participates.
    const below = sections.filter((x) => x.type !== "hero" && x.type !== "business_footer");
    let clash = "";
    for (let i = 1; i < below.length; i++) if (below[i].canvas && below[i].canvas === below[i - 1].canvas) clash = `${below[i - 1].type}/${below[i].type}=${below[i].canvas}`;
    check("no two adjacent story beats share a surface", clash === "", clash);

    // ── empty folds ──
    const blanks = evaluateSections(sections as never).filter((e) => e.state === "empty");
    check("no empty section survived to the page", blanks.length === 0, blanks.map((b) => `${b.sectionType}: ${b.reason}`).join(" | "));
    const dupEmptyProof = sections.filter(
      (x) => x.type === "proof_strip" && !(x.config.rating) && ((x.config.logos as unknown[] | undefined)?.length ?? 0) === 0,
    );
    check("no dead proof strip", dupEmptyProof.length === 0);

    // ── commercial structure ──
    check(
      "no chain-only section on a standalone page",
      invalidChainSections(sections as never, d.chainRole as never).length === 0,
    );
    if (!s.paid) {
      const priced = sections.filter((x) => {
        const c = x.config as { priceCents?: number; orderBump?: { priceCents?: number } };
        return (c.priceCents ?? 0) > 0 || (c.orderBump?.priceCents ?? 0) > 0;
      });
      check("a free offer carries no price and no order bump", priced.length === 0, priced.map((x) => x.type).join(","));
      check("a free offer has no checkout section", !sections.some((x) => x.type === "checkout"));
    }

    // ── copy integrity ──
    const allCopy: { where: string; text: string }[] = [];
    for (const sec of sections) {
      for (const [k, val] of Object.entries(sec.config)) {
        if (typeof val === "string" && val.length > 0) allCopy.push({ where: `${sec.type}.${k}`, text: val });
      }
    }
    const placeholders = allCopy.filter((c) => PLACEHOLDER_RE.test(c.text));
    check("no placeholder or debug content", placeholders.length === 0, placeholders.map((p) => `${p.where}="${p.text.slice(0, 40)}"`).join(" | "));
    const cutOff = allCopy.filter((c) => c.text.length > 40 && TRAILING_CUT_RE.test(c.text.trim()));
    check("no copy stops mid-thought", cutOff.length === 0, cutOff.map((c) => `${c.where}="…${c.text.slice(-45)}"`).join(" | "));

    // ── CTA ──
    const heroCta = (sections[0]?.config as { ctaLabel?: string })?.ctaLabel ?? "";
    check("the hero CTA has a real label", heroCta.trim().length > 2, JSON.stringify(heroCta));

    await db.doc(`funnels/qa-p1-${s.key}`).set({ ...d, id: `qa-p1-${s.key}`, name: `[QA-P1] ${d.name}`, status: "published" });
  } catch (e) {
    check("generation completed", false, e instanceof Error ? e.message.slice(0, 300) : String(e));
  }
}

// ── D: the legitimate chain must still work end to end ─────────────────────
console.log("\n── D(cont). A real upsell chain still builds and still works ──");
const parent = built.find((b) => b.key === "D-paid-chain");
if (!parent) {
  check("scenario D produced a parent funnel", false);
} else {
  const stepId = await createFunnelServerSide({
    subAccountId: SUB,
    createdByUid: uid,
    name: "QA upsell step",
    genre: "tripwire",
    chainRole: "upsell",
    parentFunnelId: parent.id,
  });
  const step = (await db.doc(`funnels/${stepId}`).get()).data()! as { sections: { id: string; type: string }[]; chainRole: string };
  check("a chain step seeds an upsell_offer section", step.sections.some((x) => x.type === "upsell_offer"));
  check("a chain step carries chainRole 'upsell'", step.chainRole === "upsell");

  const realUpsell = await updateFunnelServerSide({
    subAccountId: SUB,
    funnelId: stepId,
    patch: {
      sections: [
        {
          id: step.sections[0].id,
          type: "upsell_offer",
          config: {
            headline: "Add the travel case for $19?",
            bullets: ["Protects the ceramic body in a bag", "Fits the brewer and the filter together"],
            priceCents: 1900,
            acceptLabel: "Yes, add the case",
            declineLabel: "No thanks",
          },
        },
      ] as never,
    },
  });
  check("a real, configured upsell saves on a chain step", realUpsell === true);

  const published = await updateFunnelServerSide({ subAccountId: SUB, funnelId: stepId, patch: { status: "published" } })
    .then(() => true)
    .catch((e) => (e as Error).message);
  check("a real upsell step still publishes", published === true, typeof published === "string" ? published.slice(0, 140) : "");
  await db.doc(`funnels/qa-p1-D-upsell-step`).set({ ...(await db.doc(`funnels/${stepId}`).get()).data(), id: "qa-p1-D-upsell-step", name: "[QA-P1] upsell step", status: "published" });

  // The actual defect: the same section on the FREE page must be refused.
  const free = built.find((b) => b.key === "A-free-assessment");
  if (free) {
    const freeDoc = (await db.doc(`funnels/${free.id}`).get()).data()! as { sections: unknown[] };
    const attempt = await updateFunnelServerSide({
      subAccountId: SUB,
      funnelId: free.id,
      patch: {
        sections: [
          ...(freeDoc.sections as never[]),
          {
            id: `s${Date.now()}`,
            type: "upsell_offer",
            config: { headline: "Wait — add this to your order?", bullets: ["disk"], priceCents: 100000, acceptLabel: "Yes, add it!", declineLabel: "No thanks" },
          },
        ] as never,
      },
    })
      .then(() => "SAVED")
      .catch((e) => (e instanceof FunnelValidationError ? `REFUSED: ${e.message}` : `ERROR: ${(e as Error).message}`));
    check("a $1,000 upsell on the free assessment page is refused", attempt.startsWith("REFUSED"), attempt.slice(0, 150));
  }
}

console.log("\nPublished for visual review:");
for (const b of built) console.log(`   ${b.label}: /preview/funnel/qa-p1-${b.key}`);
console.log(`   D upsell step: /preview/funnel/qa-p1-D-upsell-step`);
console.log(`\n${failures === 0 ? "GENERATION: ALL CHECKS PASSED" : `GENERATION: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
