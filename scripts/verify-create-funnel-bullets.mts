// Permanent regression coverage for create_funnel bugs found during the
// RC 1.0 verification pass (2026-08-01):
//  1. The confirm route re-validates the chat route's ALREADY-normalized
//     args (camelCase keys, bullets as a real array); validate() only
//     accepted the raw LLM tool-call shape (snake_case, bullets as a
//     comma-string) — every confirm failed with "at least one bullet
//     point is required".
//  2. The challenge genre's ticket_tiers section (not offer) was left
//     completely empty by create_funnel — a Zeno-built challenge funnel
//     had no way to register at all until the operator manually added a
//     tier.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-create-funnel-bullets.mts
// Pure unit-level — calls validate()/execute() directly, no network, no
// Stripe. Needs Firebase Admin env vars (reads .env.local) since execute()
// writes real Firestore docs to a throwaway sub-account it creates+deletes.

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
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
function fakeCtx(subAccountId: string, agencyId: string, uid: string): AiSuiteActionContext {
  return { uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId, subAccountId };
}
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// 1. Explicit comma-separated bullets (the LEGACY raw string shape — the
// schema itself now types bullets as a real array, but validate() keeps
// this fallback for safety).
{
  const r = cap.validate!({
    headline: "Test Headline One",
    bullets: "First benefit, Second benefit, Third benefit",
  });
  check("1. Comma-separated string bullets -> array", r.ok && Array.isArray(r.args.bullets) && r.args.bullets.length === 3, JSON.stringify(r.ok ? r.args.bullets : r.error));
}

// 1b. THE COMMA-IN-BULLET BUG (found live 2026-08-02): a real model response
// gave a native array where one bullet phrase legitimately contained a
// comma ("Nail, ear, and paw prep most owners skip"). The schema was typed
// as a comma-joined string, so an earlier version of this fix's own naive
// splitting would have fragmented it into 3 bullets. Bullets must now be a
// native array end-to-end — this proves a comma INSIDE one array item
// survives as a single bullet, not three.
{
  const r = cap.validate!({
    headline: "Test Headline One-B",
    bullets: ["Nail, ear, and paw prep most owners skip", "Second benefit"],
  });
  check(
    "1b. A comma inside one array bullet item stays as ONE bullet",
    r.ok && Array.isArray(r.args.bullets) && r.args.bullets.length === 2 && r.args.bullets[0] === "Nail, ear, and paw prep most owners skip",
    JSON.stringify(r.ok ? r.args.bullets : r.error),
  );
}

// 1c. THE LITERAL-BACKSLASH-N BUG (found live 2026-08-02): a real model
// response wrote the confirmation email body with the literal two-character
// text "\n" between numbered steps instead of an actual newline — the send
// dialog showed "...next:\n\n1. We'll review...\n2. We'll reach out..." as
// visible backslash-n text. Model JSON-escaping slips aren't something a
// tool description can fully prevent, so validate() now normalizes literal
// "\n"/"\r\n" sequences to real newlines in every multi-line free-text
// field. This check reproduces the exact reported shape directly (bypassing
// whatever the live model happens to do this run) to prove the fix holds
// regardless of model behavior.
{
  const r = cap.validate!({
    headline: "Test Literal Newline Fix",
    bullets: ["Real benefit one"],
    confirmation_email_body:
      "Thank you for requesting your Leadership Growth Assessment.\\n\\nHere's what happens next:\\n\\n1. We'll review what you shared.\\n2. We'll reach out to schedule a call.",
  });
  check(
    "1c. Literal backslash-n in confirmation_email_body is normalized to a real newline, not left as visible text",
    r.ok && !(r.args.confirmationEmailBody as string).includes("\\n") && /\n\s*\n/.test(r.args.confirmationEmailBody as string),
    JSON.stringify(r.ok ? r.args.confirmationEmailBody : r.error),
  );
}
{
  // Same fix applied to story_paragraphs, guarantee_body, and stage_content
  // text fields — not just the one field the user happened to report.
  const r = cap.validate!({
    headline: "Test Literal Newline Fix — Other Fields",
    bullets: ["Real benefit one"],
    story_paragraphs: ["First line.\\nSecond line, same paragraph in the model's mind."],
    guarantee_headline: "30-Day Guarantee",
    guarantee_body: "Try it.\\nIf it doesn't work, full refund.",
  });
  check(
    "1d. Literal backslash-n normalized in story_paragraphs and guarantee_body too",
    r.ok &&
      !(r.args.storyParagraphs as string[])[0]?.includes("\\n") &&
      !(r.args.guaranteeBody as string).includes("\\n"),
    JSON.stringify(r.ok ? { story: r.args.storyParagraphs, guarantee: r.args.guaranteeBody } : r.error),
  );
}

