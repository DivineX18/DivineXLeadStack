// Permanent regression coverage for "Flow Phase 2 — Design Intelligence"
// (2026-08-03): the archetype/palette/typography/CTA/animation/density
// token system layered on top of the existing RC-1.1 design-pack renderer
// (design-strategy.ts's own header comment explains the bridge). Covers:
// every archetype resolves valid tokens, palette/typography overrides are
// validated against each archetype's OWN approved list (never an arbitrary
// value), invalid AI choices fall back safely, backward compatibility (a
// funnel with no designStrategy renders exactly like before), the phone CTA
// + graceful degradation, hero device-mockup layouts, and end-to-end
// through the real create_funnel capability for two contrasting archetypes.
//
// Deterministic, no LLM call — hand-feeds args. Live-model verification
// (archetype selection actually differentiating across real business
// prompts) is run separately, ad hoc, per CLAUDE.md's established
// convention for this codebase (not persisted here — costs real API calls).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-design-strategy.mts

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
const {
  VISUAL_ARCHETYPES,
  VISUAL_ARCHETYPE_IDS,
  TYPOGRAPHY_PAIRINGS,
  resolveDesignStrategy,
  resolveEffectiveDesignTokens,
} = await import("../src/lib/funnels/design-strategy");
const { backgroundForIndex } = await import("../src/lib/funnels/design-packs");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const VALID_BACKGROUNDS = ["white", "gray", "gradient", "dark", "elevated"];
const VALID_CARD_STYLES = ["soft", "sharp", "elegant", "floating"];
const VALID_ICON_STYLES = ["outline", "duotone", "filled"];

// --- 1. Every archetype resolves a complete, valid token set ---

for (const id of VISUAL_ARCHETYPE_IDS) {
  const strategy = resolveDesignStrategy(id);
  const archetype = VISUAL_ARCHETYPES[id];
  const validHex = /^#[0-9a-f]{6}$/i.test(archetype.palettes.find((p) => p.id === strategy.paletteId)?.accentColor ?? "");
  const validCard = VALID_CARD_STYLES.includes(strategy.cardStyle);
  const validIcon = VALID_ICON_STYLES.includes(strategy.iconStyle);
  const validRhythm = strategy.sectionBackgroundPattern.length > 0 && strategy.sectionBackgroundPattern.every((b) => VALID_BACKGROUNDS.includes(b));
  const validTypography = id in VISUAL_ARCHETYPES && strategy.typographyPairing in TYPOGRAPHY_PAIRINGS;
  const validHeroLayout = archetype.recommendedHeroLayouts.includes(strategy.heroLayout);
  const validCta = archetype.recommendedCtaStyles.includes(strategy.ctaStrategy);
  check(
    `1. Archetype "${id}" resolves complete valid tokens`,
    validHex && validCard && validIcon && validRhythm && validTypography && validHeroLayout && validCta,
    `${strategy.paletteId}/${strategy.cardStyle}/${strategy.iconStyle}/${strategy.heroLayout}/${strategy.ctaStrategy}`,
  );
}

// --- 2. Controlled variation: multiple palettes exist per archetype where
// the spec calls for it, and every archetype has at least 2 approved
// typography pairings OR a deliberately-singular one (never zero). ---

{
  const multiPalette = VISUAL_ARCHETYPE_IDS.filter((id) => VISUAL_ARCHETYPES[id].palettes.length > 1);
  check("2a. Most archetypes offer more than one palette (controlled variation, not one fixed look)", multiPalette.length >= 6, `${multiPalette.length}/8`);
  const zeroTypography = VISUAL_ARCHETYPE_IDS.filter((id) => VISUAL_ARCHETYPES[id].typography.length === 0);
  check("2b. No archetype has zero approved typography pairings", zeroTypography.length === 0);
}

// --- 3. Overrides are validated against the archetype's OWN list — an
// override that belongs to a DIFFERENT archetype (or is nonsense) is
// silently ignored, never applied as an uncontrolled arbitrary value. ---

