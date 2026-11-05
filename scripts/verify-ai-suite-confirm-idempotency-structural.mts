/**
 * Flow AI Suite idempotency repair -- the subset of coverage that needs no
 * Firestore emulator (this environment has no Java runtime available,
 * documented in verify-ai-suite-confirm-idempotency.mts, which covers the
 * actual transactional claim/concurrent/cross-tenant behavior and needs
 * one). This script proves two things that don't touch Firestore at all:
 *
 *   1. fingerprintArgs() is a real, deterministic, collision-sensitive
 *      hash -- the fingerprint-mismatch guard is only as good as this.
 *   2. The route and the chat UI are actually WIRED to use the guard --
 *      confirmationId is required server-side, the client sends the
 *      proposal's own id (not a client-generated one), and the route calls
 *      claim before execute and settle/release around it in the right
 *      order. A correct confirm-idempotency.ts that nothing calls would
 *      pass every unit test and fix nothing.
 */
import { readFileSync } from "node:fs";

let failures = 0;
function fail(label: string, detail: string) {
  failures++;
  console.log(`  FAIL  [${label}] ${detail}`);
}
function ok(label: string) {
  console.log(`  OK  ${label}`);
}

// ── 1. fingerprintArgs: pure, deterministic, sensitive to real changes ────
{
  const { fingerprintArgs } = await import("../src/lib/ai-suite/confirm-idempotency");
  const a = fingerprintArgs({ to: "x@example.com", body: "hello" });
  const aAgain = fingerprintArgs({ to: "x@example.com", body: "hello" });
  const b = fingerprintArgs({ to: "x@example.com", body: "hello!" });
  if (a !== aAgain) fail("determinism", "the same args produced two different fingerprints");
  else ok("fingerprintArgs is deterministic for identical args");
  if (a === b) fail("sensitivity", "two different arg payloads produced the SAME fingerprint");
  else ok("fingerprintArgs changes when the args change");
  if (typeof a !== "string" || a.length < 32) fail("shape", `fingerprint looks malformed: "${a}"`);
  else ok("fingerprintArgs returns a real hash, not a trivial/empty value");
}

// ── 2. Structural: the route actually requires confirmationId ────────────
{
  const src = readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8");
  if (!/confirmationId/.test(src)) {
    fail("route-wiring", "route.ts never references confirmationId at all");
  } else if (!/if \(!confirmationId/.test(src)) {
    fail("route-wiring", "route.ts reads confirmationId but doesn't appear to validate its presence");
  } else {
    ok("the route rejects a confirm request with no confirmationId");
  }

  if (!/claimConfirmation\(/.test(src)) {
    fail("route-wiring", "route.ts never calls claimConfirmation -- the guard isn't actually wired in");
  } else {
    ok("the route calls claimConfirmation");
  }

  // Ordering: the claim must happen BEFORE cap.execute(, and settle/release
  // must happen around it, not before it ever runs.
  const claimIdx = src.indexOf("claimConfirmation(");
  const executeIdx = src.indexOf("cap.execute(");
  const settleIdx = src.indexOf("settleConfirmationSucceeded(");
  const releaseIdx = src.indexOf("releaseConfirmationFailed(");
  if (claimIdx < 0 || executeIdx < 0 || claimIdx > executeIdx) {
    fail("route-ordering", `claimConfirmation must run before cap.execute() -- claimIdx=${claimIdx} executeIdx=${executeIdx}`);
  } else {
    ok("claimConfirmation runs before cap.execute() -- a duplicate is caught before any mutation");
  }
  if (settleIdx < executeIdx) {
    fail("route-ordering", "settleConfirmationSucceeded appears before cap.execute() -- it would cache a result that hasn't happened yet");
  } else {
    ok("settleConfirmationSucceeded runs after cap.execute() succeeds");
  }
  if (releaseIdx < executeIdx) {
    fail("route-ordering", "releaseConfirmationFailed appears before cap.execute() -- nonsensical ordering");
  } else {
    ok("releaseConfirmationFailed runs in the catch block, after cap.execute() throws");
  }
}

// ── 3. Structural: the identity key includes uid + workspace + capability,
//    not just args -- otherwise two independent proposals with identical
//    args would collide ──────────────────────────────────────────────────
{
  const src = readFileSync("src/lib/ai-suite/confirm-idempotency.ts", "utf8");
  const keyForMatch = src.match(/function keyFor\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!keyForMatch) {
    fail("key-shape", "couldn't locate keyFor() to inspect what it hashes");
  } else {
    const body = keyForMatch[1];
    const mustContain = ["identity.uid", "identity.agencyId", "identity.subAccountId", "identity.capability", "confirmationId"];
    const missing = mustContain.filter((t) => !body.includes(t));
    if (missing.length > 0) {
      fail("key-shape", `keyFor() is missing dimension(s): ${missing.join(", ")} -- a cross-tenant or cross-capability collision becomes possible`);
    } else {
      ok("the idempotency key is scoped to uid + agencyId + subAccountId + capability + confirmationId");
    }
  }
}

// ── 4. Structural: the client sends the PROPOSAL's own id, not a freshly
//    client-generated one (a client-minted id would let a page reload or
//    a second tab generate a NEW id for the same underlying proposal and
//    silently defeat the whole guard) ─────────────────────────────────────
{
  const src = readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8");
  const confirmCallMatch = src.match(/fetch\("\/api\/ai-suite\/confirm"[\s\S]*?\}\),\s*\}\);/);
  if (!confirmCallMatch) {
    fail("client-wiring", "couldn't locate the confirm fetch call body to inspect");
  } else if (!/confirmationId:\s*msg\.id/.test(confirmCallMatch[0])) {
    fail("client-wiring", `the confirm request doesn't send confirmationId: msg.id -- got: ${confirmCallMatch[0].slice(0, 200)}`);
  } else {
    ok("the client sends the proposal's own id (msg.id) as confirmationId, not a locally-generated one");
  }
}

// ── 5. Structural: the proposal's id traces back to the model's own
//    tool-call id server-side (chat route), not something the client
//    invents -- this is what makes it safe to trust as identity ──────────
{
  const src = readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
  if (!/id:\s*turn\.toolCall\.id/.test(src)) {
    fail("id-provenance", "the chat route no longer mints the proposal id from turn.toolCall.id -- confirm-idempotency.ts's identity assumptions may no longer hold");
  } else {
    ok("the proposal id the client echoes back is minted server-side from the model's own tool-call id");
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