// 2. Natural-language benefits with no comma structure still yields at
//    least the single sentence as one bullet, not an empty array — the
//    capability doesn't invent structure that isn't there; Zeno's own
//    system-prompt instructions are what push it to phrase things as
//    short comma-separated phrases before ever calling this tool.
{
  const r = cap.validate!({
    headline: "Test Headline Two",
    bullets: "Helps you get more calls from your existing website traffic",
  });
  check("2. Single-sentence bullets still produce >=1 bullet", r.ok && Array.isArray(r.args.bullets) && r.args.bullets.length >= 1, JSON.stringify(r.ok ? r.args.bullets : r.error));
}

// 3 + 4 + 5. THE ROUND-TRIP BUG: validate() must accept its OWN previously
// -normalized array output (what the confirm route actually re-validates),
// not just the raw string the model originally sent. This is the exact
// production failure: "Can't run that action: at least one bullet point
// is required" on every confirm.
{
  const first = cap.validate!({
    headline: "Discover What's Costing You Customers From Your Website",
    bullets: "Free website audit, 3 concrete fixes, No sales pitch",
  });
  check("3. First-pass validate succeeds (raw model args)", first.ok);
  if (first.ok) {
    // This is EXACTLY what /api/ai-suite/confirm does: re-validate the
    // already-normalized args object the chat route returned.
    const roundTrip = cap.validate!(first.args);
    check(
      "4. Round-trip validate (confirm route re-validating chat route's output) preserves bullets",
      roundTrip.ok && Array.isArray(roundTrip.args.bullets) && roundTrip.args.bullets.length === 3,
      roundTrip.ok ? JSON.stringify(roundTrip.args.bullets) : roundTrip.error,
    );
    check("5. validate() never returns an empty required bullets array on round-trip", roundTrip.ok && (roundTrip.args.bullets as string[]).length > 0);
  }
}

// 6. Other renamed fields must ALSO survive the same round-trip (the
// systemic fix, not just bullets) — price_cents/accent_color/faq_items/etc.
{
  const first = cap.validate!({
    headline: "Round-Trip All Fields",
    bullets: "One, Two",
    price_cents: 4700,
    accent_color: "#4a7",
    cta_label: "Buy now",
    faq_items: [{ question: "Q1", answer: "A1" }],
  });
  check("6a. First pass: price_cents/accent_color/faq_items set", first.ok && first.args.priceCents === 4700 && first.args.accentColor === "#44aa77" && (first.args.faqItems as unknown[]).length === 1);
  if (first.ok) {
    const roundTrip = cap.validate!(first.args);
    check(
      "6b. Round-trip preserves price_cents/accent_color/cta_label/faq_items",
      roundTrip.ok &&
        roundTrip.args.priceCents === 4700 &&
        roundTrip.args.accentColor === "#44aa77" &&
        roundTrip.args.ctaLabel === "Buy now" &&
        (roundTrip.args.faqItems as unknown[]).length === 1,
      roundTrip.ok ? JSON.stringify(roundTrip.args) : roundTrip.error,
    );
  }
}

// 7. Anti-fabrication rules remain enforced: an unreasonably long headline
// still rejects; faq_items with missing fields are dropped, not fabricated.
{
  const tooLong = cap.validate!({ headline: "x".repeat(200), bullets: "a, b" });
  check("7a. Overlong headline still rejected", !tooLong.ok);
  const junkFaq = cap.validate!({
    headline: "FAQ filter test",
    bullets: "a, b",
    faq_items: [{ question: "Q" }, { question: "Q2", answer: "A2" }],
  });
  check("7b. Malformed FAQ items are dropped, not fabricated", junkFaq.ok && (junkFaq.args.faqItems as unknown[]).length === 1);
}

