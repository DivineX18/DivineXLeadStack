/**
 * W1 — ONE CONFIRMATION, ONE EXECUTION.
 *
 * The confirm route carried no identity for the thing being confirmed, so a
 * retry, a second tab or a replay reached the server as a fresh, legitimate
 * confirmation and ran the action again. These are the cases the roadmap
 * names: duplicate execution, stale confirmation, replayed confirmation,
 * cross-tenant ids, and a claim being reused for a different action.
 *
 * Writes go to a clearly marked scope and are removed. No customer
 * workspace, contact or lead is touched.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-execution-claim.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { claimExecution, settleExecution, releaseExecution, hashArgs, isUsableProposalId, claimScope } =
  await import("../src/lib/ai-suite/execution-claim");
const { getAdminDb } = await import("../src/lib/firebase/admin");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };

// A synthetic scope, so nothing here can collide with a real workspace's
// claims even by accident.
const SCOPE = "sa_ZENO-DEV-W1-TEST";
const OTHER_SCOPE = "sa_ZENO-DEV-W1-OTHER";
const made: string[] = [];
const pid = (n: string) => { const id = `zenodev-${n}-${Date.now()}`; made.push(`aiSuiteExecutions/${SCOPE}__${id}`); made.push(`aiSuiteExecutions/${OTHER_SCOPE}__${id}`); return id; };
const A = hashArgs({ role: "admin" });
const B = hashArgs({ role: "collaborator" });

try {
  console.log("-- a proposal id must be usable as one --");
  ck("a normal id is accepted", isUsableProposalId("toolu_01ABCdef123"));
  ck("a path traversal is refused", !isUsableProposalId("../../../etc/passwd"));
  ck("a slash is refused", !isUsableProposalId("a/b"));
  ck("something too short is refused", !isUsableProposalId("abc"));
  ck("a non-string is refused", !isUsableProposalId(42 as never) && !isUsableProposalId(undefined));
  ck("the scope separates workspace from agency",
    claimScope({ agencyId: "ag1", subAccountId: "sa1" }) === "sa_sa1" && claimScope({ agencyId: "ag1" }) === "ag_ag1");

  console.log("\n-- the same confirmation does not run twice --");
  {
    const id = pid("dup");
    const first = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: A });
    ck("the first confirmation claims it", first.outcome === "claimed");
    const second = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: A });
    ck("a second, while the first is running, does not execute", second.outcome === "in_flight");
    await settleExecution({ scope: SCOPE, proposalId: id, response: { ok: true, resultText: "done once" } });
    const replay = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: A });
    ck("a replay after completion is served the original answer",
      replay.outcome === "replayed" && (replay.response as { resultText?: string }).resultText === "done once");
  }

  console.log("\n-- concurrency: two confirmations landing together --");
  {
    const id = pid("race");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "create_contact", argsHash: A })),
    );
    const claimed = results.filter((r) => r.outcome === "claimed").length;
    ck("exactly one of five concurrent confirmations wins", claimed === 1, `claimed=${claimed}`);
    ck("the rest do not execute", results.filter((r) => r.outcome === "in_flight").length === 4);
  }

  console.log("\n-- a claim is bound, not a shared key --");
  {
    const id = pid("bound");
    await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: A });
    await settleExecution({ scope: SCOPE, proposalId: id, response: { ok: true, resultText: "u1's result" } });

    const byOther = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u2", capability: "update_member_role", argsHash: A });
    ck("another user replaying it is refused, not served the answer",
      byOther.outcome === "mismatch" && byOther.reason === "caller");

    const otherCap = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "delete_contact", argsHash: A });
    ck("the same id for a different capability is refused",
      otherCap.outcome === "mismatch" && otherCap.reason === "capability");

    // The dangerous one: a used token carrying different arguments is a
    // different action, not a retry.
    const otherArgs = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: B });
    ck("the same id with different arguments is refused",
      otherArgs.outcome === "mismatch" && otherArgs.reason === "arguments");

    // Cross-tenant: the same proposal id in another workspace is a
    // different claim entirely and must not read the first one's result.
    const crossTenant = await claimExecution({ scope: OTHER_SCOPE, proposalId: id, uid: "u1", capability: "update_member_role", argsHash: A });
    ck("the same id in another workspace is a fresh claim, not a replay",
      crossTenant.outcome === "claimed");
  }

  console.log("\n-- a failed action stays retryable --");
  {
    const id = pid("retry");
    await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "create_contact", argsHash: A });
    await releaseExecution({ scope: SCOPE, proposalId: id });
    const again = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "create_contact", argsHash: A });
    ck("the customer can confirm it again after a failure", again.outcome === "claimed");
    // But a failed-then-succeeded action still cannot run twice.
    await settleExecution({ scope: SCOPE, proposalId: id, response: { ok: true, resultText: "eventually" } });
    const after = await claimExecution({ scope: SCOPE, proposalId: id, uid: "u1", capability: "create_contact", argsHash: A });
    ck("and once it succeeds, a further replay is served the answer", after.outcome === "replayed");
  }

  console.log("\n-- the route wires it around the commit boundary --");
  {
    const route = readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8");
    ck("the claim is taken BEFORE execute",
      route.indexOf("claimExecution(") < route.indexOf("result = await cap.execute"));
    ck("a replay returns without executing",
      /claim\.outcome === "replayed"[\s\S]{0,200}return NextResponse\.json\(claim\.response\)/.test(route));
    ck("an in-flight duplicate is refused with 409", /in_flight"[\s\S]{0,200}status: 409/.test(route));
    ck("a mismatched replay is refused with 409", /mismatch"[\s\S]{0,300}status: 409/.test(route));
    ck("a failure releases the claim so a retry works",
      route.indexOf("releaseExecution(") > route.indexOf("} catch (err) {"));
    ck("the settled answer is the exact body that was returned",
      /settleExecution\(\{ scope, proposalId, response: responseBody \}\)/.test(route));
    ck("settle happens after the receipt is minted",
      route.indexOf("mintReceipt(") < route.indexOf("settleExecution("));
    ck("the browser sends the proposal id it already has",
      /proposalId: msg\.id/.test(readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8")));
  }
} finally {
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const left = await db.collection("aiSuiteExecutions").get();
  const strays = left.docs.filter((d) => d.id.includes("ZENO-DEV")).length;
  console.log(`\ncleaned up; ZENO-DEV claims remaining: ${strays}`);
  if (strays > 0) fails++;
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
