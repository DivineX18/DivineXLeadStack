/**
 * ASCEND SMS IS BRING-YOUR-OWN TWILIO.
 *
 * A workspace with no `twilioConfig` falls back to the deployment's shared
 * Twilio credentials, which is DivineX's carrier bill. Ascend does not sell
 * that capacity, so its ceiling is zero and the shared sender is closed.
 *
 * The trap this pins: an ABSENT or NULL ceiling reads as UNLIMITED, so
 * "removing the allowance" is the one change that would hand out unlimited
 * DivineX-paid SMS. Zero is the only shape that means none.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const { checkPlanLimit, limitMessage, NO_LIMITS, resolvePlanLimits } = await import("@/lib/billing/plan-limits");
const { ASCEND_SOLO_WORKSPACE_LIMITS } = await import("@/lib/intelligence/ascend-solo-checkout");

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};
const sms = async (limits: unknown) =>
  checkPlanLimit({ subAccountId: null, kind: "sharedSms", amount: 1, limits: limits as never });

console.log("\n1. Ascend sells no shared SMS");
check("the ceiling is exactly zero", ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth === 0,
  String(ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth));
check("it is a number, not absent or null",
  typeof ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth === "number");
check("so a shared send is refused", !(await sms(ASCEND_SOLO_WORKSPACE_LIMITS)).allowed);

console.log("\n2. The shapes that would silently reopen it");
const { maxSharedSmsPerMonth: _gone, ...removed } = ASCEND_SOLO_WORKSPACE_LIMITS as Record<string, unknown>;
void _gone;
check("removing the field would allow it (why the field stays)", (await sms(removed)).allowed);
check("nulling the field would allow it", (await sms({ ...ASCEND_SOLO_WORKSPACE_LIMITS, maxSharedSmsPerMonth: null })).allowed);
check("and zero is the only shape that refuses", !(await sms({ ...ASCEND_SOLO_WORKSPACE_LIMITS, maxSharedSmsPerMonth: 0 })).allowed);

console.log("\n3. What the customer is told");
const msg = limitMessage("sharedSms" as never, 0, 0);
check("they are told to connect Twilio, not to upgrade", /connect your twilio/i.test(msg) && !/upgrade/i.test(msg), msg);
check("and where to do it", /Settings/i.test(msg), msg);
check("texting is not described as unavailable", !/aren't included/i.test(msg), msg);
const exhausted = limitMessage("sharedSms" as never, 500, 500);
check("a plan that DOES include shared SMS still reads as exhausted",
  /used all 500/.test(exhausted) && /resets on the 1st/i.test(exhausted), exhausted);

console.log("\n4. The send path refuses before Twilio is touched");
const twilioSrc = readFileSync("src/lib/comms/twilio.ts", "utf8");
check("the allowance is checked only for shared sends", /if \(resolved\.mode === "shared"\)/.test(twilioSrc));
check("the check happens before messages.create", 
  twilioSrc.indexOf('kind: "sharedSms"') < twilioSrc.indexOf("resolved.client.messages.create"));
check("a zero ceiling produces the connect-Twilio refusal",
  /allowance\.limit === 0[\s\S]{0,120}Connect your Twilio account/.test(twilioSrc));
check("a dedicated workspace never consumes the allowance",
  /mode === "dedicated"/.test(twilioSrc) || /A workspace on its own `twilioConfig` pays its own carrier bill/.test(twilioSrc));

console.log("\n5. Every real SMS path goes through that boundary");
// The bare sendSms() helper talks to env Twilio directly, so it must stay
// uncalled; anything adopting it would bypass the ceiling entirely.
const callers = ["src/app/api/comms/sms/send/route.ts", "src/lib/comms/missed-call.ts",
  "src/lib/comms/ai/respond.ts", "src/lib/workflows/engine.ts", "src/lib/reviews/request.ts"];
for (const f of callers) {
  const src = readFileSync(f, "utf8");
  check(`${f.split("/").pop()} sends through sendSmsForSubAccount`, /sendSmsForSubAccount/.test(src));
}
// The bare sendSms() helper talks to env Twilio directly and has no callers.
// If one ever appears it bypasses the ceiling entirely, so that is pinned.
const srcFiles = execSync("grep -rln 'sendSms(' src/ --include=*.ts --include=*.tsx || true")
  .toString().trim().split("\n").filter(Boolean);
const bareCallers = srcFiles.filter((f) => {
  const src = readFileSync(f, "utf8");
  return /(?<!sendSmsForSubAccount)\bsendSms\(/.test(src.replace(/export async function sendSms\(/g, ""))
    && !/lib\/comms\/twilio\.ts$/.test(f);
});
check("nothing calls the unmetered env-Twilio helper", bareCallers.length === 0, bareCallers.join(","));

console.log("\n6. Other products are untouched");
check("a comped/legacy workspace keeps unlimited shared SMS", (await sms(NO_LIMITS)).allowed);
check("a plan with a real allowance still sends under it",
  (await sms({ ...NO_LIMITS, maxSharedSmsPerMonth: 500 })).allowed);
check("the Ascend branch only fires for Ascend-provisioned workspaces",
  JSON.stringify(await resolvePlanLimits(null, { agencyId: "a" } as never)) === JSON.stringify(NO_LIMITS));
check("Ascend's other ceilings are unchanged",
  ASCEND_SOLO_WORKSPACE_LIMITS.maxAiSpendPerMonth === 15 &&
  ASCEND_SOLO_WORKSPACE_LIMITS.maxVoiceMinutesPerMonth === 200 &&
  ASCEND_SOLO_WORKSPACE_LIMITS.maxEmailsPerMonth === 25000 &&
  ASCEND_SOLO_WORKSPACE_LIMITS.maxGrowthScansPerMonth === 15);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
console.log(failures.length ? "ASCEND BYO TWILIO: FAILED" : "ASCEND BYO TWILIO: ALL PASS");
process.exit(failures.length ? 1 : 0);
