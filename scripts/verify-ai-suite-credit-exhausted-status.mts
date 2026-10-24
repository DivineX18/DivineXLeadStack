/**
 * BUG-002 production certification (2026-10-24) surfaced a real gap: a live
 * OpenRouter 402 (deployment out of credit) and a genuine network outage
 * both landed on the exact same generic 502 "The assistant couldn't reach
 * the model. Please try again." — model.ts already labels the credit case
 * by name in the error it throws ("OpenRouter credit exhausted: ..."), but
 * the chat route's catch discarded that distinction before it ever reached
 * an HTTP response. "Try again" is actively wrong advice for a billing
 * problem: no amount of retrying buys credit.
 *
 * Structural, source-level — same class as every other verify-*.mts here
 * (a live local HTTP server can't impersonate a real OpenRouter 402 without
 * re-running this repo's whole Next.js route machinery, which model.ts's
 * own retry test above already exercises for the transport layer; this
 * checks the route's catch branch that THIS fix touches).
 *
 * Run: npx tsx scripts/verify-ai-suite-credit-exhausted-status.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const route = readFileSync(new URL("../src/app/api/ai-suite/chat/route.ts", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/lib/ai-suite/model.ts", import.meta.url), "utf8");

check(
  "1. model.ts labels a 402 by name in the thrown error (the string the route branch below keys off of)",
  /OpenRouter credit exhausted/.test(model),
);

const catchBlock = route.slice(route.indexOf("if (err instanceof ModelUnreachableError)"), route.indexOf("// Our own fault, not the model's"));
check("2. the ModelUnreachableError catch branch checks for that exact label", /err\.message\.includes\("credit exhausted"\)/.test(catchBlock));
check(
  "3. a credit-exhausted failure gets a DISTINCT status from a genuine model-unreachable failure (503, not the generic 502)",
  /status: isCreditExhausted \? 503 : 502/.test(catchBlock),
);
check(
  "4. the customer-facing message for credit exhaustion does NOT say 'try again' (retrying can never fix a billing problem)",
  (() => {
    const msgMatch = catchBlock.match(/isCreditExhausted\s*\?\s*"([^"]+)"/);
    return !!msgMatch && !/try again/i.test(msgMatch[1]);
  })(),
);
check(
  "5. a genuine (non-credit) model-unreachable failure keeps its original 502 + message, unaffected by this branch",
  /: "The assistant couldn't reach the model\. Please try again\."/.test(catchBlock) && /status: isCreditExhausted \? 503 : 502/.test(catchBlock),
);
check(
  "6. MUTATION: the discriminator reads the actual caught error's message, not some other re-derived string",
  /const isCreditExhausted = err\.message\.includes/.test(catchBlock),
);

console.log(
  failures === 0
    ? `\nverify-ai-suite-credit-exhausted-status: all checks passed`
    : `\nverify-ai-suite-credit-exhausted-status: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