// Reproduce the exact user-reported failing request end-to-end (execute()
// against a real throwaway sub-account) to prove the full path works, not
// just validate() in isolation.
{
  const db = getAdminDb();
  const auth = getAdminAuth();
  const RUN_ID = `bulletfix${Date.now()}`;
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
  const user = await auth.createUser({ email: `bulletfix-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });

  // Exact reproduction of the user's reported request.
  const proposalArgs = cap.validate!({
    funnel_name: "Free Website Growth Assessment",
    genre: "lead_magnet",
    headline: "Discover What's Costing You Customers From Your Website",
    bullets: "Free website audit, See exactly what's costing you leads, No sales pitch",
  });
  check("8a. Reproduces + validates the exact reported request", proposalArgs.ok);

  if (proposalArgs.ok) {
    // Simulate the confirm route's re-validation exactly.
    const reValidated = cap.validate!(proposalArgs.args);
    check("8b. Confirm-route re-validation of the exact reported request succeeds", reValidated.ok, reValidated.ok ? undefined : reValidated.error);

    if (reValidated.ok) {
      const result = await cap.execute!(
        fakeCtx(SUB_ID, AGENCY_ID, user.uid),
        reValidated.args,
      );
      check("8c. execute() creates the funnel successfully", !!result.ref?.id, result.resultText);
      if (result.ref?.id) {
        await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
      }
    }
  }

  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

// 9. Challenge genre: ticket_tiers must be populated with a real,
// registrable tier + a wired capture form — not left empty.
{
  const db = getAdminDb();
  const auth = getAdminAuth();
  const RUN_ID = `challengefix${Date.now()}`;
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
  const user = await auth.createUser({ email: `challengefix-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });

  const validated = cap.validate!({
    genre: "challenge",
    headline: "5-Day Clean Kitchen Challenge",
    bullets: "One recipe a day, Done-for-you shopping list, Private group support",
  });
  check("9a. Challenge genre validates", validated.ok);
  if (validated.ok) {
    const result = await cap.execute!(
      fakeCtx(SUB_ID, AGENCY_ID, user.uid),
      validated.args,
    );
    const funnelSnap = result.ref?.id ? await db.doc(`funnels/${result.ref.id}`).get() : null;
    const tierSection = funnelSnap?.data()?.sections?.find((s: { type: string }) => s.type === "ticket_tiers");
    const tier = tierSection?.config?.tiers?.[0];
    check("9b. ticket_tiers is populated (not empty)", !!tier, JSON.stringify(tierSection?.config));
    check("9c. tier has a wired capture form", !!tier?.formId);
    check("9d. tier features carry the real bullets", Array.isArray(tier?.features) && tier.features.length === 3);

    if (result.ref?.id) await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
    if (tier?.formId) await db.doc(`forms/${tier.formId}`).delete().catch(() => {});
    const templatesSnap = await db.collection("message_templates").where("subAccountId", "==", SUB_ID).get();
    for (const t of templatesSnap.docs) await t.ref.delete().catch(() => {});
    const workflowsSnap = await db.collection("workflows").where("subAccountId", "==", SUB_ID).get();
    for (const w of workflowsSnap.docs) await w.ref.delete().catch(() => {});
  }

  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

// 10. "Ask instead of draft" edge case (found live 2026-08-03): for a
// consultative/professional-services business with no named lead magnet,
// the model sometimes asked "should this be a free assessment, a
// checklist, or a generic consultation request?" instead of just picking
// one and drafting — even though the tool's own instructions already said
// to write the copy, not ask for it. Root cause: "the ONLY thing you
// should ask for is what the business/offer/audience IS" was ambiguous
// enough that the model read "the specific lead-magnet mechanism" as part
// of "what the offer is." Fixed by explicitly naming that exact question
// as one Zeno must NOT ask, and instructing a labeled default assumption
// instead. Live-verified after the fix: 5/5 real OpenRouter calls against
// the reported prompt called create_funnel directly (0/5 asked), vs. 1/3
// asking before the fix — that live check is ad hoc (ran once, not
// persisted, per this repo's live-model-test convention) since it needs a
// real model call; what's locked in here is deterministic: the exact
// instruction text stays present (so a future edit can't silently weaken
// it) and the "drafted generic mechanism" shape it produces still
// round-trips through validate()/execute() end to end.
{
  check(
    "10a. Description explicitly bans asking about the lead-magnet/offer MECHANISM",
    cap.description.includes("Never ask the user to define marketing copy, visual choices, funnel structure, offer wording") &&
      cap.description.toLowerCase().includes("lead-magnet/consultation mechanism"),
  );
  check(
    "10b. Description instructs a labeled default assumption instead of blocking",
    cap.description.includes("default to a free consultation/scoping-call/assessment offer") &&
      cap.description.includes("A draft in review beats a blocking question every time"),
  );
  check(
    "10c. The narrow legitimate ask-instead-of-draft exception is still documented (only for an EXPLICIT request the tool can't configure)",
    cap.description.includes("the user has explicitly requested something this tool structurally cannot configure without a specific real-world fact they haven't given") &&
      cap.description.includes("Absent such an explicit request, always take the safe free/self-contained default instead of asking"),
  );
  check(
    "10f. Description explicitly bans asking for business name, city, or booking/phone details before building",
    cap.description.includes("do NOT ask for the business/clinic/practice NAME") &&
      cap.description.includes("cta_style silently falls back to a working popup_form when neither cta_booking_page_slug nor cta_phone_number is available"),
  );
  check(
    "10g. Description explicitly bans asking which genre/pricing model to use — defaults to free",
    cap.description.includes("WHICH GENRE/PRICING MODEL to use") &&
      cap.description.includes("default to a free genre — lead_gen or lead_magnet — whenever the user didn't mention pricing"),
  );
}
{
  const db = getAdminDb();
  const auth = getAdminAuth();
  const RUN_ID = `askvsdraft${Date.now()}`;
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
  const user = await auth.createUser({ email: `askvsdraft-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });

  // Mirrors what a correctly-behaving model now sends for the reported
  // prompt (professional-services, no named lead magnet) — a drafted
  // generic-consultation mechanism instead of a blocking question.
  const validated = cap.validate!({
    genre: "lead_gen",
    funnel_name: "Enterprise SOC2 Audit — Lead Gen",
    headline: "Pass Your SOC 2 Audit Without Derailing the Finance Team",
    bullets: "Fixed-scope audit plan, Evidence collection that runs alongside your close, One senior engagement lead",
    cta_label: "Request a scoping call",
  });
  check("10d. Drafted generic-consultation proposal validates (no special field needed for this path)", validated.ok);
  if (validated.ok) {
    const result = await cap.execute!(fakeCtx(SUB_ID, AGENCY_ID, user.uid), validated.args);
    check("10e. execute() creates a complete funnel from the drafted mechanism", !!result.ref?.id, result.resultText);
    if (result.ref?.id) await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
  }

  // 10h/10i/10j — the chiropractic-clinic edge case (found live
  // 2026-08-03, Phase 3 verification): the model was asking for a booking
  // link/phone number before building at all, even though local_service's
  // archetype default is popup_calendar. Fixed by making create_funnel
  // itself fall back to popup_form whenever it wasn't given a REAL
  // cta_booking_page_slug/cta_phone_number — never a half-configured
  // "popup_calendar with no calendar" stored on the doc.
  const noSlugValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Same-Day Chiropractic Care, No Long Wait",
    bullets: ["Walk-ins welcome", "Most visits covered by insurance"],
    visual_archetype: "local_service", // archetype default cta is popup_calendar
  });
  check("10h. Local-service proposal with no booking slug validates", noSlugValidated.ok);
  if (noSlugValidated.ok) {
    const result = await cap.execute!(fakeCtx(SUB_ID, AGENCY_ID, user.uid), noSlugValidated.args);
    const snap = result.ref?.id ? await db.doc(`funnels/${result.ref.id}`).get() : null;
    const sections = snap?.data()?.sections as { type: string; config: Record<string, unknown> }[] | undefined;
    const ctaBearing = sections?.find((s) => (s.config as { cta?: { style?: string } }).cta);
    const cta = ctaBearing?.config.cta as { style?: string; bookingPageSlug?: string } | undefined;
    check(
      "10i. No real slug given -> CTA falls back to popup_form (never a non-functional popup_calendar)",
      cta?.style === "popup_form" && !cta?.bookingPageSlug,
      JSON.stringify(cta),
    );
    if (result.ref?.id) await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
  }

  const withSlugValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Same-Day Chiropractic Care, No Long Wait",
    bullets: ["Walk-ins welcome", "Most visits covered by insurance"],
    visual_archetype: "local_service",
    cta_booking_page_slug: "acme-chiro-consult",
  });
  check("10j. Local-service proposal WITH a real booking slug validates", withSlugValidated.ok);
  if (withSlugValidated.ok) {
    const result = await cap.execute!(fakeCtx(SUB_ID, AGENCY_ID, user.uid), withSlugValidated.args);
    const snap = result.ref?.id ? await db.doc(`funnels/${result.ref.id}`).get() : null;
    const sections = snap?.data()?.sections as { type: string; config: Record<string, unknown> }[] | undefined;
    const ctaBearing = sections?.find((s) => (s.config as { cta?: { style?: string } }).cta);
    const cta = ctaBearing?.config.cta as { style?: string; bookingPageSlug?: string } | undefined;
    check(
      "10k. A real slug IS honored -> CTA becomes a working popup_calendar",
      cta?.style === "popup_calendar" && cta?.bookingPageSlug === "acme-chiro-consult",
      JSON.stringify(cta),
    );
    if (result.ref?.id) await db.doc(`funnels/${result.ref.id}`).delete().catch(() => {});
  }

  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}


// 3. Tool-syntax debris scrub (found live 2026-08-26: a malformed tool call
//    leaked closing-tag + parameter scaffolding into a stored hero
//    subheadline). Debris must be stripped from flat strings, array items,
//    and nested objects — while legit copy survives intact.
{
  const TAG_A = ["<", "/an", "headline", ">"].join("");
  const TAG_B = ["<", "parameter name=", "subheadline"].join("");
  const TAG_C = ["<", "/parameter", ">"].join("");
  const v = cap.validate!({
    headline: `Start Your Pottery Journey${TAG_A}`,
    subheadline: `Fired work you take home.${TAG_A} ${TAG_B}`,
    bullets: [`Two 3-hour sessions${TAG_C}`, "Clay + firing included"],
    genre: "lead_magnet",
    emotional_transformation: "overwhelm_to_clarity",
    sales_argument: { core_promise: `Real coaching${TAG_A}`, belief_chain: [`You can learn this${TAG_B}`] },
  });
  check("3a. debris validate passes", v.ok === true);
  if (v.ok) {
    const args = v.args as Record<string, unknown>;
    const flat = JSON.stringify(args);
    check("3b. no debris survives anywhere in normalized args", !flat.includes(TAG_A) && !flat.includes(TAG_B) && !flat.includes(TAG_C) && !flat.includes("<parameter") && !flat.includes("</an"));
    check("3c. headline copy intact after scrub", args.headline === "Start Your Pottery Journey");
    const bullets = args.bullets as string[];
    check("3d. array items scrubbed, content intact", bullets[0] === "Two 3-hour sessions" && bullets[1] === "Clay + firing included");
  }
}


// 4. Fabrication classes proven dangerous by the 10-customer stress test must
//    rate severity HIGH so hasFabricationRisk() trips the operator warning.
{
  const { evaluateFunnelCopy, hasFabricationRisk } = await import("../src/lib/conversion/copy-quality");
  const mk = (text: string) =>
    evaluateFunnelCopy([{ id: "s1", type: "hero", config: { headline: "H", subheadline: text } }] as never);
  const cases: [string, string][] = [
    ["money-back guarantee", "Try it with our 7-day money-back guarantee."],
    ["refund promise", "If your skin doesn't respond, we will refund you."],
    ["tax status", "Your gift is 100% tax deductible."],
    ["clinical endorsement", "Every formula is dermatologist-tested."],
    ["scarcity cap", "Cohort-only: 8 participants maximum."],
    ["impact ratio", "$25/month funds one child's reading program."],
  ];
  for (const [label, text] of cases) {
    check(`4-${label} trips fabricationRisk`, hasFabricationRisk(mk(text)));
  }
  check("4-clean copy does NOT trip", !hasFabricationRisk(mk("A gentle cleanser for reactive skin, with a full ingredient list on every box.")));
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
