/**
 * Ascend OS Phase 2, Slice 5 — characterization test proving the
 * NextResponse-free resolveSubAccountAccess()/resolveAuthedCaller()
 * extraction from lib/auth/require-tenancy.ts preserved
 * requireSubAccountMember()'s exact observable behavior. Same technique
 * as Slice 3's verify-sso-jit-extraction.mts: diffs against the specific
 * pre-extraction commit (not a floating HEAD — Slice 3 already found that
 * floating HEAD breaks once the extraction commit itself lands).
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const PRE_EXTRACTION_COMMIT = "6032270"; // Slice 4's commit -- last one before this extraction
const readAtCommit = (rel: string) => execSync(`git show ${PRE_EXTRACTION_COMMIT}:${rel}`, { cwd: root, encoding: "utf8" });

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const original = readAtCommit("src/lib/auth/require-tenancy.ts");
const updated = read("src/lib/auth/require-tenancy.ts");

// ── Every original status code + error message is preserved (formatting-tolerant) ──
check(
  "404 'Sub-account not found' preserved (formatting may differ: single- vs multi-line)",
  original.includes('{ error: "Sub-account not found" }') &&
    /error:\s*"Sub-account not found"\s*\},?\s*\n?\s*\{\s*status:\s*404/.test(updated),
);
const literalFragments = [
  'NextResponse.json({ error: "Not a member" }, { status: 403 })',
  'NextResponse.json({ error: "Membership inactive" }, { status: 403 })',
  'caller.agencyRole === "owner" && caller.agencyId === sub.agencyId',
  'subAccountRole: "agencyOwner"',
  'member.status !== "active"',
  'const role = member.role as SubAccountRole',
];
for (const fragment of literalFragments) {
  const inOriginal = original.includes(fragment);
  if (!inOriginal) {
    check(`(sanity) fragment was actually in the original: "${fragment.slice(0, 40)}..."`, false);
    continue;
  }
  check(`Preserved: "${fragment.slice(0, 50)}..."`, updated.includes(fragment));
}

// ── Decision-logic order preserved: agency-owner shortcut BEFORE membership lookup ──
check(
  "Agency-owner shortcut is still checked before the membership doc read (0-read fast path preserved)",
  /agencyRole === "owner" && caller\.agencyId === sub\.agencyId[\s\S]{0,150}memberSnap/.test(updated),
);

// ── requireSubAccountMember is now a thin wrapper, not a duplicate implementation ──
check(
  "requireSubAccountMember delegates to resolveSubAccountAccess rather than re-reading Firestore itself",
  /export async function requireSubAccountMember[\s\S]{0,400}?await resolveSubAccountAccess\(/.test(updated),
);
check(
  "requireSubAccountMember no longer directly calls db.doc(`subAccounts/...) itself (moved into resolveSubAccountAccess)",
  (() => {
    const fnStart = updated.indexOf("export async function requireSubAccountMember");
    const fnEnd = updated.indexOf("\n}", fnStart);
    const body = updated.slice(fnStart, fnEnd);
    return !body.includes("db.doc(`subAccounts/");
  })(),
);

// ── New exports exist and are usable without a Request object ─────────────
check("resolveSubAccountAccess is exported", updated.includes("export async function resolveSubAccountAccess("));
check("resolveAuthedCaller is exported (uid-based, no Request needed)", updated.includes("export async function resolveAuthedCaller("));
check("resolveAuthedCaller reuses readClaims rather than re-fetching claims a new way", /resolveAuthedCaller[\s\S]{0,300}await readClaims\(uid\)/.test(updated));
check("AuthedCaller and SubAccountAccess types are now exported (needed by the new evaluator)", updated.includes("export interface AuthedCaller") && updated.includes("export interface SubAccountAccess"));

// ── Existing callers of requireSubAccountMember are untouched ─────────────
check(
  "requireSubAccountAdmin (existing caller) is unchanged — still calls requireSubAccountMember the same way",
  updated.includes("const access = await requireSubAccountMember(request, subAccountId)"),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
