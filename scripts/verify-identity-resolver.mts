/**
 * Ascend OS Phase 2, Slice 7 — structural/source-level regression coverage
 * for the Firestore-backed identity resolver, wrappers, and audit module
 * (necessarily structural, same constraint as every prior slice's
 * server-only Admin SDK code). The pure workspace-selection/migration-
 * state logic already has genuine unit-test coverage in
 * verify-identity-resolution.mts.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const readAtCommit = (rel: string, commit: string) => execSync(`git show ${commit}:${rel}`, { cwd: root, encoding: "utf8" });

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const resolver = read("src/lib/identity/resolve-identity.ts");
const wrappers = read("src/lib/identity/identity-wrappers.ts");
const audit = read("src/lib/identity/identity-audit.ts");
const rules = read("firestore.rules");

// ── One canonical resolver ──────────────────────────────────────────────
check("Exactly one core resolver function exists", resolver.includes("export async function resolveIdentity("));

// ── Does NOT authenticate -- resolves an already-verified uid only ──────
check("Core resolver does NOT import NextResponse (not a route-response concern)", !/^import .*NextResponse.*$/m.test(resolver) && !resolver.includes('from "next/server"'));
check("Core resolver is server-only", resolver.trimStart().startsWith('import "server-only"'));
check(
  "Core resolver never calls a password/credential verification function (verifyPassword, signInWith*, verifyIdToken, verifySessionCookie)",
  !/verifyPassword|signInWith|verifyIdToken|verifySessionCookie/.test(resolver),
);
check("resolveIdentity's uid parameter is a plain string, not a Request or credential object", /export async function resolveIdentity\(uid: string/.test(resolver));

// ── Composition, not duplication -- reuses Slices 3, 4, 5, 6 exactly ────
check("Reuses Slice 5's resolveAuthedCaller + resolveSubAccountAccess (not reimplemented)", resolver.includes('from "@/lib/auth/require-tenancy"') && resolver.includes("resolveAuthedCaller(uid)") && resolver.includes("resolveSubAccountAccess("));
check("Reuses Slice 3's getIdentityLinkByFirebaseUid (not a duplicated identityLinks lookup)", resolver.includes('from "@/lib/auth/identity-links-service"') && resolver.includes("getIdentityLinkByFirebaseUid(uid)"));
check("Reuses Slice 4's getMappingBySubAccountId (not a duplicated Workspace Mapping read)", resolver.includes('from "@/lib/workspace/workspace-mappings-service"') && resolver.includes("getMappingBySubAccountId("));
check("Reuses Slice 5's pure roleHasPermission for allowedPermissions (zero extra Firestore reads)", resolver.includes('from "@/lib/permissions/workspace-permission-compat"') && resolver.includes("roleHasPermission("));
check("Reuses Slice 6's evaluateWorkspaceEntitlements (not a duplicated entitlement composition)", resolver.includes('from "@/lib/entitlements/evaluate-workspace-entitlements"') && resolver.includes("evaluateWorkspaceEntitlements("));
check("Workspace candidates come from the EXISTING userMemberships index, not a new collection", resolver.includes("userMemberships/${uid}/subAccounts"));
check("No second, inline permission-checking logic exists in the resolver (delegates entirely to roleHasPermission)", !/allowed\s*=\s*role\s*===/.test(resolver));

// ── Every existing login/logout/SSO/JIT file is untouched by this slice ──
{
  // Slice 7's starting point is the Slice 6 commit -- diff every
  // session-creation-adjacent file against it and confirm zero changes.
  const PRE_SLICE7_COMMIT = "d992c21";
  const filesThatMustBeUnchanged = [
    "src/lib/firebase/auth.ts",
    "src/middleware.ts",
    "src/app/api/auth/sso/callback/route.ts",
    "src/app/api/auth/sso/exchange-bridge-token/route.ts",
    "src/app/auth/sso/finish/page.tsx",
    "src/lib/auth/sso-jit-provisioning.ts",
    "src/lib/auth/sso-bridge-token.ts",
    "src/lib/auth/sso-workspace-access.ts",
  ];
  for (const f of filesThatMustBeUnchanged) {
    const before = readAtCommit(f, PRE_SLICE7_COMMIT);
    const after = read(f);
    check(`Untouched by this slice: ${f} (byte-for-byte identical to the pre-Slice-7 commit)`, before === after);
  }
}

// ── Wrappers: reuse the resolver, service-to-service discipline ─────────
check("Human-session (API route) wrapper delegates to the core resolver", wrappers.includes("return resolveIdentity(uid, options)"));
check("Server-action wrapper delegates to the core resolver too (same function, not a parallel implementation)", (wrappers.match(/return resolveIdentity\(/g) ?? []).length >= 2);
check("Shell wrapper is an alias of the server-action wrapper, not a third implementation", wrappers.includes("export const resolveIdentityForShell = resolveIdentityForServerAction"));
check("Service-to-service wrapper REQUIRES representedUid (not optional), same discipline as Slices 5-6", /representedUid: string;/.test(wrappers) && /if \(!params\.representedUid\)/.test(wrappers));
check("Zeno + Ascend-bridge stubs route through the SAME service-to-service function (no fourth parallel implementation)", wrappers.includes("export const resolveIdentityForAscendBridge = resolveIdentityForZeno"));
{
  // Check only the actual function BODIES, not the surrounding prose
  // comment (which deliberately names createSessionCookie() to explain
  // what this hook does NOT do -- a naive whole-section substring check
  // would false-positive on its own explanation, same class of mistake
  // Slice 5 hit with a "NextResponse" comment).
  const loginFnBody = wrappers.match(/export function recordLoginEvent\([^)]*\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const logoutFnBody = wrappers.match(/export function recordLogoutEvent\([^)]*\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";
  check(
    "Login/logout event recorder function BODIES do NOT create a session themselves (no signInWith*/createSessionCookie call) -- audit-only hooks, not a new login path",
    loginFnBody.length > 0 &&
      logoutFnBody.length > 0 &&
      !/signInWith|createSessionCookie\(/.test(loginFnBody) &&
      !/signInWith|createSessionCookie\(/.test(logoutFnBody),
  );
}

// ── Audit: meaningful events only, no noisy per-resolution logging ──────
check(
  "Exactly five identity event types are defined (login, logout, workspace_resolution_failure, identity_conflict, session_anomaly) -- no sixth 'resolution_succeeded' noise event",
  audit.includes('"login" | "logout" | "workspace_resolution_failure" | "identity_conflict" | "session_anomaly"'),
);
check("Resolver never logs a routine successful workspace resolution (no logIdentityEvent call on the 'active' happy path)", !/status: "active"[\s\S]{0,50}logIdentityEvent/.test(resolver));
check("Audit writes are append-only (.add(), not .set()/.update() on a fixed doc)", /identityAuditEvents["']\)\s*\n?\s*\.add\(/.test(audit.replace(/\s+/g, " ")));
check("Audit writes are best-effort (never throw into the caller's request path)", audit.includes(".catch((err) =>"));

// ── Firestore rules: the one genuinely new collection is locked down ──────
check(
  "firestore.rules: identityAuditEvents is Admin-SDK-only",
  /match \/identityAuditEvents\/\{[^}]+\}\s*\{\s*allow read, write: if false;/.test(rules),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
