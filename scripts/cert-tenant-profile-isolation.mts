/**
 * STAGING SECURITY CERTIFICATION for the cross-tenant business-profile boundary.
 *
 * The deterministic suite proves the decision logic. This proves the DEPLOYED
 * routes actually refuse, because the vulnerability was never in the logic —
 * it was that a live HTTP route accepted a client-chosen id and acted on it.
 *
 * SAFE BY CONSTRUCTION. Every unauthorized case asserts a REJECTION, so a pass
 * means nothing happened. The one authorized probe is a read. No profile is
 * patched, discovered, reviewed, published or reconciled, and profiles 3 and 27
 * are never mutated. If a negative test ever started passing by succeeding
 * rather than by being refused, that is the bug, and the assertions are written
 * so that outcome fails loudly instead of looking green.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/cert-tenant-profile-isolation.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
/** The real DivineX workspace: canonically mapped to profile 3, storing 27. */
const SA = "MEYB8CbWlE5fxAn3TJOp";
/** A profile this workspace is demonstrably not mapped to. */
const FOREIGN_PROFILE = 27;
const NONEXISTENT_PROFILE = 987654321;

let bad = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await r.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const ver = (await (await fetch(`${BASE}/api/version`)).json()) as { commit: string };
console.log(`target ${BASE} (commit ${ver.commit})\n`);

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: (await res.text()).slice(0, 220) };
};

// ── UNAUTHORIZED: a foreign profile id must be refused, on every verb ─────
{
  // "start" is the READ action. If the boundary leaks, this is what leaks.
  const a = await post("/api/app/onboarding", { subAccountId: SA, action: "start", businessProfileId: FOREIGN_PROFILE });
  check("U1. onboarding READ with a foreign profile id -> 403", a.status === 403, `${a.status} ${a.text}`);
  check("U2. and the response carries no foreign business content", !/apostille/i.test(a.text), a.text.slice(0, 80));

  // "discover" is the WRITE action — the one that overwrites website/brand/assets.
  const b = await post("/api/app/onboarding", {
    subAccountId: SA,
    action: "discover",
    businessProfileId: FOREIGN_PROFILE,
    websiteUrl: "https://example.com",
  });
  check("U3. onboarding WRITE (discover) with a foreign profile id -> 403", b.status === 403, `${b.status} ${b.text}`);

  const c = await post("/api/app/onboarding", { subAccountId: SA, action: "complete", businessProfileId: FOREIGN_PROFILE });
  check("U4. onboarding PUBLISH with a foreign profile id -> 403", c.status === 403, `${c.status} ${c.text}`);

  const d = await post(`/api/sub-accounts/${SA}/divinex/reconcile`, { businessProfileId: FOREIGN_PROFILE });
  check("U5. reconcile with a foreign profile id -> 403", d.status === 403, `${d.status} ${d.text}`);

  const e = await post("/api/app/onboarding", { subAccountId: SA, action: "start", businessProfileId: NONEXISTENT_PROFILE });
  check("U6. a nonexistent profile id is refused safely, not probed", e.status === 403, `${e.status} ${e.text}`);
}

// ── CONTEXT ISOLATION on the real contaminated workspace ─────────────────
{
  // brand-library reads through resolveProfileInputs, which now sits behind the
  // authorized accessor. DivineX is mapped to 3 and stores 27, so this must
  // return nothing at all rather than the foreign profile's assets.
  const res = await fetch(`${BASE}/api/sub-accounts/${SA}/brand-library`, { headers: { cookie } });
  const body = await res.text();
  check("C1. brand-library responds normally", res.status === 200, String(res.status));
  check("C2. it returns ZERO assets for the mismatched workspace", /"assets":\s*\[\s*\]/.test(body), body.slice(0, 100));
  check("C3. and leaks no foreign domain", !/apostille/i.test(body));
}

// ── AUTHORIZED: a read against the workspace's own mapped profile ─────────
{
  // Deliberately a READ, and deliberately tolerant: the Ascend API host is
  // NXDOMAIN from here, so an upstream failure (502) is expected and is NOT a
  // boundary failure. What must never happen is 403 — that would mean the
  // workspace was refused its OWN profile, i.e. fail-closed taken too far.
  const a = await post("/api/app/onboarding", { subAccountId: SA, action: "start" });
  check(
    "A1. the workspace is NOT refused its own mapped profile (no 403)",
    a.status !== 403,
    `${a.status} ${a.text.slice(0, 120)}`,
  );
  check("A2. and no foreign content is returned either way", !/apostille/i.test(a.text));
}

console.log(bad === 0 ? `\ncert-tenant-profile-isolation: all checks passed` : `\ncert-tenant-profile-isolation: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
