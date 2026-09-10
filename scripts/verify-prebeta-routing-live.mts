/**
 * LIVE routing verification for the pre-beta P1-B repair.
 *
 * Signs in as a real user against a real deployment, then asks the running
 * server where each authenticated entry point lands. Reads the deployed
 * /api/debug/shell-context for the raw signals (hostname, tier, flag, mode)
 * so a FAIL says which signal was wrong, not just "it went to the wrong page".
 *
 * BASE=https://app.divinex.io NODE_OPTIONS="--conditions=react-server" \
 *   npx tsx scripts/verify-prebeta-routing-live.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const HOST = new URL(BASE).hostname;
/**
 * Whether THIS deployment treats THIS hostname as the Ascend host, asked of
 * the running server rather than assumed. Staging sets its own
 * NEXT_PUBLIC_ASCEND_APP_URL to its own URL, so staging is an Ascend host;
 * crm.divinex.io is not, and app.divinex.io is. Reading it live is what lets
 * one harness assert the right contract on all three.
 */
let EXPECT_ASCEND = false;

const RENZ = "renzrubio1500@gmail.com";
const OWNER_UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const DIVINEX_WS = "x4NOJFn8bTyav7OeJc1v";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");

/** A real signed-in session against BASE, with NO active_workspace_id cookie
 *  — i.e. exactly the state a browser is in immediately after a fresh login. */
async function freshSession(uid: string): Promise<string> {
  const customToken = await getAdminAuth().createCustomToken(uid);
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const { idToken } = (await signIn.json()) as { idToken: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  const setCookies = login.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

/** Where does the server send this path, before any JS runs? */
async function serverLanding(cookie: string, path: string): Promise<{ status: number; location: string | null; html: string }> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const location = res.headers.get("location");
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, location, html };
}

async function shellSignals(cookie: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/debug/shell-context`, { headers: { cookie } });
  return (await res.json()) as Record<string, unknown>;
}

/** The Flow dashboard's own markup, used to prove Flow did NOT paint. */
const FLOW_MARKERS = ["Getting Started", "Pipeline snapshot", "leads-map", "New deal"];
const flowPainted = (html: string) => FLOW_MARKERS.some((m) => html.includes(m));

const version = await (await fetch(`${BASE}/api/version`)).json();
{
  const probe = await freshSession(OWNER_UID);
  const sig = await shellSignals(probe);
  EXPECT_ASCEND = sig.hostnameMatchesAscend === true;
}
console.log(`\n=== ${BASE} (host ${HOST}, this deployment treats it as ${EXPECT_ASCEND ? "the ASCEND host" : "a FLOW host"}) ===`);
console.log("build:", JSON.stringify(version));

for (const [label, uid] of [["RENZ (collaborator, sole membership)", ""], ["AGENCY OWNER", OWNER_UID]] as const) {
  const resolvedUid = uid || (await getAdminAuth().getUserByEmail(RENZ)).uid;
  console.log(`\n── ${label} ──`);
  const cookie = await freshSession(resolvedUid);

  const sig = await shellSignals(cookie);
  console.log(
    `   host=${sig.hostname} ascendHost=${sig.ascendHostname} match=${sig.hostnameMatchesAscend}` +
      ` tier=${sig.workspaceEffectiveTier} flag=${sig.unifiedShellFlagEnabled} mode=${sig.shellMode}` +
      ` wsReason=${sig.workspaceSelectionReason} ws=${sig.workspaceId} cookiePresent=${sig.activeWorkspaceCookiePresent}`,
  );

  check(
    `${label}: fresh login resolves a workspace server-side (no cookie yet)`,
    sig.workspaceId !== null,
    `reason=${sig.workspaceSelectionReason}`,
  );
  check(
    `${label}: shell mode matches this host's contract`,
    sig.shellMode === (EXPECT_ASCEND ? "full_ascend" : "crm_only"),
    `mode=${sig.shellMode}`,
  );

  // 1. /dashboard, the post-login landing.
  const dash = await serverLanding(cookie, "/dashboard");
  if (EXPECT_ASCEND) {
    check(`${label}: /dashboard redirects to Ascend server-side`, dash.status === 307 && dash.location?.includes("/app/home") === true, `${dash.status} -> ${dash.location}`);
    check(`${label}: /dashboard never paints Flow first`, !flowPainted(dash.html));
  } else {
    check(`${label}: /dashboard stays in Flow on the CRM host`, dash.location?.includes("/app/home") !== true, `${dash.status} -> ${dash.location ?? "(rendered)"}`);
  }

  // 2. /sa/{id}/dashboard, the bookmarked/workspace-scoped entry.
  const scoped = await serverLanding(cookie, `/sa/${DIVINEX_WS}/dashboard`);
  if (EXPECT_ASCEND) {
    check(`${label}: /sa/{id}/dashboard redirects to Ascend server-side`, scoped.status === 307 && scoped.location?.includes("/app/home") === true, `${scoped.status} -> ${scoped.location}`);
    check(`${label}: /sa/{id}/dashboard never paints Flow first`, !flowPainted(scoped.html));
  } else {
    check(`${label}: /sa/{id}/dashboard renders Flow on the CRM host`, scoped.location?.includes("/app/home") !== true, `${scoped.status} -> ${scoped.location ?? "(rendered)"}`);
  }

  // 3. /app/home direct.
  const appHome = await serverLanding(cookie, "/app/home");
  check(
    `${label}: /app/home resolves without a redirect loop`,
    appHome.status === 200 || (appHome.status === 307 && !appHome.location?.includes("/app/home")),
    `${appHome.status} -> ${appHome.location ?? "(rendered)"}`,
  );

  // 4. A returning session, cookie already set, must behave identically.
  const returning = `${cookie}; active_workspace_id=${DIVINEX_WS}`;
  const sig2 = await shellSignals(returning);
  check(
    `${label}: returning session (cookie set) resolves the same shell`,
    sig2.shellMode === sig.shellMode && sig2.workspaceId === DIVINEX_WS,
    `mode=${sig2.shellMode} ws=${sig2.workspaceId}`,
  );

  // 5. Workspace isolation: a workspace this caller is not a member of must
  //    never resolve, on any host. Only meaningful for a non-owner — the
  //    agency owner legitimately reaches every workspace in their agency.
  if (label.startsWith("RENZ")) {
    // #1000 DivineX: same agency, Ascend-entitled, and Renz is NOT a member.
    const foreign = await shellSignals(`${cookie}; active_workspace_id=MEYB8CbWlE5fxAn3TJOp`);
    check(
      `${label}: a non-member workspace never resolves to Ascend`,
      foreign.shellMode === "crm_only" && foreign.workspaceStatus !== "active",
      `mode=${foreign.shellMode} status=${foreign.workspaceStatus}`,
    );
  }
}

console.log(`\n${failures === 0 ? "ROUTING LIVE: ALL CHECKS PASSED" : `ROUTING LIVE: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
