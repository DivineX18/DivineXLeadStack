/**
 * W1 — THE EXECUTION RESULT CONTRACT.
 *
 * The invariant worth testing is not the shape of an object. It is that a
 * capability cannot say an action succeeded. It returns a descriptor of
 * WHAT it did, carrying no status field, and the receipt that says
 * "committed" is minted in one place, after execute() has returned. A model
 * that wants to claim success has nothing to write it into.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-execution-contract.mts
 */
import fs from "node:fs";
import {
  normalizeMutation, mintReceipt, refFromMutation, assertNoMutationOnLookup,
  RESOURCE_KINDS, MUTATION_OPERATIONS,
} from "../src/lib/ai-suite/execution-result";
import { AI_SUITE_CAPABILITIES } from "../src/lib/ai-suite/capabilities";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const confirm = fs.readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8");
const chat = fs.readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
const caps = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
const audit = fs.readFileSync("src/lib/ai-suite/audit.ts", "utf8");
const contract = fs.readFileSync("src/lib/ai-suite/execution-result.ts", "utf8");

const GOOD = { resourceType: "booking_page", resourceId: "intro-call", operation: "updated" } as const;

console.log("-- a capability cannot declare success --");
{
  // The type has no status field; this is the runtime half of that.
  ck("a descriptor carrying its own status does not gain one",
    !("status" in (normalizeMutation({ ...GOOD, status: "committed" }) ?? {})));
  ck("nor does a forged receipt survive normalization",
    !("auditId" in (normalizeMutation({ ...GOOD, auditId: "forged", capability: "x" }) ?? {})));
  ck("only the contract module can mint a receipt",
    /export function mintReceipt/.test(contract));
  ck("the confirm route is the only caller",
    (confirm.match(/mintReceipt\(/g) ?? []).length === 1);
  ck("and it mints AFTER execute returned, past the commit boundary",
    confirm.indexOf("result = await cap.execute") < confirm.indexOf("mintReceipt("));
  // A FAILED execute must not reach the mint. Proven structurally: every
  // exit from the catch is a return, so control cannot fall through to the
  // receipt. A source-order check alone would survive deleting one return.
  {
    const open = confirm.indexOf("} catch (err) {", confirm.indexOf("result = await cap.execute"));
    const close = confirm.indexOf("\n  }", open);
    const body = confirm.slice(open, close);
    // The precise invariant: the catch ENDS in an unconditional return, so
    // no path through it continues on to the mint. Counting returns against
    // branches was the wrong check, because the claim release is an `if`
    // that correctly has no return.
    const tail = body.trimEnd().split("\n").slice(-6).join("\n");
    ck("the failure path ends in an unconditional return, so nothing reaches the mint",
      /\n    \);\s*$/.test(tail) && /return NextResponse\.json\(/.test(tail),
      tail.split("\n").slice(-3).join(" | "));
    ck("and the mint is outside that catch entirely", confirm.indexOf("mintReceipt(") > close);
    ck("a failed action records status failed, not executed", /status: "failed"/.test(body));
  }
  const r = mintReceipt({ capability: "update_booking_page", mutation: GOOD, auditId: "a1" });
  ck("a minted receipt says committed", r.status === "committed");
  ck("and names the capability and the audit row", r.capability === "update_booking_page" && r.auditId === "a1");
  ck("an unwritable audit row is stated, not invented",
    mintReceipt({ capability: "x", mutation: GOOD, auditId: null }).auditId === null);
}

console.log("\n-- a malformed descriptor is dropped, never repaired --");
{
  ck("an invented resource kind is rejected",
    normalizeMutation({ ...GOOD, resourceType: "spaceship" }) === null);
  ck("an invented operation is rejected",
    normalizeMutation({ ...GOOD, operation: "obliterated" }) === null);
  ck("a missing id is rejected", normalizeMutation({ ...GOOD, resourceId: "" }) === null);
  ck("a whitespace id is rejected", normalizeMutation({ ...GOOD, resourceId: "   " }) === null);
  ck("a non-object is rejected", normalizeMutation("booking_page") === null && normalizeMutation(null) === null);
  // Dropping beats guessing: a receipt naming the wrong record refreshes
  // something the customer did not change and audits a resource never touched.
  ck("nothing is inferred from a near-miss", normalizeMutation({ resourceType: "booking_pages", resourceId: "x", operation: "updated" }) === null);
  ck("every declared kind is accepted",
    RESOURCE_KINDS.every((k) => normalizeMutation({ ...GOOD, resourceType: k }) !== null));
  ck("every declared operation is accepted",
    MUTATION_OPERATIONS.every((o) => normalizeMutation({ ...GOOD, operation: o }) !== null));
}

console.log("\n-- nothing sensitive travels --");
{
  const m = normalizeMutation({ ...GOOD, changedFields: ["name", "hours"], before: { name: "Old" }, after: { name: "New" } })!;
  ck("before/after values are not carried", !("before" in m) && !("after" in m));
  ck("field names are", JSON.stringify(m.changedFields) === '["name","hours"]');
  ck("duplicates collapse",
    JSON.stringify(normalizeMutation({ ...GOOD, changedFields: ["a", "a", "b"] })!.changedFields) === '["a","b"]');
  ck("non-strings are discarded",
    JSON.stringify(normalizeMutation({ ...GOOD, changedFields: ["a", 7, null] })!.changedFields) === '["a"]');
  ck("an unbounded list is capped",
    (normalizeMutation({ ...GOOD, changedFields: Array.from({ length: 200 }, (_, i) => `f${i}`) })!.changedFields ?? []).length === 32);
  ck("a long summary is truncated",
    (normalizeMutation({ ...GOOD, summary: "x".repeat(900) })!.summary ?? "").length === 300);
}

console.log("\n-- href is a destination, not a link the model chose --");
{
  ck("a relative path is kept", normalizeMutation({ ...GOOD, href: "/sa/x/booking/intro" })!.href === "/sa/x/booking/intro");
  ck("an absolute URL is dropped", normalizeMutation({ ...GOOD, href: "https://evil.test/steal" })!.href === undefined);
  ck("a protocol-relative URL is dropped", normalizeMutation({ ...GOOD, href: "//evil.test" })!.href === undefined);
  ck("javascript: is dropped", normalizeMutation({ ...GOOD, href: "javascript:alert(1)" })!.href === undefined);
}

console.log("\n-- the audit row and the answer cannot disagree --");
{
  ck("both are built from one normalized value",
    /const mutation = normalizeMutation\(result\.mutation\)/.test(confirm));
  ck("the audit row receives that value", /mutation,\n  \}\)\.catch/.test(confirm) || /resultRef,\n    mutation,/.test(confirm));
  ck("the receipt receives the same value", /mintReceipt\(\{ capability: cap\.name, mutation, auditId \}\)/.test(confirm));
  ck("the legacy ref is derived from it when absent",
    /result\.ref \?\? \(mutation \? refFromMutation\(mutation\) : null\)/.test(confirm));
  ck("derivation cannot name a different record",
    (() => { const r = refFromMutation(GOOD); return r.kind === GOOD.resourceType && r.id === GOOD.resourceId; })());
  ck("the audit writer stores the descriptor", /mutation: entry\.mutation \?\? null/.test(audit));
  ck("and returns the id the receipt points at", /return written\.id/.test(audit));
  ck("an audit failure returns null rather than throwing", /return null;\s*\n\s*\}\s*\n\}/.test(audit));
}

