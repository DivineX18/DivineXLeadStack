/**
 * PHASE 12 — the first production proof that a legitimately mapped
 * workspace/profile pair is AUTHORIZED, not merely that foreign ones are
 * refused.
 *
 * Phase 11 certified the refusals. Every negative passed, which proves the
 * boundary is closed but not that it is survivable: a boundary that refuses
 * everything would have scored identically. This drives the allow-path
 * through the real product surfaces and asserts the pair is let through.
 *
 * A FRESH QA WORKSPACE, not the DivineX one. Onboarding records a
 * ProfileBinding, and the DivineX document carries the legacy no-identity
 * binding that the Layer 2 media-trust repair is certified against. Writing
 * to it from here would destroy that evidence.
 *
 * Every step goes through an authenticated product route. Nothing is inserted
 * directly, and the workspace mapping in particular is created by the product
 * path or not at all — a mapping written by hand would make the certification
 * circular.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/cert-phase12-e2e.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const FLOW = process.env.FLOW_BASE ?? "https://crm.divinex.io";
const ASCEND = process.env.ASCEND_BASE ?? "https://divinex-business-intelligence.onrender.com";
const SECRET = process.env.ASCEND_SSO_SHARED_SECRET ?? "";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const QA_NAME = process.env.QA_NAME ?? "Phase 12 QA";
const QA_WEBSITE = "https://www.divinex.io";

let bad = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};
const step = (s: string) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 62 - s.length))}`);

// ── Authenticate as the agency owner through the real login route ─────────
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const si = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await si.json()) as { idToken: string };
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const ver = (await (await fetch(`${FLOW}/api/version`)).json()) as { commit: string };
console.log(`flow   ${FLOW} (commit ${ver.commit})`);
console.log(`ascend ${ASCEND}`);

const api = async (path: string, init?: { method?: string; body?: unknown }) => {
  const res = await fetch(`${FLOW}${path}`, {
    method: init?.method ?? "GET",
    headers: { cookie, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, text, json };
};

const ascendGet = async (path: string, workspace?: string) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${SECRET}` };
  if (workspace) headers["x-divinex-workspace"] = workspace;
  const res = await fetch(`${ASCEND}${path}`, { headers });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, text, json };
};

// ══ STEP A — a controlled QA workspace, via the normal agency route ═══════
step("A. QA workspace");
const slug = `phase12-qa-${Date.now().toString(36)}`;
const created = await api("/api/agency/sub-accounts", {
  method: "POST",
  body: { name: QA_NAME, slug, timezone: "UTC" },
});
check("A1. QA sub-account created through the agency product route", created.status < 300, `${created.status} ${created.text.slice(0, 200)}`);
const QA_SA: string = created.json?.subAccountId ?? created.json?.id ?? created.json?.subAccount?.id ?? "";
check("A2. it has an id", !!QA_SA, QA_SA || created.text.slice(0, 200));
if (!QA_SA) { console.log("\ncannot continue without a workspace id"); process.exit(1); }
console.log(`     workspace = ${QA_SA}`);

// ══ STEP B — the workspace is UNMAPPED to begin with ══════════════════════
step("B. the pair does not exist yet");
{
  const before = await ascendGet(`/api/divinex/assets-library/${QA_SA}`);
  check("B1. a brand-new workspace is unmapped, and Ascend says so", before.status === 403 && /workspace_not_linked/.test(before.text), `${before.status} ${before.text.slice(0, 120)}`);
}

// ══ STEP C — onboarding creates the mapping (NOT written by hand) ═════════
step("C. the mapping is created by the product path");
const onboard = await api("/api/app/onboarding", { method: "POST", body: { subAccountId: QA_SA, action: "start" } });
check("C1. authenticated onboarding start succeeds", onboard.status === 200, `${onboard.status} ${onboard.text.slice(0, 250)}`);
const PROFILE_ID: number | null = onboard.json?.businessProfileId ?? null;
check("C2. it resolved a business profile id", typeof PROFILE_ID === "number" && PROFILE_ID > 0, String(PROFILE_ID));
console.log(`     profile = ${PROFILE_ID}`);
check("C3. and Ascend returned the profile contract through the bridge", onboard.json?.profile !== null && onboard.json?.profile !== undefined, onboard.json?.profile ? "contract present" : "profile was null — bridge returned nothing");

// ══ STEP D — PRODUCTION A→A, the thing Phase 11 could not prove ══════════
step("D. A -> A is ALLOWED (the first production positive)");
{
  const lib = await ascendGet(`/api/divinex/assets-library/${QA_SA}`);
  check("D1. asset-library read for the mapped workspace -> 200", lib.status === 200, `${lib.status} ${lib.text.slice(0, 120)}`);

  const prof = await ascendGet(`/api/divinex/profile/${PROFILE_ID}`, QA_SA);
  check("D2. profile read for the MAPPED pair -> 200 (not refused)", prof.status === 200, `${prof.status} ${prof.text.slice(0, 160)}`);
  check("D3. and it is the workspace's own profile", prof.json?.businessProfileId === PROFILE_ID, `contract says ${prof.json?.businessProfileId}`);
  check("D4. the contract routes back to THIS workspace", prof.json?.flowSubAccountId === QA_SA, String(prof.json?.flowSubAccountId));

  const intel = await ascendGet(`/api/divinex/intelligence/${PROFILE_ID}`, QA_SA);
  check("D5. intelligence read for the MAPPED pair -> 200", intel.status === 200, `${intel.status} ${intel.text.slice(0, 120)}`);
  console.log(`     intelligence available = ${intel.json?.available}`);
}

// ══ STEP E — still fail-closed ═══════════════════════════════════════════
step("E. and the boundary is still closed");
{
  const noWs = await ascendGet(`/api/divinex/profile/${PROFILE_ID}`);
  check("E1. the SAME profile without a workspace named -> 403", noWs.status === 403, `${noWs.status} ${noWs.text.slice(0, 120)}`);

  const wrongWs = await ascendGet(`/api/divinex/profile/${PROFILE_ID}`, "qa-nonexistent-workspace-do-not-map");
  check("E2. the SAME profile from an unmapped workspace -> 403", wrongWs.status === 403, `${wrongWs.status} ${wrongWs.text.slice(0, 120)}`);

  const ghost = await ascendGet(`/api/divinex/profile/987654321`, QA_SA);
  check("E3. a nonexistent profile from the mapped workspace -> 403", ghost.status === 403, `${ghost.status} ${ghost.text.slice(0, 120)}`);

  if (PROFILE_ID && PROFILE_ID > 1) {
    const neighbour = await ascendGet(`/api/divinex/profile/${PROFILE_ID - 1}`, QA_SA);
    check("E4. the NEIGHBOURING profile id -> 403 (counting gets you nothing)", neighbour.status === 403, `${neighbour.status} ${neighbour.text.slice(0, 120)}`);
  }
}

console.log(`\nworkspace=${QA_SA} profile=${PROFILE_ID}`);
console.log(bad === 0 ? `cert-phase12-e2e: all checks passed` : `cert-phase12-e2e: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
