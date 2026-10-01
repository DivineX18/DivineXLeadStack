/**
 * ZENO MUST KNOW WHOSE BUSINESS IT IS, ON EVERY TURN.
 *
 * The canonical Business/Brand profile injection was nested inside the
 * `create_funnel` branch of the chat route. Zeno therefore knew the business
 * only when that single tool happened to be in scope. Everywhere else, at
 * agency level, for a member who is not an admin, on any surface with a
 * narrower tool set, the profile was never added and Zeno asked the customer
 * what they sell and who they sell to, with the answers sitting unread in
 * canonical context.
 *
 * Observed live: with a ceramics-studio profile planted and all three
 * sentinels confirmed present, Zeno replied "let me ground this in your
 * actual situation rather than guess... What does DivineX actually sell, and
 * to whom?" That is the product's core promise failing in the first exchange
 * of a demo.
 *
 * These checks hold the structural property that caused it: the profile is
 * gathered before, and independently of, any tool-dependent branch.
 */
import { readFileSync } from "node:fs";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const src = readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
const lines = src.split("\n");
const lineOf = (needle: string) => lines.findIndex((l) => l.includes(needle));

const profileAt = lineOf("getAuthorizedProfileSnapshotOrNull");
const branchAt = lines.findIndex(
  (l) => l.includes("actionNames.some") && l.includes('"create_funnel"'),
);

console.log("\n1. The profile is read, and read before any tool branch");
check("the route reads the authorized profile snapshot", profileAt >= 0);
check("the create_funnel branch still exists, so this test is not vacuous", branchAt >= 0);
check("the profile is read BEFORE the create_funnel branch",
  profileAt >= 0 && branchAt >= 0 && profileAt < branchAt, `profile@${profileAt + 1} branch@${branchAt + 1}`);

console.log("\n2. It is not inside that branch, by brace depth");
// Depth-count from the branch opening: if the profile read falls inside it,
// the line-order check above could still pass after a careless move.
let depth = 0, insideFrom = -1, insideTo = -1;
for (let i = branchAt; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
  if (i > branchAt && depth <= 0) { insideFrom = branchAt; insideTo = i; break; }
}
check("the branch's extent was measured", insideFrom >= 0 && insideTo > insideFrom,
  `${insideFrom + 1}..${insideTo + 1}`);
check("the profile read is outside the branch extent",
  !(profileAt > insideFrom && profileAt < insideTo), `profile@${profileAt + 1} in ${insideFrom + 1}..${insideTo + 1}`);

console.log("\n3. The card still carries what it is for");
const profileBlock = src.slice(src.indexOf("getAuthorizedProfileSnapshotOrNull"), src.indexOf("getAuthorizedProfileSnapshotOrNull") + 4200);
for (const field of ["business.name", "business.audience", "business.offer"]) {
  check(`the card carries ${field}`, profileBlock.includes(field));
}
check("the card tells the model not to re-ask any of it",
  /never ask the customer for anything above/i.test(profileBlock));
check("the card is pushed unconditionally, not keyword-retrieved",
  /cards\.push\(\{[\s\S]{0,200}divinex-business-profile/.test(profileBlock));

console.log("\n4. A missing profile stays silent rather than inventing one");
check("the read is best-effort and swallows failure",
  /catch\s*\{[\s\S]{0,160}Zeno works without the profile/.test(profileBlock));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
