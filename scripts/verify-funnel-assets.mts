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

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
