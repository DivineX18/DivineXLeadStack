/**
 * A MAPPING NOBODY ACTIVATES AUTHORIZES NOTHING.
 *
 * The cross-tenant hardening (ee86d96) made `applyProfileSnapshot` require an
 * ACTIVE mapping. That is correct. What it did not account for is that
 * `createMappingIdempotent` opens every mapping at `pending_provision`, and the
 * only code anywhere that advanced one to `active` was the SSO callback.
 *
 * So a workspace that reached Ascend through onboarding rather than an SSO
 * handoff was mapped but permanently inactive, and every snapshot Ascend
 * published for it was rejected `workspace_not_mapped:mapping_inactive`. No
 * brand library, no Zeno business context, no intelligence, and landing pages
 * generated against nothing. Caught by the first real Flow-first workspace on
 * the fresh production database (Phase 12), not by any existing test — because
 * the one previously-mapped workspace had been activated years earlier by SSO.
 *
 * This suite pins the two halves apart, because conflating them is how the
 * regression would return:
 *   - AUTHORIZATION still refuses an inactive mapping (unchanged, and must be)
 *   - PROVISIONING now finishes the job it starts
 *
 * Pure: no Firestore, no network. Structure is asserted against the source so
 * a future edit that drops the activation, or that "fixes" this by loosening
 * the status check instead, fails here.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-mapping-activation.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const link = read("src/lib/workspace/link-ascend-business-profile.ts");
const authz = read("src/lib/divinex/profile-authorization.ts");
const contract = read("src/lib/divinex/contract.ts");
const sso = read("src/app/api/auth/sso/callback/route.ts");

// ── The authorization rule is UNCHANGED ───────────────────────────────────
{
  check(
    "1a. an inactive mapping still authorizes nothing",
    /if \(mapping\.status !== "active"\) return deny\("mapping_inactive"\)/.test(authz),
  );
  check(
    "1b. snapshot acceptance still requires an authorized workspace",
    /resolveAuthorizedBusinessProfileId\(payload\.flowSubAccountId\)/.test(contract) &&
      /workspace_not_mapped:/.test(contract),
  );
  // The tempting wrong fix: make pending_provision authorize. That would let
  // a half-provisioned workspace accept snapshots, which is the hole the
  // hardening closed.
  check(
    "1c. pending_provision was NOT made to satisfy authorization",
    !/pending_provision/.test(authz),
    "profile-authorization.ts must not mention it at all",
  );
}

// ── Provisioning finishes what it starts ──────────────────────────────────
{
  // Deliberately anchored on a CALL, not on the helper's definition. A
  // definition that nothing invokes is exactly the regression, and an earlier
  // draft of this check passed against source where every call site had been
  // removed.
  check("2a. onboarding's linker actually CALLS the activation", /await activateFreshMapping\(/.test(link));
  check("2b. via the real status transition, not a direct write", /updateMappingStatus\(workspaceId, "active"/.test(link));
  check(
    "2c. and ONLY from pending_provision",
    /if \(status !== "pending_provision"\) return;/.test(link),
  );
  check(
    "2d. so suspended/archived are never quietly undone",
    !/updateMappingStatus\([^)]*"suspended"|updateMappingStatus\([^)]*"archived"/.test(link),
  );
  check(
    "2e. activation is attempted on every branch that leaves a usable mapping",
    (link.match(/await activateFreshMapping\(/g) ?? []).length >= 3,
    `${(link.match(/await activateFreshMapping\(/g) ?? []).length} call sites (created / already_linked / attached)`,
  );
  check(
    "2f. it stays non-fatal, like every other write on the onboarding path",
    /catch \{[\s\S]{0,200}\}\n\}/.test(link.slice(link.indexOf("async function activateFreshMapping"))),
  );
}

// ── The SSO path keeps its own activation ─────────────────────────────────
{
  check(
    "3a. SSO still activates its own freshly-created mapping",
    /updateMappingStatus\([^)]*"active", "system:sso-bridge"\)/.test(sso),
  );
  check(
    "3b. and the two paths are distinguishable in the audit trail",
    /"system:onboarding"/.test(link) && /"system:sso-bridge"/.test(sso),
  );
}

// ── The regression itself, stated as a property ───────────────────────────
{
  // Before the fix, the ONLY activator in the codebase was the SSO callback.
  // If that is ever true again, a Flow-first workspace silently loses all
  // business context.
  const activators = [
    ["sso callback", /updateMappingStatus\([^)]*"active"/.test(sso)],
    ["onboarding linker", /updateMappingStatus\([^)]*"active"/.test(link)],
  ] as const;
  const count = activators.filter(([, v]) => v).length;
  check(
    "4. a workspace can become active WITHOUT an SSO handoff",
    count >= 2,
    activators.map(([n, v]) => `${n}=${v}`).join(" "),
  );
}

console.log(
  failures === 0
    ? `\nverify-mapping-activation: all checks passed`
    : `\nverify-mapping-activation: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
