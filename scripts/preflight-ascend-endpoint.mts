/**
 * WHAT IS PRODUCTION FLOW ACTUALLY CONFIGURED TO CALL?
 *
 * `ASCEND_API_BASE_URL` lives in Render's environment, which is not readable
 * from here, and it defaults to https://ascend.divinex.io — a hostname that
 * does not currently resolve. So the question is answered behaviourally, by
 * an authenticated GET that has no side effect whatsoever.
 *
 * /api/sub-accounts/[id]/divinex/assets is the ideal probe because it already
 * distinguishes the three cases in its own response shape:
 *
 *   unavailable: "not_configured"      → the shared secret is unset
 *   unavailable: "workspace_not_linked" → Ascend was REACHED and answered 403
 *   502 "Couldn't load your assets"     → Ascend was NOT reached (or errored)
 *
 * The middle case is the one that proves the base URL is both set and
 * reachable, because only the deployed Ascend service emits that 403.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/preflight-ascend-endpoint.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.FLOW_BASE ?? "https://crm.divinex.io";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const SA = process.env.PROBE_SA ?? "MEYB8CbWlE5fxAn3TJOp";

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await r.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const ver = (await (await fetch(`${BASE}/api/version`)).json()) as { commit: string; service: string };
console.log(`flow ${BASE} (commit ${ver.commit}, service ${ver.service})\n`);

const res = await fetch(`${BASE}/api/sub-accounts/${SA}/divinex/assets`, { headers: { cookie } });
const text = await res.text();
console.log(`GET /api/sub-accounts/${SA}/divinex/assets`);
console.log(`  status ${res.status}`);
console.log(`  body   ${text.slice(0, 300)}\n`);

if (/not_configured/.test(text)) {
  console.log("VERDICT: ASCEND_SSO_SHARED_SECRET is NOT SET on production Flow.");
} else if (/workspace_not_linked/.test(text)) {
  console.log("VERDICT: Ascend is REACHABLE from production Flow — it answered its own 403.");
  console.log("         ASCEND_API_BASE_URL points at a live Ascend deployment.");
} else if (res.status === 502) {
  console.log("VERDICT: Ascend is NOT REACHABLE from production Flow.");
  console.log("         ASCEND_API_BASE_URL is unset (defaulting to the non-resolving");
  console.log("         ascend.divinex.io) or points at a dead host.");
} else {
  console.log("VERDICT: unexpected shape — inspect the body above before proceeding.");
}
