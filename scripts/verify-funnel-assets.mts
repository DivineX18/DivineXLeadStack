// Round-trip coverage for the chunked funnel-asset store (Multistep Journey
// pass increment 1): store -> read -> byte-identical -> delete. Includes a
// multi-chunk file (>700KB) and type/size rejection.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-assets.mts
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { storeFunnelAsset, readFunnelAsset, deleteFunnelAsset, MAX_ASSET_BYTES } = await import("../src/lib/funnels/assets");
let failures = 0;
const check = (l: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures++; };

const base = { subAccountId: "qa-assets-sub", agencyId: "qa-assets-ag", funnelId: "qa-assets-funnel", createdByUid: "qa" };

// 1. Multi-chunk PDF round-trip (1.5MB -> 3 chunks)
const big = Buffer.alloc(1_500_000);
for (let i = 0; i < big.length; i++) big[i] = i % 251;
const stored = await storeFunnelAsset({ ...base, contentType: "application/pdf", filename: "magnet.pdf", bytes: big });
check("1a. multi-chunk store returns id + public url", !!stored.assetId && stored.url.startsWith("/api/funnel-asset/"));
const back = await readFunnelAsset(stored.assetId);
check("1b. read returns byte-identical content", !!back && back.bytes.equals(big));
check("1c. metadata intact (pdf, filename, size)", back?.meta.kind === "pdf" && back?.meta.filename === "magnet.pdf" && back?.meta.sizeBytes === big.length);

// 2. Small image round-trip
const img = Buffer.from("fake-png-bytes-".repeat(100));
const s2 = await storeFunnelAsset({ ...base, contentType: "image/png", filename: "team.png", bytes: img });
const b2 = await readFunnelAsset(s2.assetId);
check("2a. single-chunk image round-trips", !!b2 && b2.bytes.equals(img) && b2.meta.kind === "image");

// 3. Rejections
let rejected = false; try { await storeFunnelAsset({ ...base, contentType: "application/zip", filename: "x.zip", bytes: img }); } catch { rejected = true; }
check("3a. unsupported type rejected", rejected);
rejected = false; try { await storeFunnelAsset({ ...base, contentType: "image/png", filename: "x.png", bytes: Buffer.alloc(MAX_ASSET_BYTES + 1) }); } catch { rejected = true; }
check("3b. oversize rejected", rejected);

// 4. Tenancy-scoped delete
check("4a. wrong sub-account cannot delete", (await deleteFunnelAsset("someone-else", stored.assetId)) === false);
check("4b. owner delete succeeds", (await deleteFunnelAsset(base.subAccountId, stored.assetId)) === true);
check("4c. deleted asset unreadable", (await readFunnelAsset(stored.assetId)) === null);
await deleteFunnelAsset(base.subAccountId, s2.assetId);


// 5. Bridge round-trip (multistep journey): create two funnels, link A's
//    thank-you page to B via updateFunnelServerSide, read the link back,
//    verify the invalid-id sanitizer, then clean up.
const { createFunnelServerSide, updateFunnelServerSide, getFunnel, deleteFunnelServerSide } = await import("../src/lib/server/funnels-service");
const mk = () =>
  createFunnelServerSide({
    subAccountId: "qa-assets-sub", createdByUid: "qa",
    name: "QA bridge", genre: "lead_magnet",
  });
const fa = await mk();
const fb = await mk();
await updateFunnelServerSide({
  subAccountId: "qa-assets-sub", funnelId: fa,
  patch: { bridge: { headline: "You're in", nextFunnelId: fb, nextCta: "See the offer" } },
});
const readBack = await getFunnel("qa-assets-sub", fa);
check("5a. bridge nextFunnelId round-trips", readBack?.bridge?.nextFunnelId === fb);
check("5b. bridge copy round-trips", readBack?.bridge?.headline === "You're in" && readBack?.bridge?.nextCta === "See the offer");
await updateFunnelServerSide({ subAccountId: "qa-assets-sub", funnelId: fa, patch: { bridge: { nextFunnelId: null } } });
const cleared = await getFunnel("qa-assets-sub", fa);
check("5c. bridge unlink (null) persists", cleared?.bridge?.nextFunnelId === null);
await deleteFunnelServerSide("qa-assets-sub", fa);
await deleteFunnelServerSide("qa-assets-sub", fb);
check("5d. cleanup", (await getFunnel("qa-assets-sub", fa)) === null);

