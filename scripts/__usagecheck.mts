import { getAdminDb } from "@/lib/firebase/admin";
const db = getAdminDb();
const mk = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
const subs = await db.collection("subAccounts").get();
let onPlan = 0, anyUsage = 0;
console.log(`month ${mk}, workspaces ${subs.size}`);
for (const d of subs.docs) {
  const b = (d.data().billing ?? {}) as { planId?: string; status?: string };
  if (!b.planId) continue;
  onPlan++;
  const u = await db.doc(`subAccounts/${d.id}/usageCounters/${mk}`).get();
  const c = (u.data() ?? {}) as Record<string, number>;
  const used = ["emails", "aiGenerations", "growthScans", "voiceMinutes", "aiSpend", "sharedSms"]
    .map((k) => [k, Number(c[k] ?? 0)] as const).filter(([, v]) => v > 0);
  if (used.length > 0) {
    anyUsage++;
    console.log(`  ${d.id} "${String(d.data().name).slice(0,22)}" status=${b.status} :: ${used.map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }
}
console.log(`\nworkspaces on a plan: ${onPlan}   with any metered usage this month: ${anyUsage}`);
process.exit(0);
