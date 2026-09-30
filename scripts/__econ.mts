import { getAdminDb } from "@/lib/firebase/admin";
const db = getAdminDb();
const plans = await db.collection("agencies/U5SBAHsB0nZ7ce552H9h/plans").get();
for (const p of plans.docs) {
  const d = p.data();
  if (d.status !== "active" || d.product !== "unified") continue;
  const l = (d.limits ?? {}) as Record<string, unknown>;
  console.log(`  ${String(d.name).padEnd(7)} $${(d.priceMonthlyCents/100).toFixed(0)}  members=${l.maxMembers ?? "∞"} subAcc=${l.maxSubAccounts} scans=${l.maxGrowthScansPerMonth} aiGen=${l.maxAiGenerationsPerMonth} aiSpend=$${l.maxAiSpendPerMonth} emails=${l.maxEmailsPerMonth} voice=${l.maxVoiceMinutesPerMonth}min sms=${l.maxSharedSmsPerMonth}`);
}
process.exit(0);
