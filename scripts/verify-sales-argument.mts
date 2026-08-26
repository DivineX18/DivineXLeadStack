// Regression coverage for the Sales Argument Engine — the layer that makes a
// funnel an ARGUMENT (belief chain → sections with jobs) instead of a
// collection of components. Deterministic where possible; one Firestore
// round-trip proves the plan + roles are STORED (explainable from data, never
// a discarded prompt).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-sales-argument.mts

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
// Keep this suite deterministic: never let auto-imagery fire during it.
delete process.env.PEXELS_API_KEY;

import type { FunnelSection } from "../src/types/funnels";
const { FUNNEL_FRAMEWORKS, buildFrameworkSections } = await import("../src/lib/funnels/frameworks");
const { stampArgumentRoles } = await import("../src/lib/funnels/art-direction");
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. The belief-shift stage exists where the audit found it missing ---
{
  const leadGen = FUNNEL_FRAMEWORKS.lead_gen.map((s) => s.id);
  const webinar = FUNNEL_FRAMEWORKS.webinar.map((s) => s.id);
  check("1a. lead_gen has a belief_shift stage (hero no longer jumps straight to benefits)", leadGen.includes("belief_shift"));
  check("1b. lead_gen belief shift sits BEFORE benefits", leadGen.indexOf("belief_shift") < leadGen.indexOf("benefits"));
  check("1c. webinar has a belief_shift stage before the agenda", webinar.indexOf("belief_shift") !== -1 && webinar.indexOf("belief_shift") < webinar.indexOf("agenda"));

  const lean = buildFrameworkSections("lead_gen", undefined, "lean").map((s) => s.type);
  check("1d. LEAN (high-intent) pages drop the belief shift — most-aware buyers skip belief education", !lean.includes("problem_solution"));
  const standard = buildFrameworkSections("lead_gen").map((s) => s.type);
  check("1e. standard lead_gen keeps it", standard.includes("problem_solution"));
}

// --- 2. Every section gets a JOB (argument roles) ---
{
  const sections = [
    { id: "s1", type: "hero", config: {} },
    { id: "s2", type: "problem_solution", config: {} },
    { id: "s3", type: "benefits_grid", config: {} },
    { id: "s4", type: "cta_banner", config: {} },
    { id: "s5", type: "story", config: {} },
    { id: "s6", type: "offer", config: {} },
    { id: "s7", type: "guarantee", config: {} },
    { id: "s8", type: "faq", config: {} },
    { id: "s9", type: "cta_banner", config: {} },
  ] as unknown as FunnelSection[];
  const out = stampArgumentRoles(sections);
  const role = (id: string) => out.find((s) => s.id === id)?.argumentRole;
  check("2a. hero=hook, problem_solution=belief_shift, benefits=promise", role("s1") === "hook" && role("s2") === "belief_shift" && role("s3") === "promise");
  check("2b. story=mechanism, offer=offer, guarantee=risk_reversal, faq=objections", role("s5") === "mechanism" && role("s6") === "offer" && role("s7") === "risk_reversal" && role("s8") === "objections");
  check("2c. the FINAL cta_banner is the CLOSE; a mid-page one is an action beat", role("s9") === "close" && role("s4") === "action");
  check("2d. every section answers 'what job would be lost?' (all stamped)", out.every((s) => !!s.argumentRole));
}

