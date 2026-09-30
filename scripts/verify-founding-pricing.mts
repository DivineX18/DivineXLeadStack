/**
 * FOUNDING PRICING — a discount claim must be recorded, true, and charged.
 *
 * Three things can go wrong with a "was $197, now $127" price, and only one
 * of them is cosmetic:
 *
 *  1. The page shows a saving the plan does not record (invented discount).
 *  2. The page shows a saving that is not a saving (standard <= charged).
 *  3. The page shows $127 and Stripe charges $197 (the expensive one).
 *
 * These checks cover all three against the real helper, the real offer
 * contract, and the real intelligence-service product definition.
 *
 *   NODE_OPTIONS="--conditions=react-server" tsx scripts/verify-founding-pricing.mts
 *
 * Mutation note: weakening `standard <= price` to `standard <` alone does NOT
 * fail this suite, and that is not a coverage hole. Equality yields a 0%
 * saving, which the percentOff guard refuses independently. Removing BOTH
 * guards does fail it. The behaviour is covered twice over; the two lines are
 * deliberate redundancy, not one line the tests forgot.
 */
import { readFileSync } from "node:fs";
import {
  describeFoundingRate,
  parseStandardPriceInput,
} from "../src/lib/billing/founding-rate";
import {
  ASCEND_SOLO_OFFER,
  ASCEND_SOLO_CARD,
} from "../src/lib/intelligence/ascend-solo-checkout";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. No recorded standard rate means no discount is shown");
check("a plan with no standard rate claims nothing",
  describeFoundingRate({ priceMonthlyCents: 12_700 }) === null);
check("an explicit null claims nothing",
  describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: null }) === null);
check("a non-numeric standard rate claims nothing",
  describeFoundingRate({
    priceMonthlyCents: 12_700,
    standardPriceMonthlyCents: "19700" as unknown as number,
  }) === null);
check("NaN claims nothing",
  describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: NaN }) === null);

console.log("\n2. A standard rate that is not a saving is refused");
check("an equal standard rate is not a discount",
  describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: 12_700 }) === null);
check("a lower standard rate is not a discount",
  describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: 9_900 }) === null);
check("a standard rate one cent higher rounds to 0% and is refused",
  describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: 12_701 }) === null);
// The boundary in the other direction: the smallest saving that does round
// to 1% must still be honoured, or the guard is silently eating real ones.
const smallest = describeFoundingRate({ priceMonthlyCents: 9_950, standardPriceMonthlyCents: 10_000 });
check("the smallest saving that rounds to 1% is still shown",
  smallest !== null && smallest.percentOff === 1, String(smallest?.percentOff));

console.log("\n3. A real founding rate reports the right numbers");
const solo = describeFoundingRate({ priceMonthlyCents: 12_700, standardPriceMonthlyCents: 19_700 });
check("Solo's discount is recognised", solo !== null);
check("Solo's saving is $70/mo", solo?.savingMonthlyCents === 7_000, String(solo?.savingMonthlyCents));
check("Solo is 36% off", solo?.percentOff === 36, String(solo?.percentOff));
const team = describeFoundingRate({ priceMonthlyCents: 29_700, standardPriceMonthlyCents: 39_700 });
check("Team is 25% off", team?.percentOff === 25, String(team?.percentOff));
const agency = describeFoundingRate({ priceMonthlyCents: 59_700, standardPriceMonthlyCents: 79_700 });
check("Agency is 25% off", agency?.percentOff === 25, String(agency?.percentOff));

console.log("\n4. Bad input is refused at the write boundary, not just at render");
check("a blank standard rate stores as null", parseStandardPriceInput("", 12_700) === null);
check("undefined stores as null", parseStandardPriceInput(undefined, 12_700) === null);
check("a valid standard rate is stored", parseStandardPriceInput(19_700, 12_700) === 19_700);
for (const [label, value] of [
  ["a standard rate below the price", 9_900],
  ["a standard rate equal to the price", 12_700],
  ["zero", 0],
  ["a negative", -1],
  ["a fractional cent", 19_700.5],
] as [string, number][]) {
  let threw = false;
  try { parseStandardPriceInput(value, 12_700); } catch { threw = true; }
  check(`${label} is refused`, threw);
}
// The refusal has to be readable — an operator sees this sentence.
let msg = "";
try { parseStandardPriceInput(9_900, 12_700); } catch (e) { msg = (e as Error).message; }
check("the refusal says what is wrong in plain words",
  msg.includes("higher than the price") && !msg.includes("undefined"), msg);

