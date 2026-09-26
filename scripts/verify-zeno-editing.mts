/**
 * Zeno editing what already exists, rather than only creating more of it.
 *
 * Three things had to be true before an edit was safe to offer:
 *
 *  1. It must be able to FIND the thing. apply_workflow_plan always accepted
 *     a workflow_id, but nothing let Zeno discover one, so "edit my welcome
 *     sequence" could not resolve from a fresh chat.
 *  2. The lookup must carry the CONTENT. apply_workflow_plan replaces the
 *     whole sequence, so a lookup returning names and ids would have made
 *     "shorten email 2" delete emails 1 and 3.
 *  3. Editing something that is SENDING is a different act from editing a
 *     draft, and must not happen because a sentence was ambiguous.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-zeno-editing.mts
 */
import fs from "node:fs";
import { AI_SUITE_CAPABILITIES } from "../src/lib/ai-suite/capabilities";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};
const cap = (name: string) => AI_SUITE_CAPABILITIES.find((c) => c.name === name);
const caps = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
const svc = fs.readFileSync("src/lib/server/message-templates-service.ts", "utf8");

console.log("-- it can find what it is being asked to edit --");
for (const n of ["list_workflows", "list_email_templates"]) {
  const c = cap(n);
  ck(`${n} exists`, !!c);
  ck(`${n} is read-only`, c?.readonly === true);
  ck(`${n} is open to any member, not just admins`, c?.requiredRole === "subAccountMember");
}

console.log("\n-- the lookup carries the content, or a partial edit deletes work --");
{
  const block = caps.slice(caps.indexOf('name: "list_workflows"'), caps.indexOf('name: "list_email_templates"'));
  ck("workflows report their id", /id: \$\{w\.id\}/.test(block));
  ck("workflows report whether they are sending", /describeWorkflowStatus\(w\.status\)/.test(block));
  ck("each email's subject comes back", /cfg\.subject/.test(block));
  ck("each email's BODY comes back", /body: \$\{body\.slice/.test(block));
  ck("internal notification steps are accounted for", /notify/.test(block));
  const tblock = caps.slice(caps.indexOf('name: "list_email_templates"'), caps.indexOf('name: "revise_email"'));
  ck("templates report their id and body", /id: \$\{t\.id\}/.test(tblock) && /body: \$\{body\.slice/.test(tblock));
}

console.log("\n-- editing something that is SENDING needs saying so --");
{
  ck("only 'active' counts as sending", /function workflowIsSending[\s\S]{0,200}status === "active"/.test(caps));
  ck("a draft or paused workflow is not treated as live",
    !/status === "paused"[\s\S]{0,40}return true/.test(caps));
  ck("the guard runs before the overwrite",
    caps.indexOf("workflowIsSending(existing.status)") < caps.indexOf("const result = await applyWorkflowPlan("));
  ck("the status is re-read at execute, not trusted from the proposal",
    /getWorkflow\(ctx\.subAccountId!, editing\)/.test(caps));
  ck("an explicit acknowledgement is what unlocks it", /change_live_workflow/.test(caps));
  ck("the refusal tells the model to ask the customer first",
    /is live and sending right now[\s\S]{0,200}confirm/.test(caps));
}

console.log("\n-- the template edit cannot be used to strip compliance --");
{
  ck("update re-runs the same unsubscribe check as create",
    /export async function updateMessageTemplateServerSide[\s\S]*?validateEmailBody\(body\)/.test(svc));
  ck("the workspace is re-checked from the stored doc",
    /current\.subAccountId !== opts\.subAccountId/.test(svc));
  ck("a foreign id is refused the same way a missing one is, so nothing leaks",
    (svc.match(/That template no longer exists\./g) ?? []).length === 2);
  ck("the list is scoped by workspace",
    /\.where\("subAccountId", "==", subAccountId\)/.test(svc));
}

console.log("\n-- revise_email validates like everything else --");
{
  const c = cap("revise_email")!;
  ck("it is a confirm-gated write", c.readonly !== true);
  ck("it needs admin", c.requiredRole === "subAccountAdmin");
  ck("a missing template_id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ template_id: "t1" }).ok === false);
  const ok = c.validate({ template_id: "t1", body: "Hi\\n\\n{{unsubscribeLink}}" });
  ck("a real edit validates", ok.ok === true);
  if (ok.ok) {
    ck("validate is idempotent, so confirm can re-check it", c.validate(ok.args).ok === true);
    ck("literal newlines are repaired", !String(ok.args.body).includes("\\\\n"));
    ck("untouched fields come back null rather than empty", ok.args.subject === null && ok.args.name === null);
  }
  ck("the description sends the model to the lookup first",
    /Call list_email_templates FIRST/.test(c.description));
  ck("it warns that the body is replaced wholesale",
    /COMPLETE new body/.test(c.description));
}

console.log("\n-- apply_workflow_plan tells the model to look before it overwrites --");
{
  const c = cap("apply_workflow_plan")!;
  ck("the workflow_id parameter says to call list_workflows first",
    /list_workflows first/.test(JSON.stringify(c.parameters)));
  ck("and that every kept message must be resent",
    /EVERY message you are keeping/.test(JSON.stringify(c.parameters)));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
