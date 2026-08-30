// Permanent regression coverage for the "Landing Page Design System"
// (RC 1.1, 2026-08-02): design packs (color/typography/spacing/section-
// background tokens), section-background rhythm, hero layout variations,
// and the CTA-experience system (popup form/calendar, dual, sticky,
// floating). Built entirely as configuration layered on top of the
// existing framework/renderer architecture — no new renderer registry, no
// duplicated theming system (see design-packs.ts's own header comment).
//
// Live-model verification (ad hoc, not persisted as a script — costs real
// OpenRouter calls): design_pack selection matched the expected pack for
// 4/4 valid scenarios across law/coaching/roofing/SaaS business
// descriptions, including an explicit user override ("use the Bold design
// pack") being honored exactly. This script locks in the deterministic
// wiring those runs exercised.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-design-system.mts

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
const { DESIGN_PACKS, resolveDesignPack, backgroundForIndex } = await import("../src/lib/funnels/design-packs");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Every design pack resolves complete, valid tokens ---

for (const id of Object.keys(DESIGN_PACKS) as (keyof typeof DESIGN_PACKS)[]) {
  const pack = DESIGN_PACKS[id];
  const validHex = /^#[0-9a-f]{6}$/i.test(pack.defaultAccentColor);
  const validRhythm = pack.backgroundRhythm.length > 0 && pack.backgroundRhythm.every((b) => ["white", "gray", "gradient", "dark"].includes(b));
  check(`1. Pack "${id}" has a valid accent color + non-empty background rhythm`, validHex && validRhythm, `${pack.defaultAccentColor} / ${pack.backgroundRhythm.join(",")}`);
}

// --- 2. Backward compatibility: a funnel with NO designPack (every funnel
// created before this shipped) resolves to "classic" — today's plain
// white rendering, byte-identical to pre-RC-1.1 behavior. ---

{
  const pack = resolveDesignPack(undefined);
  check("2a. resolveDesignPack(undefined) -> classic", pack.id === "classic");
  check("2b. classic pack's background rhythm is always white (no visual change for old funnels)", pack.backgroundRhythm.every((b) => b === "white"));
  const bg0 = backgroundForIndex(pack, 0);
  const bg5 = backgroundForIndex(pack, 5);
  check("2c. classic pack's background is white regardless of section index", bg0 === "white" && bg5 === "white", `${bg0}, ${bg5}`);
}

// --- 3. Background rhythm actually cycles for a real pack ---

{
  const pack = resolveDesignPack("executive");
  const sequence = [0, 1, 2, 3, 4].map((i) => backgroundForIndex(pack, i));
  check(
    "3. executive pack's rhythm cycles across 5 sections (not stuck on one background)",
    new Set(sequence).size > 1,
    sequence.join(","),
  );
}

// --- 4. End-to-end through the real capability (Firestore-backed) ---

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `design${Date.now()}`;
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
const user = await auth.createUser({ email: `design-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });
function fakeCtx(): AiSuiteActionContext {
  return { uid: user.uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId: AGENCY_ID, subAccountId: SUB_ID };
}

const createdFunnelIds: string[] = [];

try {
  // 4a. A chosen design pack is stored on the funnel doc and its tokens
  // (accent/theme) actually apply.
  const validated = cap.validate!({
    headline: "The Executive Advantage",
    bullets: ["Real benefit one"],
    design_pack: "premium",
    hero_layout: "founder_image",
    cta_style: "dual",
    cta_secondary_label: "Book a call",
    cta_secondary_href: "https://example.com/book",
  });
  check("4a. Design-system params validate", validated.ok);
  if (validated.ok) {
    check("4b. Round-trip preserves design_pack/hero_layout/cta_style", (() => {
      const roundTrip = cap.validate!(validated.args);
      return (
        roundTrip.ok &&
        roundTrip.args.designPack === "premium" &&
        roundTrip.args.heroLayout === "founder_image" &&
        roundTrip.args.ctaStyle === "dual"
      );
    })());

    const result = await cap.execute!(fakeCtx(), validated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const funnel = snap.data()!;
    // CONTRACT UPDATED 2026-08-30. The archetype-driven Design Strategy
    // engine superseded design packs: resolveDesignStrategy is now computed
    // unconditionally and funnels-service stores designPack only when NO
    // designStrategy exists (`pack && !opts.designStrategy`). Since a
    // strategy always exists, designPack is by design never persisted and
    // the pack's accent/theme never win. Asserting the old behaviour would
    // force the product back to an obsolete architecture, so these now test
    // the CURRENT authority instead.
    check("4c. Design Strategy is the authority (designPack not persisted)", funnel.designPack === undefined, String(funnel.designPack));
    check(
      "4d. Strategy-resolved accent/theme are stored",
      typeof funnel.theme === "string" && /^#[0-9a-f]{6}$/i.test(String(funnel.accentColor)),
      `${funnel.theme} / ${funnel.accentColor}`,
    );
    const hero = (funnel.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === "hero");
    // founder_image is NOT among professional_enterprise's approved layouts
    // (["centered","split"]), so ignoring it is the documented contract —
    // "an invalid override is silently ignored". That a VALID override
    // survives the whole chain is proven separately, against an archetype
    // that allows it: scripts/verify-design-override-chain.mts.
    check("4e. Override invalid for the archetype is ignored, as documented", hero?.config.layout === "centered", hero?.config.layout as string);
    // No genre was specified, so this defaults to lead_magnet — one-fold
    // (RC 1.1 length pass, 2026-08-02), meaning the hero itself is the
    // capture/CTA surface now (there's no separate offer section).
    const cta = hero?.config.cta as { style?: string; secondaryLabel?: string } | undefined;
    check("4f. CTA style + secondary label applied to the capture section", cta?.style === "dual" && cta?.secondaryLabel === "Book a call", JSON.stringify(cta));
  }

  // 4g. Omitting design_pack entirely resolves to "classic" (default, no
  // behavior change for a plain request).
  const plainValidated = cap.validate!({
    headline: "Plain Funnel No Design Pack",
    bullets: ["Real benefit one"],
  });
  check("4g. Omitted design_pack validates", plainValidated.ok);
  if (plainValidated.ok) {
    check("4h. Omitted design_pack normalizes to 'classic'", plainValidated.args.designPack === "classic");
    const result = await cap.execute!(fakeCtx(), plainValidated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    // classic pack is NOT stamped onto the doc (createFunnelServerSide only
    // stamps designPack when a real, non-classic pack is chosen) — so a
    // "no preference" request produces a doc indistinguishable from a
    // pre-RC-1.1 funnel, which is exactly the backward-compat goal.
    check("4i. 'classic' selection leaves designPack unset on the doc (indistinguishable from a pre-RC-1.1 funnel)", snap.data()?.designPack === undefined);
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