// --- 3. Plan validation: thin arguments are rejected, real ones capped + kept ---
{
  const base = {
    genre: "lead_gen",
    headline: "Same-Day Emergency AC Repair in Phoenix",
    bullets: ["A real person answers", "Price before the wrench turns"],
    emotional_transformation: "panic_to_relief",
  };
  const full = cap.validate!({
    ...base,
    sales_argument: {
      prospect: "A Phoenix homeowner whose AC just died in summer heat",
      arrival_context: "Searched 'emergency AC repair near me' from a hot house",
      current_belief: "Repair companies make you wait days and surprise you on price",
      belief_chain: [
        "Waiting until next week isn't acceptable at 115 degrees",
        "I need a company that dispatches today",
        "I also need the price before work starts",
        "Summit solves both, so I should call now",
      ],
      old_way: "Call center, voicemail, a slot next week, an unknown invoice",
      why_old_way_fails: "The homeowner sweats for days and still can't budget the repair",
      mechanism: "Emergency slots held daily plus flat upfront pricing approved before work",
      core_promise: "A technician today and the exact price before any work begins",
      primary_objection: "Will after-hours cost extra?",
      risk_reversal: "Flat quote approved up front; nights and weekends cost the same",
      close_reason: "Every hour without AC in Phoenix heat is genuinely unsafe",
    },
  });
  check("3a. a full sales argument validates", full.ok);
  if (full.ok) {
    const sa = full.args.salesArgument as { beliefChain: string[]; corePromise: string } | null;
    check("3b. the plan survives parsing (chain intact, promise kept)", !!sa && sa.beliefChain.length === 4 && sa.corePromise.length > 0);
  }
  const thin = cap.validate!({ ...base, sales_argument: { prospect: "someone", belief_chain: ["buy"] } });
  check("3c. a too-thin argument (chain < 2) parses to null — never stored as a fake plan", thin.ok && thin.args.salesArgument === null);
  const absent = cap.validate!({ ...base });
  check("3d. absent argument parses to null (execute still succeeds — draft beats blocking)", absent.ok && absent.args.salesArgument === null);
}

// --- 4. Execute: plan + roles are STORED on the doc (auditable from data) ---
{
  const db = getAdminDb();
  const auth = getAdminAuth();
  const SUB = `qa-sa-sub-${Date.now()}`;
  const AGENCY = `qa-sa-agency-${Date.now()}`;
  const user = await auth.createUser({ email: `qa-sa-${Date.now()}@test.local` });
  await db.doc(`agencies/${AGENCY}`).set({ id: AGENCY, name: "QA" });
  await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: AGENCY, name: "QA Sub", funnelsEnabledByAgency: true });
  const fakeCtx = { uid: user.uid, subAccountId: SUB, agencyId: AGENCY, subAccountRole: "subAccountAdmin" } as unknown as AiSuiteActionContext;
  try {
    const v = cap.validate!({
      genre: "lead_gen",
      headline: "Same-Day Emergency AC Repair in Phoenix",
      bullets: ["A real person answers", "Price before the wrench turns"],
      emotional_transformation: "panic_to_relief",
      awareness: "problem_aware",
      sales_argument: {
        prospect: "A Phoenix homeowner whose AC just died",
        arrival_context: "Searched from a hot house",
        current_belief: "Repair companies make you wait and surprise you on price",
        belief_chain: ["Waiting isn't acceptable", "I need same-day dispatch", "I need the price first", "Summit solves both"],
        mechanism: "Held emergency slots + flat upfront pricing",
        core_promise: "A technician today and the price before work begins",
        primary_objection: "Will after-hours cost extra?",
        close_reason: "Heat this severe is genuinely unsafe",
      },
    });
    check("4a. benchmark-shaped proposal validates", v.ok);
    if (v.ok) {
      const result = await cap.execute!(fakeCtx, v.args);
      const data = (await db.doc(`funnels/${result.ref!.id}`).get()).data()!;
      const sa = data.salesArgument as { beliefChain?: string[] } | undefined;
      check("4b. salesArgument is STORED on the funnel doc", !!sa && Array.isArray(sa.beliefChain) && sa.beliefChain.length === 4);
      const sections = data.sections as { type: string; argumentRole?: string }[];
      check("4c. every stored section carries its argumentRole", sections.every((s) => !!s.argumentRole), sections.map((s) => `${s.type}:${s.argumentRole ?? "-"}`).join("|"));
      check("4d. the page HAS a belief-shift section (problem_aware -> standard depth)", sections.some((s) => s.argumentRole === "belief_shift"));
      check("4e. the page HAS a close", sections.some((s) => s.argumentRole === "close"));
      if (result.ref?.id) await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
      // Best-effort cleanup of packaged artifacts (form/template/workflow).
      for (const col of ["forms", "message_templates", "workflows"]) {
        const q = await db.collection(col).where("subAccountId", "==", SUB).get().catch(() => null);
        if (q) for (const d of q.docs) await d.ref.delete().catch(() => {});
      }
    }
  } finally {
    await db.doc(`subAccounts/${SUB}`).delete().catch(() => {});
    await db.doc(`agencies/${AGENCY}`).delete().catch(() => {});
    await auth.deleteUser(user.uid).catch(() => {});
  }
}

