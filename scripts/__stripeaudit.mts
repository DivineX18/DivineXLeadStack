import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";

const key = process.env.STRIPE_SECRET_KEY!;
console.log(`stripe key mode: ${key.startsWith("sk_live") ? "LIVE" : key.startsWith("sk_test") ? "TEST" : "?"}`);
const stripe = new Stripe(key);
const db = getAdminDb();

const plans = await db.collection("agencies/U5SBAHsB0nZ7ce552H9h/plans").get();
for (const p of plans.docs) {
  const d = p.data();
  if (d.status !== "active" || d.product !== "unified") continue;
  console.log(`\n── ${d.name} (${d.product}) $${(d.priceMonthlyCents / 100).toFixed(0)}  plan=${p.id}`);
  console.log(`   stripeProductId: ${d.stripeProductId ?? "(none)"}`);
  console.log(`   stripePriceId  : ${d.stripePriceId ?? "(none)"}`);
  if (d.stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(d.stripePriceId, { expand: ["product"] });
      const prod = price.product as Stripe.Product;
      console.log(`   → live price   : ${price.unit_amount! / 100} ${price.currency.toUpperCase()} / ${price.recurring?.interval} active=${price.active}`);
      console.log(`   → product      : ${prod.id} "${prod.name}"`);
      const all = await stripe.prices.list({ product: prod.id, limit: 20 });
      console.log(`   → prices on it : ${all.data.map((x) => `${x.id}=$${(x.unit_amount ?? 0) / 100}${x.active ? "" : "(inactive)"}`).join(", ")}`);
    } catch (e) { console.log(`   → RETRIEVE FAILED: ${(e as Error).message.slice(0, 90)}`); }
  }
}
process.exit(0);