console.log("\n-- an unconfirmed read cannot report a change --");
{
  ck("the chat route guards lookups", /assertNoMutationOnLookup\(cap\.name, cap\.readonly, execResult\.mutation\)/.test(chat));
  let threw = false;
  try { assertNoMutationOnLookup("list_members", true, GOOD); } catch { threw = true; }
  ck("a readonly capability returning a descriptor throws", threw);
  let ok = true;
  try { assertNoMutationOnLookup("list_members", true, undefined); assertNoMutationOnLookup("update_x", false, GOOD); } catch { ok = false; }
  ck("a clean lookup and a real write both pass", ok);
  // It must sit between the lookup's try and that try's catch, so a
  // violation is handled as a failed lookup rather than taking the turn down.
  {
    const g = chat.indexOf("assertNoMutationOnLookup(cap.name");
    const open = chat.lastIndexOf("try {", g);
    const close = chat.indexOf("} catch (err) {", g);
    ck("the guard sits inside the lookup try, so it reports a failed lookup",
      g > open && open !== -1 && close > g);
    ck("that catch turns it into a lookup failure, not a dead turn",
      /The lookup failed\./.test(chat.slice(close, close + 600)));
  }
}

console.log("\n-- migrated capabilities --");
{
  const migrated = [...caps.matchAll(/mutation: \{\s*\n\s*resourceType: "([a-z_]+)"/g)].map((m) => m[1]);
  ck(`${migrated.length} capabilities now describe what they changed`, migrated.length >= 9, migrated.join(", "));
  ck("every one names a declared kind",
    migrated.every((k) => (RESOURCE_KINDS as readonly string[]).includes(k)), migrated.filter((k) => !(RESOURCE_KINDS as readonly string[]).includes(k)).join(","));
  // No readonly capability may carry one, checked against the registry.
  const lookupsWithMutation = AI_SUITE_CAPABILITIES.filter((c) => c.readonly)
    .filter((c) => new RegExp(`name: "${c.name}"[\\s\\S]{0,4000}?mutation: \\{`).test(caps)
      && !new RegExp(`name: "${c.name}"[\\s\\S]{0,4000}?\\n  \\},`).test(caps.slice(0, 0)));
  ck("no readonly lookup declares a mutation", lookupsWithMutation.length === 0, lookupsWithMutation.map((c) => c.name).join(","));
  // Back-compat: the UI still routes on resultRef.
  ck("resultRef is still returned for existing callers", /resultRef,\n/.test(confirm));
  ck("the receipt is additive, absent when a capability has not migrated",
    /\.\.\.\(receipt \? \{ receipt \} : \{\}\)/.test(confirm));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
