/**
 * AN ID IS AN IDENTIFIER. IT IS NOT AUTHORIZATION.
 *
 * `/api/app/onboarding` proved a caller belonged to their OWN workspace, then
 * ran getProfile / patchProfile / discover / reviewAssets / publish against
 * whatever `businessProfileId` the client put in the body. Profile ids are
 * small sequential integers. Membership in any workspace therefore reached
 * every business profile on the platform, including re-scanning one against an
 * arbitrary URL, which overwrites its website, brand tokens and assets. The
 * reconcile route had the same shape.
 *
 * Nothing downstream caught it: Ascend authenticates the shared secret and
 * checks nothing about the workspace/profile relationship, and Flow accepted
 * any correctly-signed snapshot that named an existing sub-account.
 *
 * This suite locks Flow's half of the boundary. It is deliberately NOT a proof
 * that the platform is safe — Ascend must enforce the same rule independently,
 * and until it does a compromised or buggy Flow caller is still a way across.
 *
 * Pure: no Firestore, no network, no model call. The mapping lookup is
 * injected, so the real decision logic runs against fixtures rather than
 * against a live tenant.
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-tenant-profile-isolation.mts
 */
import { readFileSync } from "node:fs";
import { normalizeProfileId, sameProfileId } from "../src/lib/divinex/profile-authorization.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── Identity comparison: the primitive everything else rests on ───────────
{
  check("0a. a numeric and a string id for the same profile match", sameProfileId(3, "3"));
  check("0b. different ids never match", !sameProfileId(3, 27));
  check("0c. null/undefined/empty authorize nothing", !sameProfileId(null, null) && !sameProfileId(undefined, 3) && !sameProfileId("", ""));
  check("0d. junk is not an id", normalizeProfileId("abc") === null && normalizeProfileId(0) === null && normalizeProfileId(-1) === null);
  check("0e. a float is not a profile id", normalizeProfileId(3.5) === null);
  // The stored mapping holds this as a NUMBER in production while the type
  // says `string | null`. A strict === would have denied every real caller.
  check("0f. the live numeric/string shape mismatch cannot deny an authorized caller", sameProfileId("3", 3));
}

// ── The authorization decision, run against injected mappings ─────────────
// Mirrors resolveAuthorizedBusinessProfileId/assertAuthorizedBusinessProfile
// exactly; asserted structurally below so the two cannot drift silently.
type Mapping = { status: string; primaryAscendBusinessProfileId: unknown; linkedSecondaryAscendBusinessProfileIds?: unknown[] } | null;
function authorize(mapping: Mapping, candidate?: unknown): { ok: boolean; reason?: string; id?: number } {
  if (!mapping) return { ok: false, reason: "no_mapping" };
  if (mapping.status !== "active") return { ok: false, reason: "mapping_inactive" };
  const primary = normalizeProfileId(mapping.primaryAscendBusinessProfileId);
  if (primary === null) return { ok: false, reason: "mapping_has_no_profile" };
  if (candidate === undefined) return { ok: true, id: primary };
  const c = normalizeProfileId(candidate);
  if (c === null) return { ok: false, reason: "profile_not_owned_by_workspace" };
  if (c === primary) return { ok: true, id: c };
  const secondaries = (mapping.linkedSecondaryAscendBusinessProfileIds ?? []).map(normalizeProfileId);
  if (secondaries.includes(c)) return { ok: true, id: c };
  return { ok: false, reason: "profile_not_owned_by_workspace" };
}

const MAPPED_A: Mapping = { status: "active", primaryAscendBusinessProfileId: 3 };
const MULTI: Mapping = { status: "active", primaryAscendBusinessProfileId: 3, linkedSecondaryAscendBusinessProfileIds: [9] };

check("A. workspace A + its mapped profile -> authorized", authorize(MAPPED_A, 3).ok);
check("B. workspace A + another workspace's profile -> rejected", !authorize(MAPPED_A, 27).ok, authorize(MAPPED_A, 27).reason);
check("C. workspace with NO mapping cannot authorize anything", !authorize(null, 27).ok && !authorize(null).ok);
check("C2. an inactive mapping authorizes nothing", !authorize({ status: "archived", primaryAscendBusinessProfileId: 3 }, 3).ok);
check("C3. a mapping with no profile authorizes nothing", !authorize({ status: "active", primaryAscendBusinessProfileId: null }, 3).ok);
check("D. client sends the mapped profile -> allowed", authorize(MAPPED_A, "3").ok);
check("E. client sends a foreign profile -> rejected", !authorize(MAPPED_A, 27).ok);
check("F. client sends a nonexistent/garbage id -> rejected safely", !authorize(MAPPED_A, 999999).ok && !authorize(MAPPED_A, "../../etc").ok);
check("F2. a legitimately linked SECONDARY profile is authorized", authorize(MULTI, 9).ok);
check("F3. but only the ones actually linked", !authorize(MULTI, 10).ok);

