// Regression coverage for the unauthenticated upsell-charge guard (2026-09-26).
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-upsell-eligibility.mts
import { readFileSync } from "node:fs";
const { evaluateUpsellEligibility } = await import("../src/lib/funnels/upsell-eligibility");
let failures = 0;
const check = (l: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures++; };
const order = (status: string, upsells: { funnelId: string; status: string; amountCents: number }[] = []) => ({ status, upsells }) as never;

check("paid order, no upsell yet -> eligible", evaluateUpsellEligibility(order("paid"), "up1").ok);
check("refunded order -> blocked", (evaluateUpsellEligibility(order("refunded"), "up1") as { code?: string }).code === "order-not-paid");
check("partially refunded order -> blocked", (evaluateUpsellEligibility(order("partially_refunded"), "up1") as { code?: string }).code === "order-not-paid");
check("disputed order -> blocked", (evaluateUpsellEligibility(order("disputed"), "up1") as { code?: string }).code === "order-not-paid");
check("upsell already accepted on this order -> never charged again", (evaluateUpsellEligibility(order("paid", [{ funnelId: "up1", status: "accepted", amountCents: 1000 }]), "up1") as { code?: string }).code === "already-accepted");
check("accepted a DIFFERENT upsell -> this one is still eligible", evaluateUpsellEligibility(order("paid", [{ funnelId: "up0", status: "accepted", amountCents: 1000 }]), "up1").ok);
check("previous attempt failed/declined -> customer may retry", evaluateUpsellEligibility(order("paid", [{ funnelId: "up1", status: "failed_requires_action", amountCents: 1000 }]), "up1").ok);
check("missing upsells array handled", evaluateUpsellEligibility({ status: "paid" } as never, "up1").ok);
const route = readFileSync("src/app/api/lp/[funnelId]/upsell/[sectionId]/charge/route.ts", "utf8");
check("route runs the guard before creating any PaymentIntent", route.indexOf("evaluateUpsellEligibility(order") > 0 && route.indexOf("evaluateUpsellEligibility(order") < route.indexOf("paymentIntents.create"));
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
