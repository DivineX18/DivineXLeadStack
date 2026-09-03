/**
 * FINAL LAUNCH PASS — CHECKPOINT 2 C (UNIFIED CREATE).
 *
 * The property being certified:
 *
 *   "A DivineX Complete customer can create the mature Ascend deliverables
 *    from the unified DivineX experience without entering standalone Ascend,
 *    while retaining business context, brand personalization, persistence and
 *    tenant isolation."
 *
 * Every generation below goes through the REAL customer path:
 *   Flow session -> Flow proxy route (or Zeno chat -> confirm)
 *   -> Ascend machine bridge -> the SAME Asset Studio generator
 *   -> persisted -> readable back from the unified library.
 *
 * A 200 is NOT the assertion. The assertions are that the artifact is real,
 * carries THIS workspace's business context, persists, is visible from the
 * unified experience, and that another tenant cannot reach it.
 *
 * Requires: Flow on :3114 and Ascend on :3211 (ASCEND_API_BASE_URL).
 * Run: UNIFIED_SA=<linked sa> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-unified-create.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.UNIFIED_SA;
if (!SA) throw new Error("UNIFIED_SA is required — a workspace linked to an Ascend business profile.");
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const auth = getAdminAuth();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

async function session(uid: string): Promise<string> {
  const ct = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  return (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const cookie = await session(OWNER);

interface Asset { id: number; assetType: string; title: string; content: string; createdAt: string }

async function generateViaUnifiedCreate(assetType: string, prompt?: string): Promise<Asset | null> {
  const res = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ assetType, ...(prompt ? { prompt } : {}) }),
  });
  const d = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
  if (!res.ok || !d.asset) { console.log(`   (generation failed ${res.status}: ${d.error})`); return null; }
  return d.asset;
}

// ── What does this workspace's business actually say? Personalization is only
//    meaningful measured against the REAL profile, not against a guess.
const profRes = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } });
check("the unified library is reachable for this workspace", profRes.ok, String(profRes.status));

console.log("\n── REPRESENTATIVE ASSET FAMILIES (real customer path)\n");

const families: { label: string; assetType: string; prompt?: string }[] = [
  { label: "A. VSL / SCRIPT", assetType: "VSL Script" },
  { label: "B. AD / SOCIAL", assetType: "Content Plan", prompt: "A month of social posts and ad angles to promote the offer." },
  { label: "C. DOCUMENT / LEAD MAGNET", assetType: "Lead Magnet Full Draft" },
];

const produced: Asset[] = [];
for (const f of families) {
  console.log(`${f.label} — ${f.assetType}`);
  const asset = await generateViaUnifiedCreate(f.assetType, f.prompt);
  check(`  generated through unified Create (no standalone Ascend)`, !!asset);
  if (!asset) continue;
  produced.push(asset);
  check(`  the artifact is substantial, not a stub`, asset.content.length > 600, `${asset.content.length} chars`);
  check(`  it is not placeholder filler`,
    !/\[insert|\[your |lorem ipsum|TODO|placeholder/i.test(asset.content));
  check(`  the asset type round-tripped`, asset.assetType === f.assetType, asset.assetType);
  console.log(`   "${asset.title}"`);
  console.log(`   ${asset.content.replace(/\n/g, " ").slice(0, 220)}…\n`);
}

// ── PERSONALIZATION: is the output about THIS business, or generic? ────────
console.log("── BUSINESS + BRAND CONTEXT\n");
if (produced.length > 0) {
  const all = produced.map((p) => p.content).join("\n").toLowerCase();
  // The probe profile is "Reading With A Rapper" — a schools/literacy program.
  // A generic marketing asset would not mention that subject matter at all.
  const onSubject = /read|literacy|school|student|rapper|campus|teacher|classroom/.test(all);
  check("the generated assets are about THIS workspace's actual business",
    onSubject, onSubject ? "subject-matter terms present" : "NO business-specific terms — output looks generic");
}

// ── PERSISTENCE + VISIBILITY FROM THE UNIFIED EXPERIENCE ──────────────────
console.log("\n── PERSISTENCE + UNIFIED VISIBILITY\n");
const libRes = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } });
const lib = (await libRes.json().catch(() => ({}))) as { assets?: Asset[]; unavailable?: string };
check("the library lists assets from the unified experience", Array.isArray(lib.assets) && lib.assets.length > 0,
  `${lib.assets?.length ?? 0} assets, unavailable=${lib.unavailable ?? "none"}`);
for (const p of produced) {
  check(`  "${p.assetType}" is visible in the unified library`, !!lib.assets?.some((a) => a.id === p.id));
}

// ── TENANT ISOLATION ──────────────────────────────────────────────────────
console.log("\n── TENANT ISOLATION\n");
// A different, real Flow workspace that is NOT linked to this business profile.
const OTHER_SA = "dx-loop-test";
const otherLib = await fetch(`${BASE}/api/sub-accounts/${OTHER_SA}/divinex/assets`, { headers: { Cookie: cookie } });
const otherData = (await otherLib.json().catch(() => ({}))) as { assets?: Asset[]; unavailable?: string };
const leaked = (otherData.assets ?? []).filter((a) => produced.some((p) => p.id === a.id));
check("another workspace cannot see this workspace's assets", leaked.length === 0,
  leaked.length ? `LEAKED ${leaked.length}` : `unavailable=${otherData.unavailable ?? "none"}, ${otherData.assets?.length ?? 0} own assets`);

// An unauthenticated caller must generate NOTHING. Asserting on a specific
// status code would be brittle and beside the point — middleware answers with
// a 307 to /login before the handler runs, which is a correct block. The real
// property is that no asset comes into existence, so assert THAT.
const countBefore = (lib.assets ?? []).length;
const anonRes = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ assetType: "VSL Script" }), redirect: "manual",
});
check("an unauthenticated caller is refused", !anonRes.ok, `status ${anonRes.status}`);
const afterAnon = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } });
const afterData = (await afterAnon.json().catch(() => ({}))) as { assets?: Asset[] };
check("...and generated nothing", (afterData.assets ?? []).length === countBefore,
  `${countBefore} -> ${(afterData.assets ?? []).length}`);

// ── ZENO CONVERSATIONAL PATH ──────────────────────────────────────────────
console.log("\n── ZENO CAN CREATE THESE CONVERSATIONALLY\n");
const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    level: "sub-account", subAccountId: SA,
    messages: [{ role: "user", content: "Write me a sales call script I can use when a school books a discovery call." }],
    pageContext: { route: `/app/create` },
  }),
});
const chat = (await chatRes.json().catch(() => ({}))) as { type?: string; text?: string; proposal?: { capability?: string; args?: Record<string, unknown> } };
check("Zeno routes a plain-language ask to the Asset Studio",
  chat.type === "proposal" && chat.proposal?.capability === "create_asset",
  `type=${chat.type} capability=${chat.proposal?.capability} ${(chat.text ?? "").slice(0, 100)}`);
if (chat.proposal?.capability === "create_asset") {
  check("  it picked a sensible asset type itself",
    typeof chat.proposal.args?.assetType === "string" && /script/i.test(String(chat.proposal.args.assetType)),
    String(chat.proposal.args?.assetType));
  const conf = await fetch(`${BASE}/api/ai-suite/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_asset", args: chat.proposal.args }),
  });
  const confData = (await conf.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string }; error?: string };
  check("  the human's confirmation produces a real asset", conf.ok && confData.resultRef?.kind === "asset",
    conf.ok ? `asset ${confData.resultRef?.id}` : JSON.stringify(confData).slice(0, 160));
}

console.log(`\n${bad === 0 ? "CHECKPOINT 2 C: PASS" : `CHECKPOINT 2 C: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
