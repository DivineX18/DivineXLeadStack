// Permanent regression coverage for the "Landing Page Generator RC"
// (2026-08-02): converted create_funnel from a fixed per-genre section
// skeleton into a conversion-framework generator — every genre maps
// Attention/Problem/Solution/Benefits/Process/Offer/Trust/FAQ/CTA onto a
// recommended sequence of reusable layouts (lib/funnels/frameworks.ts),
// and create_funnel lets the model substitute an allowed alternate layout
// per stage (e.g. real Testimonials instead of Before/After) when the
// business/evidence calls for it.
//
// Deterministic, no LLM call — hand-feeds args the way live-model testing
// proved the model actually sends them (verified separately, ad hoc,
// against the real OpenRouter-backed model across 4 scenarios: lead_magnet,
// vsl, application, and application-with-real-testimonials via
// layout_choices — all produced correct, non-generic, non-fabricated
// content). This script locks in the WIRING those runs exercised.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-frameworks.mts

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { FUNNEL_FRAMEWORKS, buildFrameworkSections, stageAllowedLayouts } = await import(
  "../src/lib/funnels/frameworks"
);
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Pure structural checks on buildFrameworkSections (no Firestore) ---

{
  const sections = buildFrameworkSections("lead_magnet");
  check(
    "1a. lead_magnet default sequence matches the spec exactly",
    sections.map((s) => s.type).join(",") ===
      "hero,problem_solution,benefits_grid,agenda,included,faq,offer",
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("vsl");
  check(
    "1b. vsl default sequence matches the spec exactly",
    sections.map((s) => s.type).join(",") === "hero,video,problem_solution,offer,faq,cta_banner",
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("webinar");
  check(
    "1c. webinar default sequence matches the spec exactly (RC 1.1: Agenda before Benefits)",
    sections.map((s) => s.type).join(",") === "hero,agenda,benefits_grid,story,faq,offer",
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("application");
  check(
    "1d. application default sequence matches the spec exactly (RC 1.1: adds Who This Isn't For)",
    sections.map((s) => s.type).join(",") === "hero,benefits_grid,included,agenda,before_after,offer",
    sections.map((s) => s.type).join(","),
  );
}

// --- 2. Layout override resolution ---

{
  const sections = buildFrameworkSections("application", { before_after: "testimonials" });
  check(
    "2a. A valid alternate override actually substitutes the layout",
    sections.some((s) => s.type === "testimonials") && !sections.some((s) => s.type === "before_after"),
    sections.map((s) => s.type).join(","),
  );
}
{
  // "hero" has no alternates at all — an override attempt must be ignored.
  const sections = buildFrameworkSections("application", { hero: "video" });
  check(
    "2b. An override for a stage with no alternates is ignored (falls back to default)",
    sections[0]?.type === "hero",
    sections[0]?.type,
  );
}
{
  // tripwire's "guarantee" stage (RC 1.1 sales-page framework) has no
  // alternates at all — "comparison" must be rejected.
  const sections = buildFrameworkSections("tripwire", { guarantee: "comparison" });
  check(
    "2c. An override to a NON-allowed alternate is rejected (falls back to default)",
    sections.some((s) => s.type === "guarantee") && !sections.some((s) => s.type === "comparison"),
    sections.map((s) => s.type).join(","),
  );
}
{
  // tripwire's "trust" stage's real alternate is ["testimonials"] — the
  // Trust Rules default (trust_badges, always safe/generic) only becomes
  // real testimonials when the operator/model has real quotes.
  const sections = buildFrameworkSections("tripwire", { trust_badges: "testimonials" });
  check(
    "2d. tripwire's trust stage swaps to testimonials via its real alternate",
    sections.some((s) => s.type === "testimonials") && !sections.some((s) => s.type === "trust_badges"),
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("tripwire");
  check(
    "2e. tripwire's enriched sales-page sequence matches spec (RC 1.1)",
    sections.map((s) => s.type).join(",") ===
      "hero,problem_solution,callout,benefits_grid,trust_badges,offer,guarantee,faq",
    sections.map((s) => s.type).join(","),
  );
}

// --- 3. Every genre's framework is internally consistent ---

{
  let allUnique = true;
  const genres = Object.keys(FUNNEL_FRAMEWORKS) as (keyof typeof FUNNEL_FRAMEWORKS)[];
  for (const genre of genres) {
    const stages = FUNNEL_FRAMEWORKS[genre];
    const defaultTypes = stages.map((s) => s.section);
    if (new Set(defaultTypes).size !== defaultTypes.length) allUnique = false;
    for (const stage of stages) {
      for (const alt of stage.alternates ?? []) {
        if (defaultTypes.includes(alt)) allUnique = false; // an alternate colliding with another stage's default would be ambiguous for stage_content matching
      }
    }
  }
  check(
    "3. No genre framework has two stages resolving to the same default type (stage_content matches by resolved type, so this must hold)",
    allUnique,
  );
}
{
  // stageAllowedLayouts always includes the default itself.
  const stage = FUNNEL_FRAMEWORKS.tripwire.find((s) => s.id === "guarantee")!;
  check("3b. stageAllowedLayouts includes the default layout", stageAllowedLayouts(stage).includes("guarantee"));
}

// --- 4. End-to-end through the real capability (Firestore-backed) ---

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `frameworks${Date.now()}`;
const AGENCY_ID = `test-agency-${RUN_ID}`;
const SUB_ID = `test-sa-${RUN_ID}`;
await db.doc(`agencies/${AGENCY_ID}`).set({ name: "Verify Agency", createdAt: new Date() });
await db.doc(`subAccounts/${SUB_ID}`).set({
  name: "Verify Sub-Account",
  agencyId: AGENCY_ID,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const user = await auth.createUser({ email: `frameworks-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });
function fakeCtx(): AiSuiteActionContext {
  return { uid: user.uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId: AGENCY_ID, subAccountId: SUB_ID };
}

const createdFunnelIds: string[] = [];

try {
  // 4a. A hand-fed proposal (mirrors the real shape verified live against
  // the model) exercises every new content-mapping branch in execute().
  const validated = cap.validate!({
    genre: "lead_magnet",
    headline: "The First Groom Checklist",
    bullets: ["Nail and ear prep before the appointment", "How to spot matting early"],
    process_steps: [
      { label: "Step 1", title: "Download the checklist", bullets: ["Enter your email"] },
      { label: "Step 2", title: "Prep your pup", bullets: ["Follow the routine"] },
    ],
    stage_content: [
      {
        section_type: "problem_solution",
        headline: "First grooms go sideways without prep",
        text: "Unhandled paws and ears turn a routine appointment into a fight.",
        secondary_headline: "A short prep routine fixes it",
        secondary_text: "A few days of handling practice and your dog walks in calm.",
      },
      {
        section_type: "benefits_grid",
        headline: "What you'll learn",
        items: [
          { title: "Handling basics", description: "Get your dog comfortable with paws and ears." },
          { title: "Spotting mats early", description: "Before they mean a shave-down." },
        ],
      },
      {
        section_type: "included",
        headline: "What's included",
        items: [{ title: "Printable checklist", description: "One page, ready to go." }],
      },
    ],
  });
  check("4a. Hand-fed proposal (mirrors real model output shape) validates", validated.ok);
  if (validated.ok) {
    const result = await cap.execute!(fakeCtx(), validated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()?.sections as { type: string; config: Record<string, unknown> }[];

    const problemSolution = sections.find((s) => s.type === "problem_solution");
    check(
      "4b. problem_solution content lands in the right section",
      problemSolution?.config.problemHeadline === "First grooms go sideways without prep" &&
        problemSolution?.config.solutionText === "A few days of handling practice and your dog walks in calm.",
    );

    const benefitsGrid = sections.find((s) => s.type === "benefits_grid");
    check(
      "4c. benefits_grid content lands separately from included (not conflated)",
      (benefitsGrid?.config.items as unknown[])?.length === 2,
    );

    const included = sections.find((s) => s.type === "included");
    check(
      "4d. included content is distinct from benefits_grid",
      (included?.config.items as { title: string }[])?.[0]?.title === "Printable checklist",
    );

    const agenda = sections.find((s) => s.type === "agenda");
    check(
      "4e. process_steps lands in the agenda/process-timeline section",
      (agenda?.config.days as unknown[])?.length === 2,
    );

    // proof_strip/countdown are never in lead_magnet's framework anyway, but
    // confirm no section in the output is one create_funnel doesn't
    // recognize as safe to author — the important negative check is (4f).
  }

  // 4f. Anti-fabrication: a testimonials stage_content entry with NO real
  // items must not populate — mirrors the tool's own instruction that an
  // empty/omitted testimonials entry means "no real evidence," never
  // invented content.
  const tripwireValidated = cap.validate!({
    genre: "tripwire",
    headline: "Test Anti-Fabrication",
    bullets: ["Real benefit one"],
    price_cents: 4700,
    layout_choices: { trust_badges: "testimonials" },
    stage_content: [{ section_type: "testimonials", items: [] }],
  });
  check("4g. Tripwire-with-testimonials-override validates", tripwireValidated.ok);
  if (tripwireValidated.ok) {
    const result = await cap.execute!(fakeCtx(), tripwireValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()?.sections as { type: string; config: Record<string, unknown> }[];
    const testimonials = sections.find((s) => s.type === "testimonials");
    check(
      "4h. Empty-items testimonials override resolves the layout but writes NO fabricated content",
      !!testimonials && (testimonials.config.items as unknown[]).length === 0,
      JSON.stringify(testimonials?.config),
    );
    const trustBadges = sections.find((s) => s.type === "trust_badges");
    check("4i. trust_badges is never in the resolved sections once overridden to testimonials (only one of the two competes for that slot)", !trustBadges);
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
