/**
 * ONE WORKSPACE, ONE BUSINESS — ACROSS BOTH STORES.
 *
 * The defect this exists to prevent actually happened: Unified Intelligence
 * resolved to DivineX (bp 3) while Asset Studio resolved to Apostille Corp
 * (bp 27) inside the SAME customer workspace, because the relationship is
 * recorded in two independent places:
 *
 *   Flow    Firestore  workspaceMappings.primaryAscendBusinessProfileId
 *   Ascend  Postgres   divinex_workspace_mappings.business_profile_id
 *
 * Intelligence reads the first; Asset Studio reads the second. Nothing kept
 * them in agreement, so updating one silently produced mixed business identity
 * — the worst failure this product can have, because every output looks
 * confident and belongs to someone else.
 *
 * Consolidating to a single store is real work and correctly deferred. What
 * cannot wait is DETECTION: a workspace resolving to two different businesses
 * must be loud, not silent.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-workspace-identity-coherence.mts
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const ASCEND_ENV = "/Users/boss/DivineX-Business-Intelligence/.env.local";
for (const l of readFileSync(ASCEND_ENV, "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && l.startsWith("DATABASE_URL")) process.env.ASCEND_DATABASE_URL ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const require = createRequire("/Users/boss/DivineX-Business-Intelligence/node_modules/.pnpm/pg@8.20.0/node_modules/");
const { Pool } = require("pg") as { Pool: new (o: unknown) => { query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> } };
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const db = getAdminDb();
const pool = new Pool({ connectionString: process.env.ASCEND_DATABASE_URL });

// ── Every mapped workspace must agree across both stores ───────────────────
const flowSnap = await db.collection("workspaceMappings").get();
const flow = new Map<string, { bp: number | null; status: string }>();
for (const d of flowSnap.docs) {
  const x = d.data() as { flowSubAccountId?: string; primaryAscendBusinessProfileId?: number; status?: string };
  // Flow stores this as a STRING ("3"), Ascend as an INTEGER (3). The values
  // agree; the types never did. Normalising here is the whole reason a naive
  // comparison between the two stores can look like a conflict — or, worse,
  // look equal when it is not.
  const rawBp = x.primaryAscendBusinessProfileId as unknown;
  const bp = rawBp === undefined || rawBp === null || rawBp === "" ? null : Number(rawBp);
  if (x.flowSubAccountId) flow.set(x.flowSubAccountId, { bp: Number.isFinite(bp as number) ? (bp as number) : null, status: x.status ?? "" });
}

const pgRows = (await pool.query("select leadstack_sub_account_id sa, business_profile_id bp, connection_status st from divinex_workspace_mappings")).rows;
const ascend = new Map<string, { bp: number | null; status: string }>();
for (const r of pgRows) ascend.set(String(r.sa), { bp: r.bp === null ? null : Number(r.bp), status: String(r.st) });

console.log(`Flow Firestore mappings: ${flow.size} · Ascend Postgres mappings: ${ascend.size}\n`);

const conflicts: string[] = [];
for (const [sa, f] of flow) {
  const a = ascend.get(sa);
  if (!a) continue;                       // one-sided is a gap, not a contradiction
  if (f.bp !== a.bp) conflicts.push(`${sa}: Intelligence=bp${f.bp} but AssetStudio=bp${a.bp}`);
}
check("no workspace resolves to two different businesses", conflicts.length === 0, conflicts.join(" | "));

// A workspace known to only ONE store is a real risk too: whichever surface
// reads the other store shows nothing, or worse, the wrong default.
const onlyFlow = [...flow.keys()].filter((k) => !ascend.has(k));
const onlyAscend = [...ascend.keys()].filter((k) => !flow.has(k));
// A one-sided mapping degrades gracefully by design — the unmapped surface
// shows its honest "link a business profile" empty state rather than guessing.
// Reported, not failed: silence is the risk, not absence.
if (onlyAscend.length) console.log(`NOTE mapped in Ascend only (Asset Studio works, Intelligence shows its empty state): ${onlyAscend.join(", ")}`);
if (onlyFlow.length) console.log(`NOTE mapped in Flow only (Intelligence works, Asset Studio will not): ${onlyFlow.join(", ")}`);

// ── The certified staging workspace, end to end ────────────────────────────
const SA = "MEYB8CbWlE5fxAn3TJOp";
const f = flow.get(SA), a = ascend.get(SA);
check("staging workspace is mapped in both stores", !!f && !!a);
check("both stores agree on the business profile", f?.bp === a?.bp, `flow=${f?.bp} ascend=${a?.bp}`);
check("the mapping is active", f?.status === "active" && a?.status === "active");

const [prof] = (await pool.query("select business_name, website_url from business_profiles where id=$1", [f?.bp])).rows;
check("that profile is DivineX", String(prof?.business_name) === "DivineX", String(prof?.business_name));
check("with the right website", String(prof?.website_url).includes("divinex.io"), String(prof?.website_url));

const [assess] = (await pool.query("select count(*)::int c from zeno_assessments where business_profile_id=$1", [f?.bp])).rows;
const [scans] = (await pool.query("select count(*)::int c from growth_scans where business_profile_id=$1", [f?.bp])).rows;
const [audits] = (await pool.query("select count(*)::int c from cro_audits where business_profile_id=$1", [f?.bp])).rows;
check("the profile carries its own assessment", Number(assess.c) > 0, `${assess.c}`);
check("the profile carries its own scan history", Number(scans.c) > 0, `${scans.c}`);
console.log(`NOTE cro_audits for bp${f?.bp}: ${audits.c}`);

// Generated assets must belong to the same business the Intelligence snapshot
// resolves to — the exact mismatch that shipped Apostille copy into DivineX.
const [wrongBiz] = (await pool.query(
  "select count(*)::int c from generated_assets where created_at > now() - interval '2 hours' and business_profile_id <> $1", [f?.bp])).rows;
check("recent generated assets belong to this workspace's business", Number(wrongBiz.c) === 0, `${wrongBiz.c} foreign`);

await pool.end();
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
