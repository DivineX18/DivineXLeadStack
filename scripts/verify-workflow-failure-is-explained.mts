/**
 * A FAILED WORKFLOW RUN MUST SAY WHY.
 *
 * Observed in the beta journey: a real lead submitted, the contact was
 * created, the page said thank you, and the run went to `status: "failed"`
 * with `history: []`, no error and no failed node. The promised opportunity
 * and follow-up never arrived and nothing anywhere said why. The customer
 * saw success; the operator saw a dead run with no sentence to act on.
 *
 * The cause was scheduling: QStash refused a localhost callback URL. That
 * part is environmental. Recording nothing about it was not.
 */
import { readFileSync } from "node:fs";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const src = readFileSync("src/lib/workflows/engine.ts", "utf8");

// Every place that writes status failed must also write a reason.
// Only real update() writes, not prose in a doc comment that happens to
// quote the literal.
// Each failed-write runs from `status: "failed"` to its own `updatedAt`.
// A lazy match to the first "})" stopped inside the `(${nodeId})` in the
// error template and reported a complete write as missing its fields.
const failWrites = [...src.matchAll(/status:\s*"failed",[\s\S]*?updatedAt:/g)]
  .map((m) => m[0])
  .filter((w) => w.length < 700);
console.log(`\n1. Every "failed" write carries a reason (${failWrites.length} found)`);
check("there are failed-status writes to inspect", failWrites.length >= 2, String(failWrites.length));
for (const [i, w] of failWrites.entries()) {
  check(`failed-write ${i + 1} records an error sentence`, /error:\s*[`"]/.test(w) || /error:\s*\w/.test(w),
    w.replace(/\s+/g, " ").slice(0, 80));
}

console.log("\n2. The reason is actionable, not a code");
check("the scheduling failure names the likely cause",
  /NEXT_PUBLIC_APP_URL is not a publicly reachable address/.test(src));
check("the unconfigured-queue failure names the fix",
  /Set the QSTASH_\* environment variables/.test(src));
// Per-write, not file-wide: a file-wide check passes while one of several
// failure paths quietly loses the field.
for (const [i, w] of failWrites.entries()) {
  check(`failed-write ${i + 1} records WHERE it stopped`, /failedNodeId:/.test(w),
    w.replace(/\s+/g, " ").slice(0, 70));
}

console.log("\n3. The work already done is not discarded");
// history is what proves the deal/tag that DID run actually happened.
check("history is never cleared on failure", !/status:\s*"failed"[\s\S]{0,300}history:\s*\[\]/.test(src));

console.log("\n4. Success is still success");
// Scoped to completeRun's own body. A fixed-width window spilled into the
// next function, which now legitimately writes errors, and reported a
// correct function as broken.
{
  const i = src.indexOf("async function completeRun(");
  const body = src.slice(i, src.indexOf("\n}", i));
  check("completeRun's body was located", i > 0 && body.includes('status: "completed"'));
  check("completeRun does not write an error", !/error:/.test(body));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