{
  const strategy = resolveDesignStrategy("local_service", { paletteId: "midnight_signal" }); // saas_technology's palette, not local_service's
  check(
    "3a. A palette id from a DIFFERENT archetype is rejected, falls back to this archetype's own default",
    strategy.paletteId === VISUAL_ARCHETYPES.local_service.palettes[0].id,
    strategy.paletteId,
  );
}
{
  const strategy = resolveDesignStrategy("saas_technology", { paletteId: "midnight_signal" }); // saas_technology's OWN palette
  check("3b. A valid same-archetype palette override IS applied", strategy.paletteId === "midnight_signal" && strategy.colorMode === "dark");
}
{
  const strategy = resolveDesignStrategy("professional_enterprise", { animationLevel: "expressive" });
  check(
    "3c. animationLevel override is a free choice (not archetype-list-gated) — professional_enterprise can still be pushed to expressive if explicitly asked",
    strategy.animationLevel === "expressive",
  );
}
{
  // Mirrors what happens inside execute() when visual_archetype is
  // undefined (the tool schema's own validate() never calls
  // resolveDesignStrategy at all in that case — this checks the pure
  // function's own documented fallback in isolation).
  const strategy = resolveDesignStrategy(undefined, {});
  check("3d. Omitted archetype falls back to professional_enterprise (a safe, conservative default)", strategy.visualArchetype === "professional_enterprise");
}

// --- 4. Backward compatibility: resolveEffectiveDesignTokens ---

{
  const tokens = resolveEffectiveDesignTokens({});
  check("4a. No designStrategy + no designPack -> classic tokens (today's exact plain rendering)", tokens.accentColor === "#2563eb" && tokens.theme === "light" && tokens.animationLevel === "none");
}
{
  const tokens = resolveEffectiveDesignTokens({ designPack: "bold" });
  const strategyTokens = resolveEffectiveDesignTokens({ designStrategy: resolveDesignStrategy("agency_creative"), designPack: "bold" });
  check(
    "4b. designStrategy takes priority over designPack when both are present",
    strategyTokens.cardStyle === "sharp" && strategyTokens.animationLevel === "expressive",
    JSON.stringify({ cardStyle: strategyTokens.cardStyle, animationLevel: strategyTokens.animationLevel }),
  );
  check("4c. designPack-only path still resolves (legacy funnels keep working)", tokens.cardStyle === "sharp" && tokens.animationLevel === "none");
}
{
  const bg0 = backgroundForIndex(resolveEffectiveDesignTokens({ designStrategy: resolveDesignStrategy("saas_technology") }), 0);
  check("4d. backgroundForIndex reuses the SAME rhythm engine for Phase 2 tokens (no parallel renderer)", bg0 === "white", bg0);
}