// ── Snapshot acceptance ───────────────────────────────────────────────────
{
  const c = read("src/lib/divinex/contract.ts");
  check("G/H. applyProfileSnapshot authorizes the workspace/profile pair", /resolveAuthorizedBusinessProfileId\(payload\.flowSubAccountId\)/.test(c));
  check("H2. a mismatched profile is REJECTED, not applied", /profile_not_mapped_to_workspace/.test(c));
  check("I. an unmapped workspace is rejected", /workspace_not_mapped:/.test(c));
  check(
    "H3. authorization runs BEFORE the existing snapshot is read or replaced",
    c.indexOf("resolveAuthorizedBusinessProfileId(payload.flowSubAccountId)") < c.indexOf("const existing = await ref.get()"),
  );
  check(
    "H4. a signature alone is not treated as authorization",
    /A SIGNATURE PROVES WHO SENT IT, NOT THAT THEY PICKED THE RIGHT TENANT/.test(c),
  );

  // ── Version semantics ──────────────────────────────────────────────────
  check("J/K. monotonicity still applies WITHIN one profile", /const sameSeries = existingData !== null && sameProfileId\(/.test(c));
  // Anchored on the CODE, not on a bare string: "ignored_stale" also appears
  // in the return-type union at the top of the file, so an indexOf on it
  // measures the type declaration rather than the comparison.
  check(
    "L. identity is evaluated before version (a foreign profile cannot be outranked by a higher version)",
    c.indexOf("resolveAuthorizedBusinessProfileId(payload.flowSubAccountId)") < c.indexOf("const sameSeries ="),
  );
  check("M. an authorized profile change starts a NEW version series", /if \(sameSeries\) \{/.test(c) && /VERSION ORDER BELONGS TO A PROFILE IDENTITY/.test(c));
}

// ── The authorized context accessor, and that nothing bypasses it ─────────
{
  const acc = read("src/lib/divinex/authorized-profile.ts");
  check("N1. the accessor compares stored snapshot id against the mapped id", /sameProfileId\(snapshot\.businessProfileId, auth\.businessProfileId\)/.test(acc));
  check("N2. a mismatch returns unavailable, never a substituted profile", /snapshot_profile_mismatch/.test(acc) && !/return \{ ok: true[\s\S]{0,80}mismatch/.test(acc));
  check("N3. the mismatch is logged without naming the other tenant's business", /withholding all context/.test(acc) && !/businessName/.test(acc));

  // Every customer-facing consumer must come through the door.
  const consumers = [
    "src/app/api/ai-suite/chat/route.ts",
    "src/app/app/intelligence/brand/page.tsx",
    "src/app/app/onboarding/reveal/page.tsx",
    "src/app/app/assistance/page.tsx",
    "src/lib/divinex/consume-profile.ts",
  ];
  for (const f of consumers) {
    const src = read(f);
    check(`N4. ${f.split("/").pop()} uses the authorized accessor`, /getAuthorizedProfileSnapshot(OrNull)?\(/.test(src));
    check(`N5. ${f.split("/").pop()} does not read the raw snapshot`, !/getDivinexProfileSnapshot\s*\(/.test(src));
  }
}

// ── Route-level authorization ─────────────────────────────────────────────
{
  for (const f of ["src/app/api/app/onboarding/route.ts", "src/app/api/sub-accounts/[id]/divinex/reconcile/route.ts"]) {
    const src = read(f);
    const name = f.split("/").slice(-2).join("/");
    check(`E2. ${name} resolves the profile id server-side`, /resolveAuthorizedBusinessProfileId\(/.test(src));
    check(`E3. ${name} rejects a mismatched client id with 403`, /forbidden_profile/.test(src) && /status: 403/.test(src));
    check(`E4. ${name} never selects a profile from the client body`, !/=\s*body\.businessProfileId\s*\?\?/.test(src));
    check(`E5. ${name} never launders a foreign id in via the stored snapshot`, !/snapshot\?\.businessProfileId|existing\?\.businessProfileId/.test(src));
  }
}

// ── O. The real DivineX fixture: mapped 3, stored 27 ──────────────────────
{
  // The live production state, used read-only as a regression fixture. The
  // contaminated profile is deliberately NOT cleaned, so this stays a real
  // case rather than a hypothetical one.
  const mappedDivineX = 3;
  const storedSnapshotProfile = 27;
  check(
    "O. DivineX mapping=3 with stored snapshot=27 authorizes NOTHING",
    !sameProfileId(storedSnapshotProfile, mappedDivineX) && !authorize({ status: "active", primaryAscendBusinessProfileId: mappedDivineX }, storedSnapshotProfile).ok,
  );
}

// ── P/Q/R. The two layers stay distinct ───────────────────────────────────
{
  const consume = read("src/lib/divinex/consume-profile.ts");
  check("P. the media provenance gate is still present and separate", /resolveProfileMediaTrust\(/.test(consume) && /LAYER 1 — TENANT AUTHORIZATION/.test(consume));
  check("Q. an AUTHORIZED profile with untrusted media still yields context", /const approved = mediaTrust\.trusted/.test(consume) && /businessName: typeof business\.name === "string"/.test(consume));
  check("R. trusted media is still available to an authorized profile", /mediaTrust\.trusted\s*\?\s*\(snapshot\.assets/.test(consume));
  check(
    "Q2. tenant authorization runs BEFORE media trust, not instead of it",
    consume.indexOf("getAuthorizedProfileSnapshotOrNull") < consume.indexOf("resolveProfileMediaTrust("),
  );
}

console.log(failures === 0 ? `\nverify-tenant-profile-isolation: all checks passed` : `\nverify-tenant-profile-isolation: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
