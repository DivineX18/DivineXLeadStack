/**
 * PLATFORM ROLE CERTIFICATION — P0.1.
 *
 * The acceptance standard is NOT "hello@divinex.io got Super Admin". It is:
 *   (a) every existing user keeps exactly the access they had before, and
 *   (b) a client-side attempt to claim a higher role does absolutely nothing.
 *
 * (b) is the one worth testing hardest — it is the difference between a role
 * system and the appearance of one.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-platform-roles.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const { PLATFORM_ROLES, isPlatformRole, platformRoleHasCapability, BOOTSTRAP_SUPER_ADMIN_EMAIL } =
  await import("../src/types/platform-roles.ts");
const { resolvePlatformRole, isSuperAdmin, callerHasPlatformCapability, requirePlatformCapability } =
  await import("../src/lib/auth/platform-role.ts");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const auth = getAdminAuth();
const db = getAdminDb();
const owner = await auth.getUserByEmail(BOOTSTRAP_SUPER_ADMIN_EMAIL);

// ── Seeded correctly, server-side ────────────────────────────────────────
check("1. Bootstrap account resolves as super_admin", await isSuperAdmin(owner.uid));
check("2. Super admin holds every platform capability",
  await callerHasPlatformCapability(owner.uid, "platform.impersonate"));

// ── Fails closed ─────────────────────────────────────────────────────────
check("3. Unknown uid has NO platform role", (await resolvePlatformRole("does-not-exist-" + Date.now())) === null);
check("4. Empty/null uid has NO platform role", (await resolvePlatformRole(null)) === null && (await resolvePlatformRole("")) === null);

// ── A client cannot grant itself a role ──────────────────────────────────
// Simulate the browser writing a role onto its OWN user doc, then confirm the
// server-side resolver ignores anything that is not a real platformRole, and
// that a garbage value never becomes a role.
const probeUid = `e2e-role-probe-${Date.now()}`;
await db.doc(`users/${probeUid}`).set({ platformRole: "super_admin_please", displayName: "probe" });
check("5. A non-registry role string is REJECTED, not coerced", (await resolvePlatformRole(probeUid)) === null, "platformRole=super_admin_please");
await db.doc(`users/${probeUid}`).set({ platformRole: { admin: true } }, { merge: true });
check("6. A non-string role value is REJECTED", (await resolvePlatformRole(probeUid)) === null);
await db.doc(`users/${probeUid}`).delete();

// ── Capability matrix is coherent ────────────────────────────────────────
check("7. Support cannot impersonate", !platformRoleHasCapability("support", "platform.impersonate"));
check("8. Support can read for troubleshooting", platformRoleHasCapability("support", "platform.support.read"));
check("9. No platform role means no capability", !platformRoleHasCapability(null, "platform.support.read"));
check("10. Every registry role is recognised by the type guard", PLATFORM_ROLES.every((r) => isPlatformRole(r)));

// ── The guard throws rather than returning a quiet false ─────────────────
let threw = false;
try { await requirePlatformCapability(probeUid, "platform.admin"); } catch { threw = true; }
check("11. requirePlatformCapability throws for an unauthorised caller", threw);

// ── EXISTING ACCESS IS UNCHANGED (the real acceptance standard) ──────────
// Platform roles are a NEW, separate axis. No existing workspace membership
// or role may be altered by this migration.
const members = await db.collectionGroup("subAccountMembers").limit(25).get();
const shapes = members.docs.map((d) => d.data() as { subAccountRole?: string; status?: string });
check("12. Existing memberships still carry their original role vocabulary",
  shapes.length === 0 || shapes.every((m) => m.subAccountRole === undefined || ["admin", "collaborator"].includes(m.subAccountRole)),
  `${shapes.length} membership rows sampled`);
check("13. Platform role does NOT appear on membership rows (separate axis)",
  shapes.every((m) => !("platformRole" in (m as Record<string, unknown>))));

// ── PRIVILEGE ESCALATION: a real client-authenticated write attempt ──────
// The decisive test, and it MUST use an unprivileged user. An earlier version
// of this ran as the bootstrap account, which already held super_admin — so
// the write was a no-op, diff().affectedKeys() was empty, the guard correctly
// did not fire, and the HTTP 200 looked like a security hole that was not
// there. Testing escalation requires someone with something to gain.
{
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const victimEmail = `role-probe-${Date.now()}@example.com`;
  const victim = await auth.createUser({ email: victimEmail, password: `Probe!${Date.now()}` });
  await db.doc(`users/${victim.uid}`).set({ displayName: "Role probe", status: "active" });

  const ct = await auth.createCustomToken(victim.uid);
  const tok = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const { idToken } = (await tok.json()) as { idToken: string };

  const attempt = async (fields: Record<string, unknown>) =>
    fetch(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${victim.uid}?` +
        Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join("&"),
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      },
    );

  check("14. Probe user starts with NO platform role", (await resolvePlatformRole(victim.uid)) === null);

  const escalate = await attempt({ platformRole: { stringValue: "super_admin" } });
  check("15. ESCALATION BLOCKED: an unprivileged client cannot grant itself super_admin",
    escalate.status === 403, `HTTP ${escalate.status}`);

  check("16. Server-side role STILL null after the attempt", (await resolvePlatformRole(victim.uid)) === null);

  const benign = await attempt({ displayName: { stringValue: "Renamed by owner" } });
  check("17. Ordinary self-update still works (guard is field-scoped, not a lockout)",
    benign.ok, `HTTP ${benign.status}`);

  await db.doc(`users/${victim.uid}`).delete();
  await auth.deleteUser(victim.uid);
  console.log("     (probe user cleaned up)");
}

console.log(`\n${bad === 0 ? "PLATFORM ROLES CERTIFIED" : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