// 6. Wiring greps: the seams that connect the pieces (regression tripwires).
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
check("6a. PATCH route sanitizes bridge", src("src/app/api/sub-accounts/[id]/funnels/[funnelId]/route.ts").includes("patch.bridge = bridge"));
check("6b. create_funnel exposes bridge_next_funnel_id", src("src/lib/ai-suite/capabilities.ts").includes("bridge_next_funnel_id"));
check("6c. create_funnel verifies bridge target exists", src("src/lib/ai-suite/capabilities.ts").includes("doesn't match a funnel in this workspace"));
check("6d. create_funnel summary exposes Funnel ID for chaining", src("src/lib/ai-suite/capabilities.ts").includes("Funnel ID: ${funnelId}"));
check("6e. builder saves bridge", src("src/components/funnels/funnel-builder.tsx").includes("nextFunnelId: bridgeNextFunnelId || null"));
check("6f. thanks page renders next-offer card", src("src/app/lp/[funnelId]/thanks/page.tsx").includes("bridge?.nextFunnelId"));
check("6g. capture success bridges to /thanks", src("src/components/funnels/public-funnel-view.tsx").includes("/thanks"));
check("6h. checkout success_url hands off to upsell", src("src/app/api/lp/[funnelId]/checkout/session/route.ts").includes("config.upsellFunnelId\n".trim()));
check("6i. capture success: straight-to-offer when bridge set", src("src/components/funnels/public-funnel-view.tsx").includes("welcome=1&from="));
check("6j. capture success: same-page popup when no next offer", src("src/components/funnels/public-funnel-view.tsx").includes("captureSuccess=") && src("src/components/funnels/sections/cta-button.tsx").includes("if (captured && confirmationPanel) return confirmationPanel;"));
check("6k. checkout (no upsell) lands on thanks?paid=1", src("src/app/api/lp/[funnelId]/checkout/session/route.ts").includes("/thanks?paid=1"));
check("6l. upsell chain-end lands on thanks?paid=1", src("src/app/api/lp/[funnelId]/upsell/[sectionId]/charge/route.ts").includes("/thanks?paid=1") && src("src/components/funnels/sections/upsell-offer-section.tsx").includes("/thanks?paid=1"));
check("6m. thanks page has paid order-confirmation variant", src("src/app/lp/[funnelId]/thanks/page.tsx").includes("Order confirmed"));
check("6n. published pages drop placeholder-only hero media", src("src/components/funnels/sections/hero-section.tsx").includes('published && !config.mediaUrl && config.mediaType !== "none"'));
check("6o. /lp welcome bar renders delivery + download", src("src/app/lp/[funnelId]/page.tsx").includes("Download it now"));


// 8. BUSINESS REALITY ENGINE slice B — identity layer
{
  const db2 = (await import("../src/lib/firebase/admin")).getAdminDb();
  const SUB_ID = "qa-identity-sub";
  await db2.doc(`subAccounts/${SUB_ID}`).set({ id: SUB_ID, name: "QA Identity Co", agencyId: "qa-id-ag",
    accountContact: { name: "Ops", email: "hello@qaidentity.test", phone: "+15125550000" } });
  await db2.doc(`subAccounts/${SUB_ID}/aiAgent/profile`).set({ businessName: "QA Identity Dental" });
  const { resolveWorkspaceIdentity } = await import("../src/lib/funnels/identity");
  const id1 = await resolveWorkspaceIdentity(SUB_ID);
  check("8a. identity resolves real workspace data (profile name wins)",
    id1.businessName === "QA Identity Dental" && id1.email === "hello@qaidentity.test" && id1.phone === "+15125550000");
  check("8b. no invented fields (address/credentials absent)", !("address" in id1) && !("credentials" in id1));
  await db2.doc(`subAccounts/${SUB_ID}/aiAgent/profile`).delete();
  const id2 = await resolveWorkspaceIdentity(SUB_ID);
  check("8c. falls back to workspace name; empty workspace yields empty identity", id2.businessName === "QA Identity Co");
  await db2.doc(`subAccounts/${SUB_ID}`).delete();
  const { sectionHasRenderableContent } = await import("../src/lib/funnels/art-direction");
  check("8d. footer with real data is renderable; empty is not",
    sectionHasRenderableContent({ id: "x", type: "business_footer", config: { businessName: "A" } } as never) === true &&
    sectionHasRenderableContent({ id: "y", type: "business_footer", config: {} } as never) === false);
}

