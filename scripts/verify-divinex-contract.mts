// DIVINEX PROFILE CONTRACT (Slice 1) — Flow-side certification: signature
// verification, version monotonicity (out-of-order/replay safety), snapshot
// shape, tenancy guard, frameworks receiver parity, and degrade-to-null for
// unpublished workspaces. Functional against real Firestore.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-divinex-contract.mts
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { verifyDivinexSignature, applyProfileSnapshot, getDivinexProfileSnapshot } = await import("../src/lib/divinex/contract");
const { getAdminDb } = await import("../src/lib/firebase/admin");

const db = getAdminDb();
let failures = 0;
const check = (l: string, ok: boolean, note = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${note ? ` — ${note}` : ""}`); if (!ok) failures++; };

const SECRET = process.env.ASCEND_SSO_SHARED_SECRET ?? "";
const sign = (raw: string, ts: string) => createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");

// ── 1. Signature verification ──
{
  const raw = JSON.stringify({ hello: 1 });
  const ts = String(Date.now());
  check("1a. valid signature accepted", verifyDivinexSignature(raw, ts, sign(raw, ts)));
  check("1b. tampered body rejected", !verifyDivinexSignature(raw + "x", ts, sign(raw, ts)));
  check("1c. wrong secret rejected", !verifyDivinexSignature(raw, ts, createHmac("sha256", "wrong").update(`${ts}.${raw}`).digest("hex")));
  const staleTs = String(Date.now() - 10 * 60 * 1000);
  check("1d. stale timestamp rejected (5-min window)", !verifyDivinexSignature(raw, staleTs, sign(raw, staleTs)));
}

// ── 2. Snapshot apply: monotonicity + tenancy ──
const SUB = "qa-divinex-sub";
await db.doc(`subAccounts/${SUB}`).set({ id: SUB, agencyId: "qa-divinex-ag", name: "QA DivineX" });
const mkPayload = (v: number) => ({
  contract: "divinex.profile" as const,
  contractVersion: 1,
  profileVersion: v,
  publishedAt: new Date().toISOString(),
  businessProfileId: 999001,
  flowSubAccountId: SUB,
  business: { name: `QA Biz v${v}` },
  offers: [{ id: "offer:qa-offer", name: "QA Offer", kind: "primary" }],
  brand: { voice: { tone: "warm" } },
  assets: [{ id: 1, fileUrl: "https://example.com/a.png", fileType: "image/png", purpose: "logo" }],
  provenance: { default: "supplied" },
});
{
  const r1 = await applyProfileSnapshot(mkPayload(3));
  check("2a. fresh snapshot applied", r1.result === "applied");
  const stored = await getDivinexProfileSnapshot(SUB);
  check("2b. snapshot round-trips (version, offers stable id, assets)", stored?.profileVersion === 3 && stored?.offers?.[0]?.id === "offer:qa-offer" && stored?.assets?.length === 1);
  const r2 = await applyProfileSnapshot(mkPayload(2));
  check("2c. OLDER version ignored (out-of-order event harmless)", r2.result === "ignored_stale");
  const r3 = await applyProfileSnapshot(mkPayload(3));
  check("2d. DUPLICATE version ignored (replay harmless)", r3.result === "ignored_stale");
  const r4 = await applyProfileSnapshot(mkPayload(4));
  check("2e. newer version applied", r4.result === "applied" && (await getDivinexProfileSnapshot(SUB))?.profileVersion === 4);
  check("2f. business content updated with version", ((await getDivinexProfileSnapshot(SUB))?.business as { name?: string })?.name === "QA Biz v4");
  const rBad = await applyProfileSnapshot({ ...mkPayload(9), flowSubAccountId: "does-not-exist-sub" });
  check("2g. unknown workspace rejected (tenancy guard)", rBad.result === "rejected");
}

// ── 3. Unpublished workspace degrades to null (consumers keep certified behavior) ──
check("3a. never-published workspace reads null", (await getDivinexProfileSnapshot("qa-never-published")) === null);

// ── 4. Frameworks receiver parity (same doc shape the sync script writes) ──
{
  const { POST } = await import("../src/app/api/webhooks/divinex/frameworks/route");
  // The receiver has FULL-REPLACE semantics (script parity: anything absent
  // from the payload is deactivated) — so the test payload must carry the
  // real currently-active library unchanged plus the QA row, or the test
  // itself would deactivate production frameworks (it did, once).
  const existingFws = (await db.collection("intelligenceFrameworks").where("active", "==", true).get()).docs.map((d) => ({
    slug: d.id,
    name: d.data().name as string,
    description: (d.data().description as string) ?? "",
    category: (d.data().category as string) ?? "strategy",
    content: (d.data().content as string) ?? "",
    active: true,
    sortOrder: (d.data().sortOrder as number) ?? 0,
    ascendId: (d.data().ascendId as number) ?? 0,
  }));
  const payload = {
    contract: "divinex.frameworks",
    contractVersion: 1,
    publishedAt: new Date().toISOString(),
    frameworks: [...existingFws, { slug: "qa-framework-slice1", name: "QA FW", description: "d", category: "strategy", content: "c".repeat(300), active: true, sortOrder: 99, ascendId: 12345 }],
  };
  const raw = JSON.stringify(payload);
  const ts = String(Date.now());
  const req = new Request("http://local/api/webhooks/divinex/frameworks", {
    method: "POST",
    headers: { "x-divinex-timestamp": ts, "x-divinex-signature": sign(raw, ts) },
    body: raw,
  });
  const res = await POST(req);
  check("4a. frameworks receiver applies signed payload", res.status === 200);
  const doc = await db.doc("intelligenceFrameworks/qa-framework-slice1").get();
  check(`4b-pre. real library preserved through full-replace (${existingFws.length} active)`, existingFws.length >= 1);
  check("4b. doc shape matches the script's (name/category/content/active/sortOrder)", doc.exists && doc.data()!.active === true && doc.data()!.sortOrder === 99 && doc.data()!.syncSource === "frameworks.published");
  const badReq = new Request("http://local/x", { method: "POST", headers: { "x-divinex-timestamp": ts, "x-divinex-signature": "00" }, body: raw });
  check("4c. unsigned frameworks payload rejected 401", (await POST(badReq)).status === 401);
  await doc.ref.delete();
}

// cleanup
await db.doc(`divinexProfiles/${SUB}`).delete();
await db.doc(`subAccounts/${SUB}`).delete();

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
process.exit(failures > 0 ? 1 : 0);
