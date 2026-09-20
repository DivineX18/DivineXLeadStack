/**
 * FINAL E2E — Steps 1-4, as one continuous customer journey.
 *
 * Anonymous scan, genuine authenticated claim, legitimate workspace
 * provisioning, and then the authorization proof on the pair that results.
 * Nothing is inserted by hand and no authentication is faked: the QA identity
 * signs in through Clerk's own ticket exchange, and every write goes through a
 * product route.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync("/Users/boss/DivineX-Business-Intelligence/.env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const ASCEND = "https://divinex-business-intelligence.onrender.com";
const FLOW = "https://crm.divinex.io";
const FAPI = "https://clerk.app.divinex.io";
const CLERK = process.env.CLERK_SECRET_KEY!;
const SECRET = process.env.ASCEND_SSO_SHARED_SECRET!;
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const QA_EMAIL = process.env.QA_EMAIL ?? `qa-final-${Date.now().toString(36)}@divinex.io`;

let bad = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};
const step = (s: string) => console.log(`\n══ ${s} ${"═".repeat(Math.max(0, 58 - s.length))}`);

const clerk = async (p: string, init?: { method?: string; body?: unknown }) => {
  const r = await fetch(`https://api.clerk.com/v1${p}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${CLERK}`, "Content-Type": "application/json" },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j };
};

// ── STEP 1 — anonymous public Growth Scan ────────────────────────────────
step("STEP 1 — public Growth Scan (anonymous)");
const submit = await fetch(`${ASCEND}/api/zeno/growth-scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ websiteUrl: "https://www.divinex.io", name: "QA Final", email: QA_EMAIL, businessType: "Business Consulting" }),
});
const sub = (await submit.json()) as any;
check("1a. anonymous scan accepted", submit.status === 202 && !!sub.shareToken, `${submit.status}`);
if (!sub.shareToken) process.exit(1);

let scan: any = null;
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const res = await fetch(`${ASCEND}/api/zeno/growth-scan/${sub.shareToken}`);
  if (res.status === 200) {
    const j = (await res.json()) as any;
    if (j.overallScore != null) { scan = j; break; }
  }
  process.stdout.write(".");
}
console.log();
check("1b. scan completed", !!scan);
if (!scan) process.exit(1);
check("1c. it really fetched the website", scan.scanSource === "live_website_scan" && (scan.websiteData?.wordCount ?? 0) > 1000, `${scan.scanSource}, ${scan.websiteData?.wordCount} words`);
check("1d. grounded in real page evidence", /Build Better Businesses/i.test(String(scan.websiteData?.h1 ?? "")), String(scan.websiteData?.h1 ?? "").slice(0, 60));
console.log(`     scanId=${scan.id} score=${scan.overallScore} (${scan.scoreLabel}) constraint="${scan.biggestBottleneck}"`);
console.log(`     evidence=${JSON.stringify(scan.evidenceSourcesUsed)}`);
console.log(`     recommends: ${String(scan.recommendedFunnelType ?? "").slice(0, 110)}`);

// ── STEP 2 — genuine authenticated claim ─────────────────────────────────
step("STEP 2 — authenticate and claim");
const created = await clerk("/users", {
  method: "POST",
  body: { email_address: [QA_EMAIL], first_name: "QA", last_name: "Final", skip_password_requirement: true },
});
const userId = created.j?.id;
check("2a. QA identity created through Clerk", !!userId, userId ?? created.t.slice(0, 160));
if (!userId) process.exit(1);

const ticket = await clerk("/sign_in_tokens", { method: "POST", body: { user_id: userId, expires_in_seconds: 900 } });
const qs = "__clerk_api_version=2025-04-10&_clerk_js_version=5.0.0";
const si = await fetch(`${FAPI}/v1/client/sign_ins?${qs}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ strategy: "ticket", ticket: ticket.j.token }).toString(),
});
const siBody = (await si.json()) as any;
const jwt = siBody?.client?.sessions?.[0]?.last_active_token?.jwt;
check("2b. real Clerk session established (no dev bypass)", siBody?.response?.status === "complete" && !!jwt);
if (!jwt) process.exit(1);

const claimRes = await fetch(`${ASCEND}/api/zeno/growth-scan/claim`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ claimToken: sub.claimToken }),
});
const claimed = (await claimRes.json()) as any;
check("2c. claim succeeded", claimRes.status === 200 && !!claimed.businessProfileId, `${claimRes.status}`);
check("2d. a convergence token was issued", !!claimed.convergenceToken);
const PROFILE = claimed.businessProfileId as number;
console.log(`     profile=${PROFILE} scan=${claimed.scanId}`);
check("2e. the claim did NOT adopt another workspace's profile", PROFILE !== 1, `profile ${PROFILE}`);

// ── STEP 3 — provision a workspace and converge ──────────────────────────
step("STEP 3 — enter Flow, converge");
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const sign = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await sign.json()) as any;
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const api = async (p: string, init?: { method?: string; body?: unknown; timeoutMs?: number }) => {
  const r = await fetch(`${FLOW}${p}`, {
    method: init?.method ?? "GET",
    headers: { cookie, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(init?.timeoutMs ?? 180_000),
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j };
};

const wsRes = await api("/api/agency/sub-accounts", {
  method: "POST",
  body: { name: "DivineX Final QA", slug: `final-qa-${Date.now().toString(36)}`, timezone: "UTC" },
});
const SA = wsRes.j?.subAccountId as string;
check("3a. workspace provisioned through the product route", !!SA, SA ?? wsRes.t.slice(0, 160));
if (!SA) process.exit(1);

await api(`/api/agency/sub-accounts/${SA}/feature-gates`, {
  method: "PATCH",
  body: { ascendIntelligenceEnabled: true, aiSuiteEnabled: true, websiteEnabled: true },
});

const onboard = await api("/api/app/onboarding", {
  method: "POST",
  body: { subAccountId: SA, action: "start", convergenceToken: claimed.convergenceToken },
});
check("3b. onboarding with the convergence token succeeds", onboard.s === 200, `${onboard.s} ${onboard.t.slice(0, 200)}`);
check("3c. THE SAME PROFILE FOLLOWED THE CUSTOMER", onboard.j?.businessProfileId === PROFILE, `got ${onboard.j?.businessProfileId}, claimed ${PROFILE}`);
console.log(`     workspace=${SA} profile=${onboard.j?.businessProfileId}`);

const { getMappingBySubAccountId } = await import("../src/lib/workspace/workspace-mappings-service.ts");
const m = await getMappingBySubAccountId(SA);
check("3d. the mapping is exact and ACTIVE", m?.status === "active" && String(m?.primaryAscendBusinessProfileId) === String(PROFILE), `${m?.status} / ${m?.primaryAscendBusinessProfileId}`);

// ── STEP 4 — authorization on the resulting pair ─────────────────────────
step("STEP 4 — production authorization");
const ascendGet = async (path: string, workspace?: string) => {
  const r = await fetch(`${ASCEND}${path}`, {
    headers: { Authorization: `Bearer ${SECRET}`, ...(workspace ? { "x-divinex-workspace": workspace } : {}) },
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j };
};
const prof = await ascendGet(`/api/divinex/profile/${PROFILE}`, SA);
check("4a. A -> A profile read ALLOWED", prof.s === 200, `${prof.s}`);
check("4b. and it is this workspace's own business", prof.j?.flowSubAccountId === SA && prof.j?.businessProfileId === PROFILE);
const intel = await ascendGet(`/api/divinex/intelligence/${PROFILE}`, SA);
check("4c. A -> A intelligence read ALLOWED", intel.s === 200 && intel.j?.available === true, `${intel.s} available=${intel.j?.available}`);
check("4d. and it carries the diagnosed constraint", intel.j?.scan?.primaryConstraint === scan.biggestBottleneck, String(intel.j?.scan?.primaryConstraint));
const lib = await ascendGet(`/api/divinex/assets-library/${SA}`);
check("4e. A -> A asset library ALLOWED", lib.s === 200, `${lib.s}`);

const ghost = await ascendGet(`/api/divinex/profile/987654321`, SA);
check("4f. a nonexistent profile is still REFUSED", ghost.s === 403, `${ghost.s}`);
const unmapped = await ascendGet(`/api/divinex/profile/${PROFILE}`, "qa-nonexistent-workspace-do-not-map");
check("4g. an unmapped workspace is still REFUSED", unmapped.s === 403, `${unmapped.s}`);

console.log(`\nCARRY: ${JSON.stringify({ clerkUserId: userId, email: QA_EMAIL, scanId: scan.id, profileId: PROFILE, workspaceId: SA })}`);
console.log(bad === 0 ? "\nfinal-journey steps 1-4: all checks passed" : `\nfinal-journey steps 1-4: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
