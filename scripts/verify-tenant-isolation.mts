/**
 * BIDIRECTIONAL TENANT ISOLATION — P0.2.
 *
 * Proves isolation with SENTINEL DATA rather than identifier strings. An
 * earlier version asserted `html.includes(workspaceId)`, which proves an id
 * appeared, not that data leaked — it happened to catch a real defect, but it
 * would have fired just as loudly on a harmless id echo. Unique, unmistakable
 * values are planted in tenant-owned surfaces in each workspace; a leak is
 * then a sentinel crossing a boundary, which cannot be confused with an
 * implementation artifact.
 *
 * CERTIFICATION INTEGRITY: every actor is capable of failing the condition
 * under test. The single-workspace probes are NOT agency owners — an owner
 * legitimately sees every workspace in their agency and so can never
 * demonstrate denial.
 *
 * ENVIRONMENT FIDELITY: run against a PRODUCTION build with NO shell override.
 * Dev mode serializes far more into the flight payload, and the override
 * forces the shell past its own mode check, so a dev run cannot establish
 * production severity.
 *
 * Run: pnpm build && pnpm start -p 3114
 *      E2E_BASE=http://localhost:3114 WORKSPACE_A=<id> WORKSPACE_B=<id> \
 *      NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-tenant-isolation.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const A = process.env.WORKSPACE_A!;
const B = process.env.WORKSPACE_B!;
const GHOST = "ZZnonexistentWorkspace99";
const AGENCY = "U5SBAHsB0nZ7ce552H9h";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { createInviteServerSide } = await import("../src/lib/server/members-service.ts");
const { createFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const { resolveAuthedCaller, resolveSubAccountAccess } = await import("../src/lib/auth/require-tenancy.ts");

const auth = getAdminAuth();
const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const stamp = Date.now();
const cleanup: (() => Promise<unknown>)[] = [];

// ── Sentinels: unmistakable, tenant-owned, and impossible to confuse ─────
const SENTINEL_A = `ZZSENTINELALPHA${stamp}`;
const SENTINEL_B = `ZZSENTINELBRAVO${stamp}`;

async function plant(workspace: string, sentinel: string) {
  const id = await createFunnelServerSide({
    subAccountId: workspace, createdByUid: OWNER, name: sentinel, genre: "lead_gen",
  } as never);
  const funnelId = typeof id === "string" ? id : (id as { id: string }).id;
  cleanup.push(() => db.doc(`funnels/${funnelId}`).delete().catch(() => {}));
  return funnelId;
}

// CERTIFICATION INTEGRITY: if planting fails, every "sentinel absent" check
// below passes because the sentinel never existed — vacuous, and exactly the
// false-confidence pattern this suite exists to avoid. Abort loudly instead.
let plantedA: string, plantedB: string;
try {
  plantedA = await plant(A, SENTINEL_A);
  plantedB = await plant(B, SENTINEL_B);
} catch (err) {
  console.error("SENTINEL PLANTING FAILED — aborting rather than reporting vacuous passes:", err);
  for (const c of cleanup) await c();
  process.exit(1);
}
// Prove the sentinels are actually retrievable before asserting anything
// about their absence elsewhere.
const aDoc = await db.doc(`funnels/${plantedA}`).get();
const bDoc = await db.doc(`funnels/${plantedB}`).get();
if (!aDoc.exists || !bDoc.exists) {
  console.error("SENTINELS NOT READABLE — aborting.");
  for (const c of cleanup) await c();
  process.exit(1);
}

async function actor(label: string, workspaces: string[]) {
  const email = `iso-${label}-${stamp}@example.com`;
  const u = await auth.createUser({ email, password: `Probe!${stamp}` });
  await db.doc(`users/${u.uid}`).set({ displayName: `iso ${label}`, status: "active" });
  for (const ws of workspaces) {
    await createInviteServerSide({ subAccountId: ws, invitedByUid: OWNER, email, role: "admin" } as never);
  }
  // The real invite-acceptance flow mints claims alongside the membership;
  // resolveAuthedCaller reads claims. This grants NO workspace access by
  // itself — access comes from the membership rows written above.
  await auth.setCustomUserClaims(u.uid, { role: "user", status: "active", agencyId: AGENCY });
  cleanup.push(async () => {
    for (const ws of workspaces) {
      await db.doc(`subAccounts/${ws}/subAccountMembers/${u.uid}`).delete().catch(() => {});
      await db.doc(`userMemberships/${u.uid}/subAccounts/${ws}`).delete().catch(() => {});
    }
    await db.doc(`users/${u.uid}`).delete().catch(() => {});
    await auth.deleteUser(u.uid).catch(() => {});
  });
  return u.uid;
}

async function session(uid: string) {
  const ct = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await r.json()) as { idToken?: string };
  const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
  return (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const uidA = await actor("a", [A]);
const uidB = await actor("b", [B]);
const uidAB = await actor("ab", [A, B]);
const [sA, sB, sAB] = [await session(uidA), await session(uidB), await session(uidAB)];

const ctxCookie = (s: string, ws: string) => `${s}; active_workspace_id=${ws}`;
const shell = (s: string, ws: string, path = "/app/crm") =>
  fetch(`${BASE}${path}`, { headers: { cookie: ctxCookie(s, ws) }, redirect: "manual" });

// ── Actors really are scoped ─────────────────────────────────────────────
const cA = await resolveAuthedCaller(uidA);
const cB = await resolveAuthedCaller(uidB);
const cAB = await resolveAuthedCaller(uidAB);
if (!cA.ok || !cB.ok || !cAB.ok) { for (const c of cleanup) await c(); console.log("actor setup failed"); process.exit(1); }
check("0. Probes are NOT agency owners (an owner could never prove denial)",
  [cA, cB, cAB].every((c) => c.ok && c.caller.agencyRole !== "owner"));

// ── Authority-level matrix ───────────────────────────────────────────────
check("1. A→A authorized", (await resolveSubAccountAccess(cA.caller, A)).ok);
check("2. B→B authorized", (await resolveSubAccountAccess(cB.caller, B)).ok);
check("3. A→B DENIED", !(await resolveSubAccountAccess(cA.caller, B)).ok);
check("4. B→A DENIED", !(await resolveSubAccountAccess(cB.caller, A)).ok);
check("5. A+B reaches BOTH", (await resolveSubAccountAccess(cAB.caller, A)).ok && (await resolveSubAccountAccess(cAB.caller, B)).ok);

// ── Behavioural: API reads + mutations ───────────────────────────────────
const api = (s: string, ws: string) => fetch(`${BASE}/api/sub-accounts/${ws}/funnels`, { headers: { cookie: s }, redirect: "manual" });
check("6. A reads A over HTTP", (await api(sA, A)).ok);
check("7. B reads B over HTTP", (await api(sB, B)).ok);
const a2b = await api(sA, B); check("8. A CANNOT read B", !a2b.ok, `HTTP ${a2b.status}`);
const b2a = await api(sB, A); check("9. B CANNOT read A", !b2a.ok, `HTTP ${b2a.status}`);
const write = (s: string, ws: string) => fetch(`${BASE}/api/sub-accounts/${ws}/products`, {
  method: "POST", headers: { cookie: s, "Content-Type": "application/json" },
  body: JSON.stringify({ name: `iso ${stamp}`, unitPriceCents: 1000, currency: "USD" }),
});
const wa = await write(sA, B); check("10. A CANNOT mutate B", !wa.ok, `HTTP ${wa.status}`);
const wb = await write(sB, A); check("11. B CANNOT mutate A", !wb.ok, `HTTP ${wb.status}`);

// ── SENTINELS never cross the boundary ───────────────────────────────────
const forgedA = await shell(sA, B);
const forgedABody = await forgedA.text();
check("12. A forging B: B's SENTINEL DATA absent", !forgedABody.includes(SENTINEL_B));
check("13. A forging B: B's workspace id absent", !forgedABody.includes(B));
const forgedB = await shell(sB, A);
const forgedBBody = await forgedB.text();
check("14. B forging A: A's SENTINEL DATA absent", !forgedBBody.includes(SENTINEL_A));
check("15. B forging A: A's workspace id absent", !forgedBBody.includes(A));

// ── LEGITIMATE switching still works, and shows only that tenant ─────────
// Asserted at the API rather than the shell: the unified shell additionally
// requires the `unified_shell` rollout flag, which is deliberately still
// narrow at this point in P0.2 (widening happens only after this suite is
// green). The API enforces the same tenancy authority and is the layer that
// actually owns the data, so this tests the boundary rather than the throttle.
const contacts = (s: string, ws: string) =>
  fetch(`${BASE}/api/sub-accounts/${ws}/funnels`, { headers: { cookie: s }, redirect: "manual" });

const abA = await contacts(sAB, A);
const abABody = abA.ok ? await abA.text() : "";
check("16. A+B in A: sees A's sentinel", abABody.includes(SENTINEL_A), `HTTP ${abA.status}`);
check("17. A+B in A: does NOT see B's sentinel", !abABody.includes(SENTINEL_B));
const abB = await contacts(sAB, B);
const abBBody = abB.ok ? await abB.text() : "";
check("18. A+B switched to B: sees B's sentinel", abBBody.includes(SENTINEL_B), `HTTP ${abB.status}`);
check("19. A+B switched to B: NO stale A data survives the switch", !abBBody.includes(SENTINEL_A));
// And the single-workspace probes still cannot reach the other's data here.
const aOnlyB = await contacts(sA, B);
// 403, not merely "not ok": a 404 would mean a missing route rather than a
// denial, which is a vacuous pass. Assert the denial status explicitly.
check("19b. A-only is DENIED (403) reading B", aOnlyB.status === 403, `HTTP ${aOnlyB.status}`);

// ── Non-enumeration ──────────────────────────────────────────────────────
const denied = await shell(sA, B);
const ghost = await shell(sA, GHOST);
const [dBody, gBody] = [await denied.text(), await ghost.text()];
check("20. Unauthorized vs nonexistent: same status", denied.status === ghost.status, `${denied.status} vs ${ghost.status}`);
check("21. Unauthorized vs nonexistent: same redirect", denied.headers.get("location") === ghost.headers.get("location"));
check("22. Unauthorized vs nonexistent: identical payload size", dBody.length === gBody.length, `${dBody.length} vs ${gBody.length}`);
check("23. Neither denial echoes the requested id", !dBody.includes(B) && !gBody.includes(GHOST));

// ── SHELL-LEVEL ISOLATION (post-widening) ───────────────────────────────
// Previously untestable: the unified_shell flag sat at internal_admin, so
// non-owner actors were redirected out of /app/* regardless of membership.
// Now that the flag is widened to `beta` for these entitled workspaces, the
// SHELL itself can be certified — not just the API beneath it.
//
// /preview/funnel/{id} is used as the sentinel surface because it
// SERVER-renders the funnel name and is tenant-gated. The campaigns list is a
// client component (onSnapshot), so its data never appears in server HTML and
// could not prove anything either way.
{
  const shellEntry = (s: string, ws: string) =>
    fetch(`${BASE}/app/home`, { headers: { cookie: ctxCookie(s, ws) }, redirect: "manual" });
  const preview = (s: string, ws: string, funnelId: string) =>
    fetch(`${BASE}/preview/funnel/${funnelId}`, { headers: { cookie: ctxCookie(s, ws) }, redirect: "manual" });

  // 1. Authorized users enter the correct workspace shell.
  const inA = await shellEntry(sA, A);
  check("24. SHELL: authorized single-workspace actor enters A", inA.ok, `HTTP ${inA.status}`);
  const inB = await shellEntry(sB, B);
  check("25. SHELL: authorized single-workspace actor enters B", inB.ok, `HTTP ${inB.status}`);

  // 2 + 3. Dual-access switching shows only the active workspace, and no
  // stale tenant data survives the switch.
  const dualA = await preview(sAB, A, plantedA);
  const dualABody = dualA.ok ? await dualA.text() : "";
  check("26. SHELL: dual-access in A sees A's sentinel", dualA.ok && dualABody.includes(SENTINEL_A), `HTTP ${dualA.status}`);
  check("27. SHELL: dual-access in A does NOT see B's sentinel", !dualABody.includes(SENTINEL_B));
  const dualB = await preview(sAB, B, plantedB);
  const dualBBody = dualB.ok ? await dualB.text() : "";
  check("28. SHELL: after switching to B, sees B's sentinel", dualB.ok && dualBBody.includes(SENTINEL_B), `HTTP ${dualB.status}`);
  check("29. SHELL: no stale A data survives the switch", !dualBBody.includes(SENTINEL_A));

  // 4 + 5. Unauthorized cross-workspace access denied, id not echoed.
  const crossPreview = await preview(sA, A, plantedB); // A's actor, B's funnel
  const crossBody = await crossPreview.text();
  check("30. SHELL: unauthorized cannot preview another tenant's funnel", !crossPreview.ok, `HTTP ${crossPreview.status}`);
  check("31. SHELL: denied preview leaks no sentinel", !crossBody.includes(SENTINEL_B));
  const crossShell = await shellEntry(sA, B);
  const crossShellBody = await crossShell.text();
  check("32. SHELL: forged workspace context is denied", !crossShell.ok, `HTTP ${crossShell.status}`);
  check("33. SHELL: forged context echoes no tenant id", !crossShellBody.includes(B));

  // 6. Non-enumeration holds at the shell too.
  const gShell = await shellEntry(sA, GHOST);
  const gBody = await gShell.text();
  check("34. SHELL: unauthorized vs nonexistent same status", crossShell.status === gShell.status, `${crossShell.status} vs ${gShell.status}`);
  check("35. SHELL: unauthorized vs nonexistent identical payload", crossShellBody.length === gBody.length, `${crossShellBody.length} vs ${gBody.length}`);
}

for (const c of cleanup) await c();
console.log(`\ncleaned up ${cleanup.length} probe records`);
console.log(bad === 0 ? "TENANT ISOLATION CERTIFIED (bidirectional, sentinel-proven)" : `${bad} CHECK(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
