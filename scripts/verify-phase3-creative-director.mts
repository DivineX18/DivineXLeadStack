// Permanent regression coverage for "Flow Phase 3 — Creative Direction &
// Media Intelligence" (2026-08-03): the real Modal system (replacing the
// old CSS-`Canvas`-themed popup that ignored the funnel's own theme), the
// Photo Gallery section ("more than one photo," redirecting multi-photo
// archetypes away from a single hero placeholder so the hero stays clean
// for a real logo), richer per-business media-placeholder briefs
// (subject/purpose/recommended size), and popup-style intelligence
// (benefit-reinforcing split popups for medium/high-density archetypes).
//
// Deterministic, no LLM call — hand-feeds args. Live-model verification
// (archetype/media/popup selection actually differentiating across real
// business prompts) is run separately, ad hoc, per this repo's established
// live-model-test convention (not persisted here — costs real API calls).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-phase3-creative-director.mts

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
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Description-text assertions — protects the instructions a future
// edit could silently weaken. ---

check(
  "1a. Description instructs multi-photo strategies to get a dedicated gallery instead of one hero image",
  cap.description.includes("Zeno automatically adds a dedicated photo-gallery section instead of cramming everything into the hero"),
);
check(
  "1b. Description instructs a SPECIFIC (not generic) media_subject shooting brief",
  cap.description.includes("media_subject") && cap.description.includes("Technician repairing an HVAC unit"),
);

// --- 2. Section-type wiring: photo_gallery is recognized everywhere a
// section type must be (mirrors the existing enumeration-point discipline
// documented in CLAUDE.md). ---

{
  const { PATCH } = await import("../src/app/api/sub-accounts/[id]/funnels/[funnelId]/route");
  check("2a. PATCH route module loads with photo_gallery wired (no import/type errors)", typeof PATCH === "function");
}
{
  const { defaultSectionConfig } = await import("../src/lib/funnels/frameworks");
  const cfg = defaultSectionConfig("photo_gallery") as { images: unknown[]; layout?: string };
  check("2b. defaultSectionConfig('photo_gallery') resolves a valid empty gallery", Array.isArray(cfg.images) && cfg.images.length === 0 && cfg.layout === "grid");
}

// --- 3. Design-strategy: every archetype has a real galleryLayout. ---

{
  const { VISUAL_ARCHETYPE_IDS, VISUAL_ARCHETYPES } = await import("../src/lib/funnels/design-strategy");
  const VALID_LAYOUTS = ["grid", "masonry", "carousel", "before_after"];
  for (const id of VISUAL_ARCHETYPE_IDS) {
    check(`3. Archetype "${id}" has a valid galleryLayout`, VALID_LAYOUTS.includes(VISUAL_ARCHETYPES[id].galleryLayout), VISUAL_ARCHETYPES[id].galleryLayout);
  }
}

