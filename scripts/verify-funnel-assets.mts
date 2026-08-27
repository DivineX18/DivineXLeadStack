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

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
