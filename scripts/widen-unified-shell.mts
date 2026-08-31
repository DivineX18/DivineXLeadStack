/**
 * WIDEN THE UNIFIED SHELL — P0.2 final step.
 *
 * Uses the flag's OWN rollout mechanism. It does NOT remove the throttle:
 * `internal_admin` (agency owners only) -> `beta` with an explicit
 * allowedWorkspaceIds list. Eligibility still requires the workspace to be
 * entitled (full_ascend), so this widens WHO may enter a shell they already
 * qualify for — it does not grant the product to anyone.
 *
 * Dry-run by default. --apply to write. Idempotent.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/widen-unified-shell.mts [--apply] [--workspace <id> ...]
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const explicit = process.argv.filter((a, i) => process.argv[i - 1] === "--workspace");

const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { evaluateWorkspaceEntitlements } = await import("../src/lib/entitlements/evaluate-workspace-entitlements.ts");
const db = getAdminDb();
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const ref = db.doc("featureFlags/unified_shell");
const flag = (await ref.get()).data() as { rolloutStage?: string; allowedWorkspaceIds?: string[] } | undefined;
const current = flag?.allowedWorkspaceIds ?? [];
console.log(`current: stage=${flag?.rolloutStage} allowed=${JSON.stringify(current)}`);

// Only ENTITLED workspaces are added. A workspace that has not been granted
// Ascend commercially must never be widened into the shell by a rollout flag.
const candidates = explicit.length ? explicit : current;
const eligible: string[] = [];
for (const ws of candidates) {
  const ent = await evaluateWorkspaceEntitlements({ uid: OWNER, workspaceId: ws });
  const ok = ent.effectiveTier === "full_ascend";
  console.log(`  ${ws}: tier=${ent.effectiveTier} -> ${ok ? "ELIGIBLE" : "SKIPPED (not entitled)"}`);
  if (ok) eligible.push(ws);
}

const next = Array.from(new Set([...current, ...eligible]));
console.log(`\ntarget: stage=beta allowed=${JSON.stringify(next)}`);
if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write.");
  process.exit(0);
}
await ref.set({ rolloutStage: "beta", allowedWorkspaceIds: next, updatedByUid: OWNER, updatedAt: new Date() }, { merge: true });
const after = (await ref.get()).data() as { rolloutStage?: string; allowedWorkspaceIds?: string[] };
console.log(`\nWROTE stage=${after?.rolloutStage} allowed=${JSON.stringify(after?.allowedWorkspaceIds)}`);
