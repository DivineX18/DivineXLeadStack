/**
 * FINAL LAUNCH PASS — CHECKPOINT 1 A/B/C.
 *
 * Proves, against the REAL modules and the REAL retained negative fixture:
 *   A  shell safety     — empty-but-present sections are omitted at the write
 *                         boundary; an unviable residue fails closed
 *   B  critic completeness — the fixture that previously returned "ready" no
 *                         longer can (deterministic, model-independent)
 *   C  CTA quality      — the Critic can actually SEE the CTA labels it is
 *                         asked to judge; no banned-phrase rule was added
 *
 * The fixture is NOT modified to obtain the pass.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-shell-safety.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const FIXTURE_SA = "dx-loop-test";
const FIXTURE_FUNNEL = "gauolGvrAwsCGH2hmtmQ";

const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { pruneEmptySections, evaluateSections, assessViability } = await import("../src/lib/funnels/section-completeness.ts");
const { critiqueComposition, describeComposition, computeReadiness } = await import("../src/lib/funnels/landing-page-critic.ts");
const { updateFunnelServerSide, createFunnelServerSide, deleteFunnelServerSide, FunnelValidationError } = await import("../src/lib/server/funnels-service.ts");
import type { FunnelSection } from "../src/types/funnels.ts";

const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// ── The retained negative fixture, read as-is ───────────────────────────────
const fixSnap = await db.doc(`funnels/${FIXTURE_FUNNEL}`).get();
if (!fixSnap.exists) throw new Error("Negative fixture missing — refusing to certify without it.");
const fixture = fixSnap.data() as { sections: FunnelSection[]; criticVerdict?: { verdict: string }; salesArgument?: unknown };
console.log(`fixture=${FIXTURE_FUNNEL} sections=${fixture.sections.length} priorVerdict=${fixture.criticVerdict?.verdict} salesArgument=${fixture.salesArgument ? "present" : "ABSENT"}\n`);

check("fixture is the traced negative case (no salesArgument, previously ready)",
  !fixture.salesArgument && fixture.criticVerdict?.verdict === "ready",
  `stored verdict "${fixture.criticVerdict?.verdict}"`);

// ── A. SHELL SAFETY ────────────────────────────────────────────────────────
console.log("\n── A. SHELL SAFETY");

const evald = evaluateSections(fixture.sections);
const empties = evald.filter((e) => e.state === "empty");
check("empty-but-present sections are detected in the fixture", empties.length >= 3,
  empties.map((e) => e.sectionType).join(", ") || "none");
check("minimal-but-real sections are NOT flagged",
  evald.find((e) => e.sectionType === "business_footer")?.state === "ok" &&
  evald.find((e) => e.sectionType === "hero")?.state === "ok",
  "business_footer (name only) + hero survive");

const pruned = pruneEmptySections(fixture.sections);
check("pruning omits exactly the empty sections", pruned.sections.length === fixture.sections.length - empties.length,
  `${fixture.sections.length} → ${pruned.sections.length}`);
check("pruning fabricates nothing", JSON.stringify(pruned.sections) === JSON.stringify(fixture.sections.filter((s) => !empties.some((e) => e.sectionId === s.id))));
check("what remains is still a viable conversion experience", pruned.viability.viable, pruned.viability.reasons.join(" "));

// Fail-closed: strip the conversion path and the headline, prove it refuses.
const gutted: FunnelSection[] = [
  { id: "a", type: "proof_strip", config: { variant: "logos", logos: [] } },
  { id: "b", type: "faq", config: { items: [] } },
];
const guttedResult = pruneEmptySections(gutted);
check("a page pruned to nothing is NOT reported viable", !guttedResult.viability.viable, guttedResult.viability.reasons.join(" "));
check("a headline-less, action-less page is NOT viable",
  !assessViability([{ id: "x", type: "callout", config: { text: "hello" } }] as FunnelSection[]).viable);

// Live write-boundary behavior on a real disposable funnel.
const probeId = await createFunnelServerSide({
  subAccountId: FIXTURE_SA, createdByUid: "verify-shell-safety", name: "SHELL SAFETY PROBE", genre: "lead_gen",
});
try {
  const withShells: FunnelSection[] = [
    { id: "h", type: "hero", config: { headline: "Real headline", mediaType: "none", ctaLabel: "Book my first visit", ctaHref: "https://example.test/book" } },
    { id: "p", type: "proof_strip", config: { variant: "logos", logos: [] } },
    { id: "f", type: "faq", config: { items: [] } },
  ] as FunnelSection[];

  await updateFunnelServerSide({ subAccountId: FIXTURE_SA, funnelId: probeId, patch: { sections: withShells, enforceCompleteness: true } });
  const saved = (await db.doc(`funnels/${probeId}`).get()).data() as { sections: FunnelSection[] };
  check("write boundary omits empty shells on generated writes", saved.sections.length === 1 && saved.sections[0].type === "hero",
    saved.sections.map((s) => s.type).join(", "));

  // A human's in-progress builder save is NOT silently deleted.
  await updateFunnelServerSide({ subAccountId: FIXTURE_SA, funnelId: probeId, patch: { sections: withShells } });
  const human = (await db.doc(`funnels/${probeId}`).get()).data() as { sections: FunnelSection[] };
  check("a human builder save keeps its in-progress sections", human.sections.length === 3,
    `${human.sections.length} sections preserved`);

  // ...but publishing that same page is refused.
  let publishErr = "";
  try {
    await updateFunnelServerSide({ subAccountId: FIXTURE_SA, funnelId: probeId, patch: { status: "published" } });
  } catch (e) { publishErr = e instanceof FunnelValidationError ? e.message : `WRONG ERROR: ${String(e)}`; }
  check("publishing a page containing empty shells is refused", publishErr.includes("before publishing"), publishErr.slice(0, 140));

  // Fail closed at the write boundary.
  let closedErr = "";
  try {
    await updateFunnelServerSide({ subAccountId: FIXTURE_SA, funnelId: probeId, patch: { sections: gutted, enforceCompleteness: true } });
  } catch (e) { closedErr = e instanceof FunnelValidationError ? e.message : `WRONG ERROR: ${String(e)}`; }
  check("write boundary FAILS CLOSED when nothing viable remains", closedErr.includes("can't be saved as a working funnel"), closedErr.slice(0, 140));
} finally {
  await deleteFunnelServerSide(FIXTURE_SA, probeId);
}

// ── B. CRITIC COMPLETENESS ─────────────────────────────────────────────────
console.log("\n── B. CRITIC COMPLETENESS (real model, real fixture, unmodified)");

const verdict = await critiqueComposition(fixture.sections, 0);
check("the fixture NO LONGER receives a ready verdict", verdict.verdict === "needs_correction",
  `verdict="${verdict.verdict}" findings=${verdict.findings.length}`);
const objective = verdict.findings.filter((f) => f.category === "incomplete_section");
check("objective completeness findings are present and blocking",
  objective.length >= 3 && objective.some((f) => f.severity === "blocking"),
  objective.map((f) => `${f.sectionType}/${f.severity}`).join(", "));
const readiness = computeReadiness({ funnel: { visualRequirements: [] }, verdict });
check("readiness HOLDS the page back", !readiness.ready, `${readiness.reasons.length} reasons`);
console.log("   findings:");
for (const f of verdict.findings) console.log(`     [${f.severity}] ${f.sectionType} (${f.category}) ${f.correction}`);

// A complete page must still be able to pass — a guard that fails everything
// certifies nothing.
const cleanPage = pruned.sections;
const cleanObjective = evaluateSections(cleanPage).filter((e) => e.state === "empty");
check("a complete page produces NO objective completeness failures", cleanObjective.length === 0,
  cleanObjective.map((e) => e.sectionType).join(", ") || "none");

// ── C. CTA QUALITY ─────────────────────────────────────────────────────────
console.log("\n── C. CTA QUALITY");

const described = describeComposition(fixture.sections);
check("the Critic can SEE the actual CTA labels", described.includes('CTA button "Get started"'),
  described.split("\n").find((l) => l.includes("CTA button"))?.trim().slice(0, 100) ?? "no CTA line emitted");
check("the Critic can see what each CTA actually opens", described.includes("opens capture form"));

const criticSrc = readFileSync(new URL("../src/lib/funnels/landing-page-critic.ts", import.meta.url), "utf8");
check("CTA quality is judged on action + payoff + continuity",
  ["CLEAR ACTION", "IMMEDIATE PAYOFF", "CONTINUES the offer"].every((k) => criticSrc.includes(k)));
check("no banned-phrase rule was introduced", criticSrc.includes("There is no banned wording"));

// ── E. PERSUASION ARCHITECTURE ─────────────────────────────────────────────
// The traced root cause: validate() runs twice against different key styles
// (model snake_case on propose, its own camelCase on confirm). Sixteen
// strategy fields — the entire Sales Argument Plan among them — were dropped
// between the proposal and the action, so the page was composed with no
// argument behind it. Regression coverage for the reconnection.
console.log("\n── E. PERSUASION ARCHITECTURE (survives propose → confirm)");

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const createFunnel = getCapability("create_funnel")!;

const modelCall: Record<string, unknown> = {
  funnel_name: "Persuasion round-trip probe", genre: "lead_gen",
  headline: "Nervous about the dentist? Start with one gentle visit.",
  bullets: ["Same-day exam and clean", "No lectures", "£59 flat"],
  emotional_transformation: "fear_to_safety", decision_complexity: "moderate",
  campaign_energy: "calm", campaign_humanity: "people_led", traffic_temperature: "cold",
  real_rating: { score: 4.9, count: 312, url: "https://g.page/northgate" },
  sales_argument: {
    prospect: "Adults who have avoided the dentist for years",
    arrival_context: "Searched after a twinge finally scared them",
    current_belief: "The dentist will shame me and hit me with a huge bill",
    belief_chain: ["This practice will not judge me", "One visit tells me where I stand", "£59 is the whole risk"],
    mechanism: "A single gentle exam with a written plan before any treatment",
    core_promise: "Know exactly where your teeth stand for £59, judgement-free",
    primary_objection: "It'll turn into a huge treatment bill",
    risk_reversal: "Fixed £59, no treatment booked on the day",
    close_reason: "Small problems get expensive the longer they wait",
    old_way: "Emergency-only dentistry", why_old_way_fails: "You only go when it already hurts",
  },
};

const propose = createFunnel.validate(modelCall);
check("the model's own call validates", propose.ok, propose.ok ? "" : propose.error);
if (propose.ok) {
  const confirm = createFunnel.validate(propose.args);
  check("it survives re-validation on the confirm path", confirm.ok, confirm.ok ? "" : confirm.error);
  if (confirm.ok) {
    for (const k of ["salesArgument", "decisionComplexity", "campaignEnergy", "campaignHumanity",
                     "trafficTemperature", "realRating", "emotionalTransformation"]) {
      const before = JSON.stringify(propose.args[k]);
      check(`${k} reaches execution`, before === JSON.stringify(confirm.args[k]) && confirm.args[k] != null,
        String(confirm.args[k] == null ? "DROPPED" : "").slice(0, 40));
    }
    const sa = confirm.args.salesArgument as Record<string, unknown>;
    check("nested plan fields round-trip (belief_chain, arrival_context)",
      Array.isArray(sa?.beliefChain) && (sa.beliefChain as unknown[]).length === 3 &&
      sa.arrivalContext === (modelCall.sales_argument as Record<string, string>).arrival_context);
  }
}

// "Draft beats blocking" is a deliberate existing policy and stays: a thin or
// absent plan still parses to null rather than failing the build, and the
// synthesized floor in execute() keeps the argument from ever being absent.
// The defect was never the floor — it was that a REAL plan could not reach it.
const thin = createFunnel.validate({ ...modelCall, sales_argument: { prospect: "someone" } });
check("a thin plan still degrades to the synthesized floor, not a hard failure",
  thin.ok && thin.args.salesArgument === null);

console.log(`\n${bad === 0 ? "CHECKPOINT 1 A/B/C/E: PASS" : `CHECKPOINT 1 A/B/C/E: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
