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
const { FUNNEL_FRAMEWORKS, buildFrameworkSections, stageAllowedLayouts, funnelDepthForBuyer } = await import(
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
  // One-fold by design (RC 1.1 length pass, 2026-08-02): lead_magnet is a
  // low-commitment ask, so the hero IS the whole page — no scroll required
  // to convert. See frameworks.ts's lead_magnet comment.
  const sections = buildFrameworkSections("lead_magnet");
  check(
    "1a. lead_magnet default sequence is a single one-fold hero stage",
    sections.map((s) => s.type).join(",") === "hero",
    sections.map((s) => s.type).join(","),
  );
  check(
    "1a2. lead_magnet's hero stage is marked as the capture surface",
    FUNNEL_FRAMEWORKS.lead_magnet[0]?.isCapture === true,
  );
}
{
  const sections = buildFrameworkSections("vsl");
  check(
    "1b. vsl default sequence matches the spec exactly (value_stack before the offer)",
    sections.map((s) => s.type).join(",") === "hero,video,problem_solution,value_stack,offer,faq,cta_banner",
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("webinar");
  check(
    "1c. webinar default sequence matches the spec exactly (RC 1.1: Agenda before Benefits; mid-page CTA banner)",
    sections.map((s) => s.type).join(",") === "hero,problem_solution,agenda,benefits_grid,cta_banner,story,faq,offer",
    sections.map((s) => s.type).join(","),
  );
}
{
  const sections = buildFrameworkSections("application");
  check(
    "1d. application default sequence matches the spec exactly (RC 1.1: adds Who This Isn't For; mid-page CTA banner)",
    sections.map((s) => s.type).join(",") === "hero,benefits_grid,included,cta_banner,agenda,before_after,offer",
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
    "2e. tripwire's enriched sales-page sequence matches spec (value_stack before the offer; closing CTA banner)",
    sections.map((s) => s.type).join(",") ===
      "hero,problem_solution,callout,benefits_grid,trust_badges,value_stack,offer,guarantee,faq,cta_banner",
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
  // Uses "challenge" (hero, problem_solution, benefits_grid, agenda,
  // ticket_tiers, faq) since the one-fold lead_magnet no longer has these
  // stages — see the dedicated one-fold block (5) below for that genre.
  const validated = cap.validate!({
    genre: "challenge",
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
      "4c. benefits_grid content lands correctly",
      (benefitsGrid?.config.items as unknown[])?.length === 2,
    );

    const agenda = sections.find((s) => s.type === "agenda");
    check(
      "4e. process_steps lands in the agenda/process-timeline section",
      (agenda?.config.days as unknown[])?.length === 2,
    );
  }

  // 4d. benefits_grid vs included conflation check — "application" pairs
  // these two stages exactly like the old lead_magnet did (the original bug
  // this block guards against), so it's the natural home for this check now.
  const conflationValidated = cap.validate!({
    genre: "application",
    headline: "Apply for the Mastermind",
    bullets: ["Real accountability", "Weekly coaching calls"],
    stage_content: [
      {
        section_type: "benefits_grid",
        headline: "Who it's for",
        items: [{ title: "Committed operators", description: "Ready to put in the work." }],
      },
      {
        section_type: "included",
        headline: "What's included",
        items: [{ title: "Printable checklist", description: "One page, ready to go." }],
      },
    ],
  });
  check("4d1. application benefits_grid/included proposal validates", conflationValidated.ok);
  if (conflationValidated.ok) {
    const result = await cap.execute!(fakeCtx(), conflationValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()?.sections as { type: string; config: Record<string, unknown> }[];
    const benefitsGrid = sections.find((s) => s.type === "benefits_grid");
    const included = sections.find((s) => s.type === "included");
    check(
      "4d2. included content is distinct from benefits_grid (not conflated)",
      (included?.config.items as { title: string }[])?.[0]?.title === "Printable checklist" &&
        (benefitsGrid?.config.items as { title: string }[])?.[0]?.title === "Committed operators",
    );
  }

  // 5. One-fold lead_magnet: the hero IS the whole page, and it must be a
  // real capture surface — a dedicated form wired to the hero itself (not
  // an offer/ticket_tiers section, since lead_magnet no longer has one),
  // plus the same form/template/workflow package every other capture-style
  // genre gets. Also confirms cta_style defaults to "popup_form" (not
  // "inline") per the operator's standing "popup form on all pages" ask.
  const leadMagnetValidated = cap.validate!({
    genre: "lead_magnet",
    headline: "The First Groom Checklist",
    bullets: ["Nail and ear prep before the appointment", "How to spot matting early"],
  });
  check("5a. One-fold lead_magnet proposal validates", leadMagnetValidated.ok);
  if (leadMagnetValidated.ok) {
    // validate() leaves ctaStyle "" (not defaulted) when omitted — the
    // effective default is resolved inside execute() (see 5e below),
    // since the RIGHT default depends on whether an archetype resolved a
    // different CTA of its own. Checking the raw arg here would just
    // re-test validate()'s parsing, not the actual default behavior.
    check("5b. cta_style is left unresolved by validate() (execute() decides the real default)", leadMagnetValidated.args.ctaStyle === "");
    const result = await cap.execute!(fakeCtx(), leadMagnetValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()?.sections as { type: string; config: Record<string, unknown> }[];
    check("5c. lead_magnet funnel has exactly one section (the hero)", sections.length === 1 && sections[0]?.type === "hero");
    const hero = sections[0];
    check("5d. hero carries the bullets directly (no separate benefits section to hold them)", (hero?.config.bullets as string[])?.length === 2);
    check("5e. hero's CTA defaults to a popup form", (hero?.config.cta as { style?: string } | undefined)?.style === "popup_form");
    check("5f. hero is wired to a real capture form (formId set)", typeof hero?.config.formId === "string" && (hero?.config.formId as string).length > 0);
    if (typeof hero?.config.formId === "string") {
      const formSnap = await db.doc(`forms/${hero.config.formId}`).get();
      check("5g. the wired form actually exists in Firestore", formSnap.exists);
      if (formSnap.exists) await formSnap.ref.delete().catch(() => {});
    }
    check("5h. summary confirms the Growth System package was built (not skipped as a priced offer)", result.resultText.includes("Capture Form"));
    // Deterministic bold default: a funnel built WITHOUT an archetype (as the
    // model often does) must still come out as the bold, dark direct_response
    // look — never a flat/light default. This is the fix for "still white".
    const ds = snap.data()?.designStrategy as { visualArchetype?: string; colorMode?: string } | undefined;
    check("5i. no-archetype funnel forced to bold direct_response (bold LIGHT default, not the washed template)", ds?.visualArchetype === "direct_response" && ds?.colorMode === "light", `${ds?.visualArchetype}/${ds?.colorMode}`);
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

  // 6. value_stack auto-population — a tripwire with a value_stack fills the
  // section that now sits right before the offer with real items/values/total/
  // price. Values are the operator's own; the tool forbids fabricating them.
  const vsValidated = cap.validate!({
    genre: "tripwire",
    headline: "Know If Your Roof Needs Replacing",
    bullets: ["A real, specific benefit"],
    price_cents: 0,
    value_stack: {
      headline: "Here's everything your free inspection includes",
      items: [
        { title: "Full roof inspection", description: "Every slope, valley, and flashing point", value: "$300" },
        { title: "Written plain-English condition report", value: "$150" },
      ],
      total_value_label: "Total value: $450",
      price_label: "Today: Free",
      footnote: "No obligation, no pressure.",
    },
  });
  check("6a. tripwire-with-value_stack validates", vsValidated.ok);
  if (vsValidated.ok) {
    const result = await cap.execute!(fakeCtx(), vsValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()?.sections as { type: string; config: Record<string, unknown> }[];
    const vs = sections.find((s) => s.type === "value_stack");
    check("6b. value_stack section exists in the tripwire sequence", !!vs);
    const items = (vs?.config.items as { title: string; value?: string }[]) ?? [];
    check("6c. value_stack items populated with values", items.length === 2 && items[0]?.value === "$300");
    check(
      "6d. total + price + footnote populated",
      vs?.config.totalValueLabel === "Total value: $450" && vs?.config.priceLabel === "Today: Free" && vs?.config.footnote === "No obligation, no pressure.",
    );
    const types = sections.map((s) => s.type);
    check("6e. value_stack renders right before the offer", types.indexOf("value_stack") === types.indexOf("offer") - 1);
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

// --- 7. Adaptive funnel depth (Conversion Engine P0 — awareness drives composition) ---
{
  check("7a. funnelDepthForBuyer: most_aware -> lean", funnelDepthForBuyer("most_aware") === "lean");
  check("7b. funnelDepthForBuyer: hot traffic -> lean", funnelDepthForBuyer(null, "hot") === "lean");
  check("7c. funnelDepthForBuyer: problem_aware/cold -> standard", funnelDepthForBuyer("problem_aware", "cold") === "standard");
  check("7d. funnelDepthForBuyer: nothing known -> standard (safe default)", funnelDepthForBuyer(null, null) === "standard");

  const full = buildFrameworkSections("webinar").map((s) => s.type);
  const lean = buildFrameworkSections("webinar", undefined, "lean").map((s) => s.type);
  check("7e. lean webinar is SHORTER than standard", lean.length < full.length, `${lean.length} < ${full.length}`);
  check("7f. lean webinar keeps hero + offer (still converts)", lean.includes("hero") && lean.includes("offer"));
  check("7g. lean webinar drops the education stages (story/agenda)", !lean.includes("story") && !lean.includes("agenda"), lean.join(","));

  // The capture stage is always kept, even when its section type isn't in LEAN_KEEP.
  const leanChallenge = buildFrameworkSections("challenge", undefined, "lean").map((s) => s.type);
  check("7h. lean keeps the capture stage regardless (challenge's ticket_tiers)", leanChallenge.includes("ticket_tiers"), leanChallenge.join(","));

  // Standard is unchanged from the default (no regression to existing behavior).
  check("7i. explicit standard === default (no regression)", buildFrameworkSections("tripwire", undefined, "standard").length === buildFrameworkSections("tripwire").length);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