console.log("\n5. The advertised Solo price is the price that is charged");
check("the offer contract carries the founding rate",
  ASCEND_SOLO_OFFER.priceMonthlyCents === 12_700, String(ASCEND_SOLO_OFFER.priceMonthlyCents));
check("the offer contract records the standard rate",
  ASCEND_SOLO_OFFER.standardPriceMonthlyCents === 19_700,
  String(ASCEND_SOLO_OFFER.standardPriceMonthlyCents));
check("the card shows exactly what the offer charges",
  ASCEND_SOLO_CARD.priceMonthlyCents === ASCEND_SOLO_OFFER.priceMonthlyCents);
check("the card shows exactly the offer's standard rate",
  ASCEND_SOLO_CARD.standardPriceMonthlyCents === ASCEND_SOLO_OFFER.standardPriceMonthlyCents);

// THE ONE THAT MATTERS. Solo is BILLED by the intelligence service from its
// own product table; this repo only DISPLAYS it. If the two disagree, the
// page advertises one price and the customer's card is charged another.
const biStripe =
  "/Users/boss/DivineX-Business-Intelligence/artifacts/api-server/src/lib/stripe.ts";
let biSrc = "";
try { biSrc = readFileSync(biStripe, "utf8"); } catch { /* absent on this machine */ }
if (biSrc) {
  const charged = /growth_system:\s*\{[\s\S]*?defaultAmount:\s*(\d+)/.exec(biSrc);
  const standard = /GROWTH_SYSTEM_STANDARD_AMOUNT\s*=\s*(\d+)/.exec(biSrc);
  check("the intelligence service's growth_system amount was found", !!charged);
  check("what Ascend charges equals what this repo advertises",
    !!charged && Number(charged[1]) === ASCEND_SOLO_OFFER.priceMonthlyCents,
    `${charged?.[1]} vs ${ASCEND_SOLO_OFFER.priceMonthlyCents}`);
  check("the standard rate agrees across both repos",
    !!standard && Number(standard[1]) === ASCEND_SOLO_OFFER.standardPriceMonthlyCents,
    `${standard?.[1]} vs ${ASCEND_SOLO_OFFER.standardPriceMonthlyCents}`);
  check("the intelligence service states the founding rate in its price range",
    /priceRange:\s*"\$127\/month"/.test(biSrc));
  // growth_system has no env-pinned Stripe Price, which is the only reason
  // defaultAmount is what gets charged. If one is ever declared, the amount
  // above stops being authoritative and this is the alarm. Checked against
  // the deployment manifest, which is where production env is declared —
  // the source file could never contain the assignment either way, so
  // grepping the source here would prove nothing.
  let manifest = "";
  try {
    manifest = readFileSync(
      "/Users/boss/DivineX-Business-Intelligence/render.yaml",
      "utf8",
    );
  } catch { /* absent */ }
  check("the deployment manifest was readable", manifest.length > 0);
  check("the manifest declares other Stripe price keys, so absence means something",
    /STRIPE_PRICE_ASCEND_PRO/.test(manifest));
  check("growth_system still bills from the code amount, not a pinned Price",
    !/STRIPE_PRICE_GROWTH_SYSTEM/.test(manifest));
} else {
  console.log("  skip intelligence-service source not present on this machine");
}

console.log("\n6. The standard rate is never sent to Stripe");
const svc = readFileSync("src/lib/server/billing-service.ts", "utf8");
for (const call of [...svc.matchAll(/stripe\.prices\.create\(\{[\s\S]*?\}\)/g)]) {
  check("a Stripe price is created from the charged amount only",
    !call[0].includes("standardPriceMonthlyCents"), call[0].slice(0, 60));
}
check("at least one Stripe price-create was actually inspected",
  [...svc.matchAll(/stripe\.prices\.create\(/g)].length >= 2);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