// --- 5. THE NON-DECORATIVE TEST: the plan must be structurally consumed ---
// Given beliefChain A -> B -> C -> D -> ACTION, rendered sections must be
// RESPONSIBLE for B, C, D; the CTA/close must correspond to ACTION; the offer
// must not duplicate the benefits; the close must reference the outcome +
// reason to act. If the renderer still effectively does Hero->Benefits->
// Offer->FAQ with a pretty stored object on the side, this section fails.
{
  const { applySalesArgument } = await import("../src/lib/funnels/art-direction");
  const A = "My AC is dead and I need somebody";
  const B = "Waiting until tomorrow isn't acceptable in this heat";
  const C = "I need a company that dispatches today";
  const D = "I also need the price before work starts";
  const ACTION = "Summit solves both, so I should call now";
  const plan = { beliefChain: [A, B, C, D, ACTION], corePromise: "A technician today and the price before work begins", closeReason: "Heat this severe is genuinely unsafe" };

  const composed = stampArgumentRoles(
    buildFrameworkSections("lead_gen").map((s, i) => {
      if (s.type === "problem_solution") return { ...s, config: { ...s.config, problemHeadline: "The usual experience", problemText: "Voicemail, next week, surprise invoice.", solutionHeadline: "A different promise", solutionText: "One call, a tech today, price first." } };
      if (s.type === "benefits_grid") return { ...s, config: { ...s.config, items: [{ title: "Same-day dispatch" }, { title: "Upfront pricing" }, { title: "Fixed first visit" }] } };
      if (s.type === "offer") return { ...s, config: { ...s.config, bullets: ["Same-day dispatch", "A technician at your door today", "Your exact quote before any work"] } };
      if (s.type === "cta_banner") return { ...s, config: { ...s.config, headline: "Don't sweat another night", subtext: "" } };
      return { ...s, id: `n${i}` };
    }) as FunnelSection[],
  );
  const out = applySalesArgument(composed, plan);

  const serves = (b: string) => out.some((s) => (s.servesBelief ?? "").includes(b));
  check("5a. at least one RENDERED section is RESPONSIBLE for belief B", serves(B), out.map((s) => `${s.type}:${s.servesBelief ?? "-"}`).join(" | "));
  check("5b. at least one RENDERED section is RESPONSIBLE for belief C", serves(C));
  check("5c. at least one RENDERED section is RESPONSIBLE for belief D", serves(D));
  const closers = out.filter((s) => s.argumentRole === "close" || s.argumentRole === "offer");
  check("5d. the CTA/close corresponds to ACTION", closers.length > 0 && closers.every((s) => s.servesBelief === ACTION));
  const offer = out.find((s) => s.type === "offer")!;
  const offerBullets = (offer.config as { bullets?: string[] }).bullets ?? [];
  check("5e. offer does NOT duplicate benefits (verbatim overlap removed, offer never emptied)", !offerBullets.includes("Same-day dispatch") && offerBullets.length === 2, offerBullets.join(" | "));
  const close = out.find((s) => s.argumentRole === "close")!;
  const closeSubtext = (close.config as { subtext?: string }).subtext ?? "";
  check("5f. the close references the desired outcome + reason to act", closeSubtext.includes(plan.corePromise) && closeSubtext.includes(plan.closeReason), closeSubtext);
  check("5g. hook carries the ARRIVAL belief", out.find((s) => s.argumentRole === "hook")?.servesBelief === A);
  check("5h. an EMPTY section (proof_strip with no logos) owns NO belief", !out.find((s) => s.type === "proof_strip")?.servesBelief);
  check("5i. the belief SHIFT owns the first middle belief (role priority beats page order)", out.find((s) => s.argumentRole === "belief_shift")?.servesBelief === B);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