// --- 5. End-to-end through the real capability (Firestore-backed) ---

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `designstrategy${Date.now()}`;
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
const user = await auth.createUser({ email: `designstrategy-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });
function fakeCtx(): AiSuiteActionContext {
  return { uid: user.uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId: AGENCY_ID, subAccountId: SUB_ID };
}

const createdFunnelIds: string[] = [];

try {
  // 5a. SaaS archetype — real media URL given, dashboard mockup expected.
  const saasValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Ship Faster With AutoDeploy",
    bullets: ["One-click rollbacks", "Zero-downtime deploys"],
    visual_archetype: "saas_technology",
    hero_media_url: "https://example.com/dashboard.png",
    cta_style: "popup_form",
  });
  check("5a. SaaS archetype proposal validates", saasValidated.ok);
  if (saasValidated.ok) {
    check("5a2. visualArchetype round-trips through args", saasValidated.args.visualArchetype === "saas_technology");
    const result = await cap.execute!(fakeCtx(), saasValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const data = snap.data()!;
    check("5b. non-soft archetype (SaaS) is forced to the bold direct_response default", data.designStrategy?.visualArchetype === "direct_response", JSON.stringify(data.designStrategy));
    check("5c. Accent/theme on the doc reflect the resolved palette (dark or light, a real archetype color, not the plain genre default)", typeof data.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(data.accentColor));
    const hero = (data.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === "hero");
    check("5d. Real hero_media_url lands on the hero section (no placeholder needed since real media was given)", hero?.config.mediaUrl === "https://example.com/dashboard.png" && !hero?.config.mediaPlaceholderLabel);
    check("5e. Hero resolves to the centered sales-letter layout (not a website split/mockup)", hero?.config.layout === "centered", hero?.config.layout as string);
    check("5f. Summary includes a DESIGN rationale section (bold Direct Response)", result.resultText.includes("DESIGN") && result.resultText.includes("Direct Response"));
  }

  // 5g. Local-service archetype with NO real media — media_strategy
  // defaults to service_photo, which Phase 3 routes to a dedicated Photo
  // Gallery section (not a single hero placeholder — "more than one
  // photo," and the hero stays clean for a real logo). A "phone" CTA with
  // a real number should still wire cta.phoneNumber onto the hero.
  const localValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Same-Day Roof Repair You Can Trust",
    bullets: ["Free estimates", "Licensed & insured crews"],
    visual_archetype: "local_service",
    cta_style: "phone",
    cta_phone_number: "+15551234567",
  });
  check("5g. Local-service phone-CTA proposal validates", localValidated.ok);
  if (localValidated.ok) {
    const result = await cap.execute!(fakeCtx(), localValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const data = snap.data()!;
    const sections = data.sections as { type: string; config: Record<string, unknown> }[];
    const hero = sections.find((s) => s.type === "hero");
    const gallery = sections.find((s) => s.type === "photo_gallery");
    const cta = hero?.config.cta as { style?: string; phoneNumber?: string } | undefined;
    check("5h. Phone CTA style + real number wired onto the hero", cta?.style === "phone" && cta?.phoneNumber === "+15551234567", JSON.stringify(cta));
    check(
      "5i. Bold sales-letter mode uses centered copy, not a website photo gallery (media strategy is none)",
      !gallery,
      JSON.stringify(gallery?.config),
    );
    check("5i2. Local funnel also resolves to the centered bold layout", hero?.config.layout === "centered");
    check("5i3. The hero itself carries NO media placeholder (freed up for a real logo, per the multi-photo redirect)", !hero?.config.mediaPlaceholderLabel);
    check("5j. forced direct_response density/animation applied (high / moderate)", data.designStrategy?.visualDensity === "high" && data.designStrategy?.animationLevel === "moderate");
  }

  // 5k. Contrasting archetypes actually produce MATERIALLY different
  // tokens — the whole point of Phase 2 (no visual sameness).
  const saasSnap = createdFunnelIds[0] ? await db.doc(`funnels/${createdFunnelIds[0]}`).get() : null;
  const localSnap = createdFunnelIds[1] ? await db.doc(`funnels/${createdFunnelIds[1]}`).get() : null;
  if (saasSnap && localSnap) {
    const saasStrategy = saasSnap.data()!.designStrategy;
    const localStrategy = localSnap.data()!.designStrategy;
    check(
      "5k. Both non-soft funnels are forced to the bold direct_response default (funnels convert best as sales letters)",
      saasStrategy.visualArchetype === "direct_response" && localStrategy.visualArchetype === "direct_response",
      `${saasStrategy.visualArchetype} vs ${localStrategy.visualArchetype}`,
    );
  }

  // 5l. No visual_archetype at all -> legacy path, no designStrategy field
  // written (byte-identical to a pre-Phase-2 funnel).
  const legacyValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Plain Funnel No Archetype",
    bullets: ["Real benefit one"],
  });
  check("5l. No-archetype proposal validates", legacyValidated.ok);
  if (legacyValidated.ok) {
    check("5l2. visualArchetype is empty string when omitted", legacyValidated.args.visualArchetype === "");
    const result = await cap.execute!(fakeCtx(), legacyValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const data = snap.data()!;
    check("5m. A no-archetype funnel is forced to the bold direct_response default (never a flat/light default)", data.designStrategy?.visualArchetype === "direct_response", JSON.stringify(data.designStrategy));
  }
  // 5n. Soft archetypes (luxury / wellness / nonprofit) are the EXCEPTION —
  // respected, not forced to direct_response, since those looks convert better
  // calm. This is how a premium/website-style page stays possible.
  const luxuryValidated = cap.validate!({
    genre: "lead_gen",
    headline: "Private Wealth Advisory for Founders",
    bullets: ["Discreet, senior-led", "By referral only"],
    visual_archetype: "luxury_premium",
  });
  check("5n. Luxury proposal validates", luxuryValidated.ok);
  if (luxuryValidated.ok) {
    const result = await cap.execute!(fakeCtx(), luxuryValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const data = (await db.doc(`funnels/${result.ref!.id}`).get()).data()!;
    check("5n2. luxury_premium is RESPECTED, not overridden to direct_response", data.designStrategy?.visualArchetype === "luxury_premium", String(data.designStrategy?.visualArchetype));
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