// 9. BUSINESS REALITY ENGINE slices A/C/E — category models + evidence law
{
  const { inferAuthenticityCategory, stockAllowedFor, assetManifest, AUTHENTICITY_MODELS } = await import("../src/lib/funnels/authenticity");
  check("9a. category inference: dental archetype -> health service", inferAuthenticityCategory({ genre: "lead_gen", archetype: "medical_wellness" }) === "local_service_health");
  check("9b. category inference: tripwire -> physical product", inferAuthenticityCategory({ genre: "tripwire", archetype: null }) === "physical_product");
  check("9c. evidence law: product photos may NEVER be stocked", !stockAllowedFor("physical_product", "product_photo") && !stockAllowedFor("physical_product", "packaging_photo"));
  check("9d. evidence law: service ambience MAY be stocked", stockAllowedFor("local_service_health", "office_photo") && stockAllowedFor("b2b_services", "facility_photo"));
  check("9e. nonprofit program photos are never-stock (no counterfeit impact)", !stockAllowedFor("nonprofit", "program_photo"));
  check("9f. every category has a manifest, high-value first", (Object.keys(AUTHENTICITY_MODELS) as (keyof typeof AUTHENTICITY_MODELS)[]).every((c) => {
    const m2 = assetManifest(c, 4);
    return m2.length >= 3 && m2[0].value === "high";
  }));
  check("9g. synthesizable assets are presentation-of-real-facts only (guide cover, deliverable preview)",
    AUTHENTICITY_MODELS.info_product.find((x) => x.kind === "guide_cover")?.fabricability === "synthesizable" &&
    AUTHENTICITY_MODELS.enterprise_software.find((x) => x.kind === "deliverable_preview")?.fabricability === "synthesizable");
}

// 10. EVIDENCE COMPOSITION — the final trust laws
{
  const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const bg = src("src/components/funnels/sections/benefits-grid-section.tsx");
  check("10a. no-pseudo-media law: published rows without images recompose to editorial text", bg.includes("published && !item.imageUrl") && bg.includes("realImageCount === 0"));
  check("10b. builder preview keeps labeled placeholders (operator guidance)", bg.includes("MediaPlaceholder"));
  const caps = src("src/lib/ai-suite/capabilities.ts");
  check("10c. creator-led compact hero (info/coaching portrait -> founder_image avatar)", caps.includes('layout: "founder_image"'));
  check("10d. product-led decision point (product image routed to the offer)", caps.includes("productImageUrl ? s2 : { ...s2, config: { ...c2, productImageUrl: heroImg } }"));
  check("10e. evidence-priority + trust-question reasoning in generation rules", caps.includes("EVIDENCE PRIORITY") && caps.includes("PRIMARY TRUST QUESTION"));
  const { TRUST_QUESTIONS } = await import("../src/lib/funnels/authenticity");
  check("10f. every category carries its trust question (manifest header)", Object.values(TRUST_QUESTIONS).every((q) => q.length > 20));
  check("10g. manifest leads with the trust question", caps.includes("the page must answer"));
}

// 7. Ascend Intelligence bridge (read side): synced frameworks reach the
//    generation-context loader with real content and full card shape.
{
  const { listAscendFrameworks, renderAscendFrameworksAsCards } = await import("../src/lib/conversion/ascend-frameworks");
  const fws = await listAscendFrameworks();
  check("7a. synced Ascend frameworks load (run sync-ascend-frameworks first)", fws.length >= 1);
  check("7b. every framework carries real content", fws.every((f) => f.content.length > 200));
  const cards2 = renderAscendFrameworksAsCards(fws);
  check("7c. cards carry id/levels/title/body", cards2.every((c) => c.id.startsWith("ascend-framework-") && c.levels.includes("sub-account") && c.body.length > 200));
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
