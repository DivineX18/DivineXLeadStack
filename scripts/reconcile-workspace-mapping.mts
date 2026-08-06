/**
 * Ascend OS Phase 2, Slice 4 — single Workspace Mapping reconciliation.
 *
 * Confirms the Flow sub-account still exists, the agency relationship
 * matches, the owner still has active membership, and (only if an Ascend
 * profile-existence checker is wired up later) that the linked business
 * profiles still exist. Reports drift. Only ever auto-repairs the one
 * deterministic, safe case (agencyId mismatch, where the live Flow
 * SubAccount is unambiguously authoritative) — ownership/membership drift
 * is reported only, never guessed or auto-fixed, per this slice's explicit
 * instruction.
 *
 * Usage:
 *   npx tsx scripts/reconcile-workspace-mapping.mts --workspace-id <id> [--repair-safe-drift]
 */
import { reconcileMapping } from "../src/lib/workspace/workspace-mappings-service.ts";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceId = args["workspace-id"] as string | undefined;
  const repairSafeDrift = args["repair-safe-drift"] === true;

  if (!workspaceId) {
    console.error("Usage: --workspace-id <id> [--repair-safe-drift]");
    process.exit(1);
  }

  console.log(`\nReconciling workspaceMappings/${workspaceId} (repairSafeDrift: ${repairSafeDrift})\n`);

  const result = await reconcileMapping(workspaceId, "system:reconciliation-tool", { repairSafeDrift });
  if (!result.ok) {
    console.error(`Reconciliation failed: ${result.reason}`);
    process.exit(1);
  }

  console.log(`Outcome: ${result.value.outcome}`);
  console.log(`Drift fields: ${result.value.driftFields.length ? result.value.driftFields.join(", ") : "(none)"}`);
  console.log(`Details: ${result.value.details}`);

  if (result.value.outcome === "drift_detected") {
    console.log(
      "\nDrift was detected but NOT auto-repaired (either it isn't the safe agencyId-only case, or --repair-safe-drift wasn't passed). Review the details above before deciding how to proceed manually.",
    );
  }
}

main().catch((err) => {
  console.error("Reconciliation tool failed:", err);
  process.exit(1);
});
