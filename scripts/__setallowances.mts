import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePlanLimits } from "@/lib/server/billing-service";

const APPLY = process.argv.includes("--apply");
const AGENCY = "U5SBAHsB0nZ7ce552H9h";

// The approved launch guardrails. maxWebsites is deliberately absent: it
// was not part of the approved structure, so it keeps its current value.
const TARGET: Record<string, Record<string, number | null>> = {
  six9XRCcbmAx7rBrgCO6: { // Ascend Solo
    maxMembers: 1, maxSubAccounts: 1, maxGrowthScansPerMonth: 10,
    maxAiGenerationsPerMonth: 100, maxAiSpendPerMonth: 15,
    maxEmailsPerMonth: 2_000, maxVoiceMinutesPerMonth: 200, maxSharedSmsPerMonth: 500,
  },
  xZJultbFi4dTqF9vJTIY: { // Ascend Team
    maxMembers: 5, maxSubAccounts: 5, maxGrowthScansPerMonth: 100,
    maxAiGenerationsPerMonth: 750, maxAiSpendPerMonth: 40,
    maxEmailsPerMonth: 10_000, maxVoiceMinutesPerMonth: 600, maxSharedSmsPerMonth: 1_500,
  },
  SvnbPxTVu6yWsYIl6tT6: { // Ascend Agency — members unlimited by design
    maxMembers: null, maxSubAccounts: 25, maxGrowthScansPerMonth: 250,
    maxAiGenerationsPerMonth: 2_000, maxAiSpendPerMonth: 90,
    maxEmailsPerMonth: 30_000, maxVoiceMinutesPerMonth: 1_500, maxSharedSmsPerMonth: 4_000,
  },
};

const db = getAdminDb();
for (const [planId, target] of Object.entries(TARGET)) {
  const ref = db.doc(`agencies/${AGENCY}/plans/${planId}`);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  MISSING ${planId}`); continue; }
  const d = snap.data()!;
  const next = normalizePlanLimits({ ...(d.limits ?? {}), ...target });
  const before = (d.limits ?? {}) as Record<string, unknown>;
  const changed = Object.keys(target).filter((k) => String(before[k] ?? "unset") !== String(next[k as keyof typeof next] ?? "unset"));
  console.log(`\n  ${String(d.name).padEnd(7)} $${(d.priceMonthlyCents/100).toFixed(0)}  ${planId}`);
  console.log(`    price UNTOUCHED, stripePriceId UNTOUCHED`);
  console.log(`    changing: ${changed.map((k) => `${k} ${before[k] ?? "unset"}->${next[k as keyof typeof next] ?? "null"}`).join(", ") || "(nothing)"}`);
  if (APPLY) await ref.update({ limits: next });
}
console.log(APPLY ? "\nAPPLIED (limits only)" : "\nDRY RUN. Re-run with --apply.");
process.exit(0);
