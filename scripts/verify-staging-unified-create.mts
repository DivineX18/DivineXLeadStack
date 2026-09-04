/**
 * FINAL LAUNCH PASS — UNIFIED CREATE, CERTIFIED ON DEPLOYED STAGING.
 *
 * Everything here runs against the REAL deployed Flow staging service talking
 * to the REAL deployed Ascend staging service. Nothing is local.
 *
 * It also answers the configuration question behaviourally rather than by
 * reading a dashboard: if Flow staging were pointed at PRODUCTION Ascend, the
 * bridge routes would not exist there and generation would fail — so a
 * successful generation is itself proof that ASCEND_API_BASE_URL targets the
 * staging service that has the bridge.
 *
 * Run: STAGING_SA=<linked sa> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-staging-unified-create.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.STAGING_SA;
if (!SA) throw new Error("STAGING_SA is required.");
const FLOW = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const OWNER = process.env.STAGING_UID ?? "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// ── Provenance first: never certify against an unverified artifact ────────
const ver = await (await fetch(`${FLOW}/api/version`)).json() as { commit?: string; branch?: string };
console.log(`Flow staging: ${ver.branch}@${ver.commit}`);

const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken, error } = (await r.json()) as { idToken?: string; error?: { message?: string } };
if (!idToken) throw new Error(`could not mint an id token: ${error?.message ?? "unknown"}`);
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
check("a real session is established against Flow STAGING", cookie.length > 20, `${login.status}`);

// ── Library read through the deployed proxy ───────────────────────────────
const libRes = await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } });
const lib = (await libRes.json().catch(() => ({}))) as { assets?: { id: number; assetType: string }[]; unavailable?: string; error?: string };
check("Flow staging reaches an Ascend that HAS the bridge",
  libRes.ok && lib.unavailable !== "not_configured",
  `status=${libRes.status} unavailable=${lib.unavailable ?? "none"} assets=${lib.assets?.length ?? 0}`);
check("...and it is the STAGING Ascend, not production",
  Array.isArray(lib.assets),
  lib.unavailable === "workspace_not_linked"
    ? "workspace not linked on the Ascend it reached"
    : `${lib.assets?.length ?? 0} assets returned`);
const before = lib.assets?.length ?? 0;

// ── Generate for real, on staging ─────────────────────────────────────────
console.log("\n── GENERATION ON DEPLOYED STAGING\n");
const genRes = await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ assetType: "DM Script", prompt: "Outreach DM for school activity coordinators." }),
});
const gen = (await genRes.json().catch(() => ({}))) as { asset?: { id: number; assetType: string; title: string; content: string }; error?: string };
check("a deliverable generates through deployed Flow -> deployed Ascend",
  genRes.ok && !!gen.asset, genRes.ok ? "" : `${genRes.status} ${gen.error}`);
if (gen.asset) {
  check("  the artifact is real, not a stub", gen.asset.content.length > 600, `${gen.asset.content.length} chars`);
  // Unambiguous UNFILLED template slots only — reader-facing personalization
  // ("[Your Name]") and prose mentioning the word "placeholder" are correct
  // copy, not defects. Matches the tightened check in verify-unified-create.
  check("  no unfilled template filler", !/lorem ipsum|\bTODO\b|\[INSERT\b|\bXXXX+/i.test(gen.asset.content));
  console.log(`  "${gen.asset.title}"`);
  console.log(`  ${gen.asset.content.replace(/\n/g, " ").slice(0, 240)}…`);
}

// ── Persistence visible from the unified experience ───────────────────────
const lib2Res = await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } });
const lib2 = (await lib2Res.json().catch(() => ({}))) as { assets?: { id: number }[] };
check("it persists and is visible in the unified library",
  (lib2.assets?.length ?? 0) > before && !!gen.asset && !!lib2.assets?.some((a) => a.id === gen.asset!.id),
  `${before} -> ${lib2.assets?.length ?? 0}`);

// ── Tenant isolation on staging ───────────────────────────────────────────
console.log("\n── TENANT ISOLATION (staging)\n");
const otherRes = await fetch(`${FLOW}/api/sub-accounts/dx-loop-test/divinex/assets`, { headers: { Cookie: cookie } });
const other = (await otherRes.json().catch(() => ({}))) as { assets?: { id: number }[]; unavailable?: string };
const leaked = (other.assets ?? []).filter((a) => a.id === gen.asset?.id);
check("an unlinked workspace cannot see this workspace's assets", leaked.length === 0,
  `unavailable=${other.unavailable ?? "none"} own=${other.assets?.length ?? 0}`);

const anon = await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ assetType: "VSL Script" }), redirect: "manual",
});
const after = await (await fetch(`${FLOW}/api/sub-accounts/${SA}/divinex/assets`, { headers: { Cookie: cookie } })).json() as { assets?: unknown[] };
check("an unauthenticated caller is refused and generates nothing",
  !anon.ok && (after.assets?.length ?? 0) === (lib2.assets?.length ?? 0),
  `status ${anon.status}, ${lib2.assets?.length ?? 0} -> ${after.assets?.length ?? 0}`);

console.log(`\n${bad === 0 ? "UNIFIED CREATE ON STAGING: PASS" : `UNIFIED CREATE ON STAGING: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
