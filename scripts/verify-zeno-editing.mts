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

console.log("\n-- the CRM nouns: find before you can change --");
{
  for (const n of ["find_deals", "find_tasks", "find_events"]) {
    const c = cap(n);
    ck(`${n} exists and is read-only`, c?.readonly === true);
    ck(`${n} is open to any member`, c?.requiredRole === "subAccountMember");
  }
  for (const n of ["update_task", "update_event"]) {
    const c = cap(n);
    ck(`${n} is a confirm-gated admin write`, c?.readonly !== true && c?.requiredRole === "subAccountAdmin");
  }
}

console.log("\n-- update_task --");
{
  const c = cap("update_task")!;
  ck("a missing id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ task_id: "t1" }).ok === false);
  ck("a bad due date is refused", c.validate({ task_id: "t1", due_date: "next tuesday" }).ok === false);
  const ok = c.validate({ task_id: "t1", title: "Call back", due_date: "2026-03-04" });
  ck("a real edit validates", ok.ok === true);
  if (ok.ok) ck("and re-validates, so confirm can re-check it", c.validate(ok.args).ok === true);
  const cleared = c.validate({ task_id: "t1", notes: "" });
  ck("an empty notes string is a real change, not nothing", cleared.ok === true);
}

console.log("\n-- update_event --");
{
  const c = cap("update_event")!;
  ck("a missing id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ event_id: "e1" }).ok === false);
  ck("an unparseable time is refused", c.validate({ event_id: "e1", start_at: "tomorrow-ish" }).ok === false);
  ck("an end before the start is refused",
    c.validate({ event_id: "e1", start_at: "2026-03-04T14:00:00Z", end_at: "2026-03-04T13:00:00Z" }).ok === false);
  const ok = c.validate({ event_id: "e1", start_at: "2026-03-04T14:00:00Z", end_at: "2026-03-04T15:00:00Z" });
  ck("a real move validates", ok.ok === true);
  if (ok.ok) ck("and re-validates", c.validate(ok.args).ok === true);
}

console.log("\n-- the guards on the new writes --");
{
  const tasks = fs.readFileSync("src/lib/server/tasks-service.ts", "utf8");
  const events = fs.readFileSync("src/lib/server/events-service.ts", "utf8");
  ck("updateTask REQUIRES the workspace guard, it is not optional",
    /updateTaskServerSide\(opts: \{[\s\S]{0,200}expectedSubAccountId: string;/.test(tasks));
  ck("updateEvent requires it too",
    /updateEventServerSide\(opts: \{[\s\S]{0,200}expectedSubAccountId: string;/.test(events));
  ck("a foreign task id returns null, same as a missing one",
    /existing\.subAccountId !== opts\.expectedSubAccountId\) return null/.test(tasks));
  ck("a foreign event id too",
    /existing\.subAccountId !== opts\.expectedSubAccountId\) return null/.test(events));
  // Booking events carry confirmation emails, ICS sequencing and reminders.
  ck("an event that came from a booking is refused",
    /bookingPageId \|\| existing\.source === "booking"/.test(events));
  ck("and the refusal explains where to reschedule it instead",
    /Reschedule it from the booking itself/.test(caps));
  ck("both lookups are scoped by workspace",
    (tasks.match(/where\("subAccountId", "==", subAccountId\)/g) ?? []).length >= 1 &&
      (events.match(/where\("subAccountId", "==", subAccountId\)/g) ?? []).length >= 1);
}

console.log("\n-- new webhook types are declared, not smuggled --");
{
  const catalog = fs.readFileSync("src/types/webhooks.ts", "utf8");
  const samples = fs.readFileSync("src/lib/webhooks/sample-payloads.ts", "utf8");
  for (const t of ["task.updated", "event.updated"]) {
    ck(`${t} is in the public catalog`, catalog.includes(`"${t}"`));
    ck(`${t} has a sample payload subscribers can read`, samples.includes(`"${t}"`));
  }
}

console.log("\n-- websites: edit is not publish --");
{
  const sites = fs.readFileSync("src/lib/server/websites-service.ts", "utf8");
  const patch = sites.slice(sites.indexOf("export async function patchWebsiteCopyServerSide"));

  ck("the patch merges into the STORED config", /const next: WebsiteConfig = \{ \.\.\.current \}/.test(patch));
  ck("only the keys that were sent are touched", /if \(typeof v === "string" && v\.trim\(\)\)/.test(patch));
  // The whole risk with a generated document is erasing what it omitted.
  ck("the config is never replaced wholesale", !/config: input\.patch/.test(patch));
  ck("an edit does not change status", !/status:\s*"/.test(patch.slice(0, patch.indexOf("return {"))));
  ck("an edit does not clear the live URL", !/liveUrl:\s*null/.test(patch));
  ck("a build in flight is refused", /status === "queued" \|\| doc\.status === "building"/.test(patch));
  ck("the path itself is the tenancy boundary",
    /subAccounts\/\$\{input\.subAccountId\}\/website\/\$\{input\.siteId\}/.test(patch));

  const c = cap("update_website")!;
  ck("update_website is a confirm-gated admin write", c.readonly !== true && c.requiredRole === "subAccountAdmin");
  ck("a missing site_id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ site_id: "s1" }).ok === false);
  const ok = c.validate({ site_id: "s1", heading: "Better heading" });
  ck("a real edit validates", ok.ok === true);
  if (ok.ok) ck("and re-validates", c.validate(ok.args).ok === true);
  // Facts come from the workspace, never from a generator.
  const props = Object.keys((c.parameters as { properties: Record<string, unknown> }).properties);
  for (const forbidden of ["business_phone", "business_email", "business_street", "opening_hours", "cta_link"]) {
    ck(`${forbidden} is not editable by the model`, !props.includes(forbidden));
  }
  ck("the description says an edit does not publish", /does NOT publish/.test(c.description));
}

console.log("\n-- rebuild is explicit, and reuses the real build path --");
{
  const c = cap("rebuild_website")!;
  ck("it exists as its own capability", !!c && c.readonly !== true);
  ck("it takes only the site id, never a config",
    Object.keys((c.parameters as { properties: Record<string, unknown> }).properties).join() === "site_id");
  ck("it rebuilds from the STORED config", /getWebsiteForSubAccount/.test(caps));
  ck("it goes through the existing build service, keeping its guards",
    /submitWebsiteBuildForSubAccount\(\{[\s\S]{0,200}config: site\.config/.test(caps));
  ck("it refuses a site already building", /already building/.test(caps));
  ck("the description warns it replaces what is live", /replaces what is currently live/.test(c.description));
  // The slot rule already treats a rebuild as the same website.
  ck("the slot rule is the build service's, not a new one",
    /A rebuild of a site that ALREADY consumes its slot is always/.test(
      fs.readFileSync("src/lib/server/websites-service.ts", "utf8"),
    ));
}

console.log("\n-- members: one implementation, shared with the route --");
{
  const svcM = fs.readFileSync("src/lib/server/members-service.ts", "utf8");
  const route = fs.readFileSync("src/app/api/sub-accounts/[id]/members/[uid]/route.ts", "utf8");
  ck("the route delegates role changes to the service",
    /updateSubAccountMemberRoleServerSide\(\{/.test(route));
  ck("the route no longer writes the role itself", !/indexPatch\.role/.test(route));
  ck("both documents are written together, or the switcher disagrees",
    /batch\.update\(memberRef[\s\S]{0,300}userMemberships/.test(svcM));
  ck("a foreign uid behaves like a missing one", /if \(!snap\.exists\) return \{ ok: false, reason: "missing" \}/.test(svcM));
  ck("a removed member is not silently re-roled", /status === "removed"[\s\S]{0,60}missing/.test(svcM));
  // Mirrors the DELETE route's existing self-removal rule.
  ck("an admin cannot demote themselves", /targetUid === opts\.actingUid && opts\.role !== "admin"/.test(svcM));

  const c = cap("update_member_role")!;
  ck("update_member_role needs admin", c.requiredRole === "subAccountAdmin");
  ck("a missing member_id is refused", c.validate({ role: "admin" }).ok === false);
  ck("an invented role is refused", c.validate({ member_id: "u1", role: "superuser" }).ok === false);
  const ok = c.validate({ member_id: "u1", role: "admin" });
  ck("a real change validates", ok.ok === true);
  if (ok.ok) ck("and re-validates", c.validate(ok.args).ok === true);
  ck("only the two roles the product already has are offered",
    JSON.stringify(c.parameters).includes('"admin","collaborator"'));
}

console.log("\n-- the lookups expose the ids their edits need --");
{
  ck("websites report an id", /\(id: \$\{d\.id\}\): \$\{detail\}/.test(caps));
  ck("websites report the current editable copy", /hero_statement: \$\{String\(cfg\[k\]\)/.test(caps) || /editable/.test(caps));
  ck("members report an id", /\(id: \$\{d\.id\}\), role:/.test(caps));
}

console.log("\n-- webhooks: the events list is the destructive field --");
{
  const c = cap("update_webhook")!;
  ck("it needs admin and is confirm-gated", c.readonly !== true && c.requiredRole === "subAccountAdmin");
  ck("a missing id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ webhook_id: "w1" }).ok === false);
  ck("a non-https URL is refused", c.validate({ webhook_id: "w1", url: "http://x.test" }).ok === false);
  // An invented event type would silently never fire.
  ck("an event type that does not exist is refused",
    c.validate({ webhook_id: "w1", events: ["contact.exploded"] }).ok === false);
  const ok = c.validate({ webhook_id: "w1", events: ["contact.created", "deal.won"] });
  ck("real event types validate", ok.ok === true);
  if (ok.ok) ck("and re-validate", c.validate(ok.args).ok === true);
  ck("omitting events leaves them alone", (() => {
    const r = c.validate({ webhook_id: "w1", status: "paused" });
    return r.ok === true && r.args.events === null;
  })());
  // Sending a short list silently unsubscribes the rest, so it has to say so.
  ck("the description warns that events REPLACES the list", /REPLACES the whole subscribed list/.test(c.description));
  ck("the result names what will stop arriving", /NO LONGER receive/.test(caps));
  ck("it reuses the existing update service, not new mutation logic",
    /updateSubscription\(ctx\.subAccountId!/.test(caps));
  ck("it keeps the API kill switch create_webhook has",
    /apiAccessEnabledByAgency !== true[\s\S]{0,400}That webhook no longer exists/.test(caps));
}

console.log("\n-- communities --");
{
  const c = cap("update_community")!;
  ck("it needs admin", c.requiredRole === "subAccountAdmin");
  ck("a missing id is refused", c.validate({}).ok === false);
  ck("changing nothing is refused", c.validate({ community_id: "g1" }).ok === false);
  ck("an invented join policy is refused",
    c.validate({ community_id: "g1", join_policy: "whenever" }).ok === false);
  const ok = c.validate({ community_id: "g1", tagline: "For founders" });
  ck("a real change validates", ok.ok === true);
  if (ok.ok) ck("and re-validates", c.validate(ok.args).ok === true);
  ck("it reuses the existing group patch service", /updateGroupServerSide\(\{/.test(caps));
  // Money and access are operator decisions, not model ones.
  const props = Object.keys((c.parameters as { properties: Record<string, unknown> }).properties);
  for (const forbidden of ["price_cents", "access", "currency", "status"]) {
    ck(`${forbidden} is not editable by the model`, !props.includes(forbidden));
  }
  ck("renaming warns that the public link changes", /public link changed/.test(caps));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
