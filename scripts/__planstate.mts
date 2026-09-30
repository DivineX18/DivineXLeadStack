import { getAdminDb } from "@/lib/firebase/admin";
const db = getAdminDb();
const plans = await db.collection("agencies/U5SBAHsB0nZ7ce552H9h/plans").get();
for (const p of plans.docs) {
  const d = p.data();
  console.log(
    [
      String(d.name ?? "?").padEnd(10),
      String(d.product ?? "flow").padEnd(8),
      ("$" + (Number(d.priceMonthlyCents ?? 0) / 100).toFixed(0)).padEnd(7),
      ("std=" + (d.standardPriceMonthlyCents ?? "-")).padEnd(12),
      String(d.status ?? "?").padEnd(9),
      "public=" + String(d.publicSelfServeEnabled === true).padEnd(6),
      "trial=" + String(d.trialDays ?? "-").padEnd(4),
      "price=" + String(d.stripePriceId ?? "-"),
      p.id,
    ].join(" "),
  );
}
process.exit(0);