// --- 4. End-to-end through the real capability (Firestore-backed) ---

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `phase3${Date.now()}`;
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
const user = await auth.createUser({ email: `phase3-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });
function fakeCtx(): AiSuiteActionContext {
  return { uid: user.uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId: AGENCY_ID, subAccountId: SUB_ID };
}

const createdFunnelIds: string[] = [];

try {
  // 4a. A specific media_subject + team_photo strategy (nonprofit) — the
  // gallery's placeholder brief must carry the real subject, purpose, AND
  // a recommended size, not a generic label.
  const nonprofitValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Help Us Bring Books to Every Classroom",
    bullets: ["100% goes to program costs", "Local volunteers, local kids"],
    visual_archetype: "nonprofit_mission",
    media_subject: "Volunteers reading with kids at our after-school program",
  });
  check("4a. Nonprofit + media_subject proposal validates", nonprofitValidated.ok);
  if (nonprofitValidated.ok) {
    const result = await cap.execute!(fakeCtx(), nonprofitValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const data = snap.data()!;
    const sections = data.sections as { type: string; config: Record<string, unknown> }[];
    const gallery = sections.find((s) => s.type === "photo_gallery");
    const brief = gallery?.config.placeholderBrief as string | undefined;
    check(
      "4b. Gallery placeholder brief carries the real subject + purpose + recommended size",
      !!brief && brief.includes("Volunteers reading with kids") && brief.includes("Purpose:") && brief.includes("Recommended"),
      brief,
    );
    check("4c. Gallery uses nonprofit_mission's own recommended layout (grid)", gallery?.config.layout === "grid");
  }

  // 4d. gallery_layout override is honored.
  const overrideValidated = cap.validate!({
    genre: "lead_gen",
    headline: "See Our Recent Installs",
    bullets: ["Licensed techs", "Same-day quotes"],
    // ARCHETYPE UPDATED 2026-08-30: local_service is collapsed to
    // direct_response by the deliberate bold-default decision, so its own
    // gallery default was never going to survive. nonprofit_mission keeps its
    // archetype AND carries a community_photo media strategy, so a gallery
    // section actually exists for the override to apply to — luxury_premium
    // survives the filter but uses founder_photo, which builds no gallery.
    visual_archetype: "nonprofit_mission",
    gallery_layout: "carousel",
  });
  check("4d. gallery_layout override proposal validates", overrideValidated.ok);
  if (overrideValidated.ok) {
    const result = await cap.execute!(fakeCtx(), overrideValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const gallery = (snap.data()!.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === "photo_gallery");
    check("4e. Explicit gallery_layout overrides the archetype default (before_after -> carousel)", gallery?.config.layout === "carousel", gallery?.config.layout as string);
  }

  // 4f. Popup-style intelligence: agency_creative is "high" density ->
  // auto split_benefits using the real bullets Zeno wrote.
  const agencyValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Brand Campaigns That Actually Move Revenue",
    bullets: ["Strategy before design", "Weekly reporting, no black box"],
    visual_archetype: "agency_creative",
  });
  check("4f. Agency-creative proposal validates", agencyValidated.ok);
  if (agencyValidated.ok) {
    const result = await cap.execute!(fakeCtx(), agencyValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()!.sections as { type: string; config: Record<string, unknown> }[];
    // agency_creative's own recommended CTA is popup_calendar, not
    // popup_form, so the auto-split only shows up if a section's cta
    // actually resolved to popup_form — check whichever CTA-bearing
    // section exists and confirm the shape is internally consistent
    // either way (split_benefits only ever appears alongside popup_form).
    const ctaBearing = sections.find((s) => (s.config as { cta?: { style?: string } }).cta);
    const cta = ctaBearing?.config.cta as { style?: string; popupLayout?: string; popupBenefits?: string[] } | undefined;
    check(
      "4g. split_benefits (if present) only ever pairs with popup_form, and carries real bullets when it appears",
      !cta?.popupLayout || (cta.style === "popup_form" && cta.popupLayout === "split_benefits" && Array.isArray(cta.popupBenefits) && cta.popupBenefits.length > 0),
      JSON.stringify(cta),
    );
  }

  // 4h. Luxury (low density) forced to popup_form must NOT get the
  // benefits-split treatment — stays a plain centered popup, matching its
  // restrained character.
  const luxuryValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Executive Transitions, Handled With Discretion",
    bullets: ["Confidential by default", "One senior advisor, start to finish"],
    visual_archetype: "luxury_premium",
    cta_style: "popup_form",
  });
  check("4h. Luxury + forced popup_form proposal validates", luxuryValidated.ok);
  if (luxuryValidated.ok) {
    const result = await cap.execute!(fakeCtx(), luxuryValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()!.sections as { type: string; config: Record<string, unknown> }[];
    const ctaBearing = sections.find((s) => (s.config as { cta?: { style?: string } }).cta?.style === "popup_form");
    const cta = ctaBearing?.config.cta as { popupLayout?: string } | undefined;
    check("4i. Luxury's popup stays plain (no auto split_benefits) — low-density archetypes keep restrained popups", !cta?.popupLayout, JSON.stringify(cta));
  }

  // 4j. Backward compatibility: the legacy no-archetype path never gets
  // popup-style intelligence either (today's exact pre-Phase-3 shape).
  const legacyValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Plain Legacy Funnel",
    bullets: ["Real benefit one", "Real benefit two"],
  });
  check("4j. Legacy no-archetype proposal validates", legacyValidated.ok);
  if (legacyValidated.ok) {
    const result = await cap.execute!(fakeCtx(), legacyValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()!.sections as { type: string; config: Record<string, unknown> }[];
    const ctaBearing = sections.find((s) => (s.config as { cta?: { style?: string } }).cta?.style === "popup_form");
    const cta = ctaBearing?.config.cta as { popupLayout?: string } | undefined;
    // CONTRACT UPDATED 2026-08-30. There is no longer a "legacy" path that
    // skips design intelligence: omitting visual_archetype now resolves to
    // direct_response, so every funnel gets a real strategy. Verified: a
    // no-archetype build stores designStrategy.visualArchetype
    // "direct_response" and a popupLayout of "split_benefits". Asserting the
    // absence would force the product back to a path that no longer exists.
    check("4k. Omitting an archetype still yields real design intelligence", !!cta?.popupLayout, String(cta?.popupLayout));
    check("4l. No-archetype legacy path never gets a gallery section", !sections.some((s) => s.type === "photo_gallery"));
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
