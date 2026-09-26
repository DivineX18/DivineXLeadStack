/**
 * TWO DEFECTS A HUMAN FOUND THAT NO TEST COULD.
 *
 * 1. Zeno listed a member one turn, then could not change them the next:
 *    "That person isn't a member of this workspace." The editor took a
 *    Firebase uid and nothing else, and that uid exists only inside a tool
 *    result, which is not part of the conversation the browser replays. A
 *    turn later the model had the name and the email it had said out loud,
 *    and neither resolved. Every earlier test passed because it did the
 *    find and the edit inside ONE turn, where the id was still in hand.
 *
 * 2. Told an action had failed, Zeno asked the customer to go and check
 *    whether it had worked. The history sent back on the next turn said
 *    "(this action failed)" and dropped the reason, so the model knew
 *    something had failed but not what, and hedged.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-zeno-find-edit-chain.mts
 */
import fs from "node:fs";
import { AI_SUITE_CAPABILITIES } from "../src/lib/ai-suite/capabilities";
import { matchMembers } from "../src/lib/server/members-service";
import { addButton, updateButton, removeButton, findButtons } from "../src/lib/email/cta";
import { renderBodyHtml, renderBodyText } from "../src/lib/email/body";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const cap = (n: string) => AI_SUITE_CAPABILITIES.find((c) => c.name === n)!;
const caps = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
const members = fs.readFileSync("src/lib/server/members-service.ts", "utf8");
const chat = fs.readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8");
const prompt = fs.readFileSync("src/lib/ai-suite/prompt.ts", "utf8");
const flows = fs.readFileSync("src/lib/server/workflows-service.ts", "utf8");

console.log("-- a member is named the way a person names one --");
{
  const c = cap("update_member_role");
  // The uid was never something a customer could have.
  ck("the parameter no longer demands an internal id",
    !/the id from list_members\." \}/.test(caps));
  ck("its description says a name or an email works",
    /their name, their email address, or their id/.test(c.description));
  ck("it tells the model never to ask for an internal id",
    /Never ask the user for an internal id/.test(JSON.stringify(c.parameters)));
  for (const needle of ["qa-crm-test@divinex.io", "QA CRM Test", "mq4ylEei7LNpjXknHCAzytePqTv1"])
    ck(`"${needle}" validates`, c.validate({ member_id: needle, role: "collaborator" }).ok === true);
  ck("an empty identifier is still refused", c.validate({ role: "collaborator" }).ok === false);
  ck("an invented role is still refused", c.validate({ member_id: "x", role: "superadmin" }).ok === false);

  // The resolver: scoped, tiered, and never guessing between two people.
  ck("resolution reads only this workspace's members",
    /subAccounts\/\$\{subAccountId\}\/subAccountMembers/.test(members));
  ck("a uid still wins when it is given", /const direct = await db\s*\n?\s*\.doc\(/.test(members));
  ck("removed members are excluded", /status !== "removed"/.test(members));
  ck("exact email is tried before anything looser",
    /\(r\.email \?\? ""\)\.toLowerCase\(\) === lower/.test(members));
  // Behaviour, not the shape of the source: two source assertions here
  // survived a mutation that made the resolver pick the first of two people.
  {
    const ROWS = [
      { uid: "u1", who: "hello", email: "hello@divinex.io" },
      { uid: "u2", who: "QA CRM Test", email: "qa-crm-test@divinex.io" },
      { uid: "u3", who: "Samantha Fry", email: "sam.fry@divinex.io" },
      { uid: "u4", who: "Sam", email: "sam@divinex.io" },
    ];
    const one = (n: string, uid: string) => {
      const r = matchMembers(ROWS, n);
      ck(`"${n}" resolves to ${uid}`, r.found === "one" && r.uid === uid, JSON.stringify(r));
    };
    one("qa-crm-test@divinex.io", "u2");
    one("QA CRM Test", "u2");
    one("qa crm test", "u2");          // case does not matter
    one("QA CRM", "u2");               // a partial name is enough when unique
    one("hello@divinex.io", "u1");
    one("Samantha Fry", "u3");
    // An exact name must not be made ambiguous by a longer one containing it.
    one("Sam", "u4");
    one("sam.fry@divinex.io", "u3");

    const many = matchMembers(ROWS, "divinex.io");
    ck("a needle matching several people asks which, never picks one",
      many.found === "many" && many.candidates.length === 4, JSON.stringify(many).slice(0, 80));
    // "Sam" above proves the tiers matter: an exact name wins outright even
    // though "Samantha Fry" also contains it. A needle that is only ever a
    // loose match, and loose against more than one person, must still ask.
    const loose = matchMembers(
      [...ROWS, { uid: "u5", who: "Test One", email: "t1@x.io" }, { uid: "u6", who: "Test Two", email: "t2@x.io" }],
      "Test",
    );
    ck("a needle that is only ever a loose match, against several, asks",
      loose.found === "many" && loose.candidates.length === 3, JSON.stringify(loose).slice(0, 90));

    ck("someone who is not here resolves to nothing", matchMembers(ROWS, "Renz").found === "none");
    ck("a uid from another workspace resolves to nothing",
      matchMembers(ROWS, "someForeignUid123").found === "none");
    ck("an empty needle resolves to nothing", matchMembers(ROWS, "   ").found === "none");
    ck("an empty workspace resolves to nothing", matchMembers([], "anyone").found === "none");
  }
  ck("removed members are never in the rows that are matched",
    /\.filter\(\(d\) => d\.data\(\)\.status !== "removed"\)\s*\n\s*\.map/.test(members));
  ck("the capability asks which one", /More than one member matches that/.test(caps));
  ck("no match reads exactly like a member who was never there",
    /found === "none"[\s\S]{0,140}isn't a member of this workspace/.test(caps));
  ck("self-demotion is untouched", /reason === "self"/.test(caps));
}

console.log("\n-- what happened, not that something happened --");
{
  ck("a failed action reports that nothing changed", /DID NOT HAPPEN\. Nothing was changed/.test(chat));
  ck("and carries the actual reason", /Reason: \$\{\s*m\.resultText/.test(chat));
  ck("a cancelled action says nothing changed", /cancelled by the user, so nothing changed/.test(chat));
  ck("a pending action says nothing has changed yet", /nothing has changed yet/.test(chat));
  ck("the model is told that record is authoritative", /That record is authoritative/.test(prompt));
  ck("and told never to ask the user to check a known failure",
    /Never tell the user to go and check whether something worked/.test(prompt));
  ck("a refusal is framed as an answer, not a malfunction",
    /A refusal is a real answer, not a malfunction/.test(prompt));
  ck("the model is told ids do not survive the turn",
    /only yours for THIS turn/.test(prompt));
}

console.log("\n-- a CTA is edited as a CTA --");
{
  const BODY = [
    "Hi {{contact.firstName}},",
    "",
    "Thanks for getting in touch. Here is what happens next.",
    "",
    "Speak soon,",
    "The team",
    "",
    "{{unsubscribeLink}}",
  ].join("\n");

  const added = addButton(BODY, { label: "Book a Call", href: "https://example.com/book" });
  ck("adding a button succeeds", added.ok === true);
  if (added.ok) {
    const lines = added.body.split("\n");
    const btnAt = lines.findIndex((l) => l.includes("[button:"));
    const unsubAt = lines.findIndex((l) => l.includes("{{unsubscribeLink}}"));
    ck("the button lands before the unsubscribe link, never after", btnAt !== -1 && btnAt < unsubAt);
    ck("the unsubscribe link survives", added.body.includes("{{unsubscribeLink}}"));
    ck("personalisation survives", added.body.includes("{{contact.firstName}}"));
    ck("every original line of copy survives",
      ["Hi {{contact.firstName}},", "Thanks for getting in touch. Here is what happens next.", "Speak soon,", "The team"]
        .every((l) => added.body.includes(l)));
    ck("exactly one button now exists", findButtons(added.body).length === 1);

    // It must actually render as the existing treatment, both parts.
    const html = renderBodyHtml(added.body.replace("{{unsubscribeLink}}", "https://x.test/u"));
    ck("it renders as the bulletproof table button", /<table[\s\S]*?example\.com\/book/.test(html));
    ck("the plain-text fallback carries the label and the URL",
      (() => { const t = renderBodyText(added.body); return t.includes("Book a Call") && t.includes("https://example.com/book"); })());

    const dup = addButton(added.body, { label: "Book a Call", href: "https://example.com/book" });
    ck("adding the same button again is refused, not duplicated", dup.ok === false && dup.reason === "duplicate");

    const changed = updateButton(added.body, { label: "Schedule a Call" });
    ck("changing the wording succeeds", changed.ok === true);
    if (changed.ok) {
      ck("the destination is untouched", changed.body.includes("https://example.com/book"));
      ck("the label changed", changed.body.includes("Schedule a Call") && !changed.body.includes("Book a Call"));
      ck("it did not add a second button", findButtons(changed.body).length === 1);
      ck("the surrounding copy is byte-identical",
        changed.body.split("\n").filter((l) => !l.includes("[button")).join("\n") ===
          added.body.split("\n").filter((l) => !l.includes("[button")).join("\n"));

      const removed = removeButton(changed.body);
      ck("removing it succeeds", removed.ok === true);
      if (removed.ok) {
        ck("no button remains", findButtons(removed.body).length === 0);
        ck("the rest of the email is unchanged", removed.body.trim() === BODY.trim());
      }
    }
  }

  // Ambiguity is asked about, never guessed.
  const two = addButton(addButton(BODY, { label: "A", href: "https://a.test" }).ok
    ? (addButton(BODY, { label: "A", href: "https://a.test" }) as { body: string }).body : BODY,
    { label: "B", href: "https://b.test", style: "secondary" });
  ck("a second, different button can be added", two.ok === true);
  if (two.ok) {
    ck("both are present", findButtons(two.body).length === 2);
    ck("with two buttons, an unaimed change asks which",
      (() => { const r = updateButton(two.body, { label: "C" }); return r.ok === false && r.reason === "ambiguous"; })());
    ck("with two buttons, an unaimed removal asks which",
      (() => { const r = removeButton(two.body); return r.ok === false && r.reason === "ambiguous"; })());
    ck("aimed by number, it changes the right one",
      (() => { const r = updateButton(two.body, { position: 2, label: "C" });
        return r.ok === true && r.body.includes("[button secondary: C]") && r.body.includes("A]"); })());
    ck("a number that is not there is refused",
      (() => { const r = updateButton(two.body, { position: 9, label: "C" }); return r.ok === false && r.reason === "not_found"; })());
    ck("the secondary style is preserved through a label change",
      (() => { const r = updateButton(two.body, { position: 2, label: "C" }); return r.ok === true && r.body.includes("button secondary"); })());
  }
  ck("an email with no button says so rather than failing",
    (() => { const r = updateButton(BODY, { label: "x" }); return r.ok === false && r.reason === "no_buttons"; })());

  // A body whose unsubscribe link is the very first thing still gets the
  // button above it, because the rule is about order, not position.
  const oddly = addButton("{{unsubscribeLink}}", { label: "X", href: "https://x.test" });
  ck("even then, the button goes above the unsubscribe link",
    oddly.ok === true && oddly.body.indexOf("[button:") < oddly.body.indexOf("{{unsubscribeLink}}"));
}

console.log("\n-- the CTA capability, and what it refuses --");
{
  const c = cap("edit_email_cta");
  ck("it is a confirm-gated write needing admin", c.readonly !== true && c.requiredRole === "subAccountAdmin");
  ck("no target is refused", c.validate({ action: "add", label: "x", url: "https://x.test" }).ok === false);
  ck("both targets at once is refused",
    c.validate({ action: "remove", template_id: "t1", workflow_id: "w1", email_number: 1 }).ok === false);
  ck("a workflow without an email number is refused",
    c.validate({ action: "remove", workflow_id: "w1" }).ok === false);
  ck("adding without a destination is refused",
    c.validate({ action: "add", template_id: "t1", label: "Book" }).ok === false);
  ck("an invented, non-link destination is refused",
    c.validate({ action: "add", template_id: "t1", label: "Book", url: "our booking page" }).ok === false);
  ck("javascript: is refused",
    c.validate({ action: "add", template_id: "t1", label: "Book", url: "javascript:alert(1)" }).ok === false);
  ck("mailto is allowed",
    c.validate({ action: "add", template_id: "t1", label: "Email us", url: "mailto:hi@x.test" }).ok === true);
  ck("a change with nothing to change is refused",
    c.validate({ action: "change", template_id: "t1" }).ok === false);
  const ok = c.validate({ action: "add", workflow_id: "w1", email_number: 2, label: "Book a Call", url: "https://x.test/book" });
  ck("a real request validates", ok.ok === true);
  if (ok.ok) ck("and re-validates (the confirm route re-checks its own output)", c.validate(ok.args).ok === true);
  ck("the model is told not to invent a destination", /Never invent the destination/.test(c.description));
  ck("and to ask when a destination is ambiguous", /if there is more than one, ask which/.test(c.description));
  ck("and to use this instead of rewriting the email", /not revise_email or apply_workflow_plan/.test(c.description));

  // The workflow write is a patch, and cannot change what it was not asked to.
  ck("only one node's body is replaced", /nodes\[targetId\] = \{ \.\.\.node, config: \{ \.\.\.config, body: result\.body \} \}/.test(flows));
  ck("the update writes nodes and a timestamp, nothing else",
    /await ref\.update\(\{ nodes, updatedAt: FieldValue\.serverTimestamp\(\) \}\)/.test(flows));
  // Editing must not be a way to activate an automation. The patch reads the
  // status to report it and never writes one.
  {
    const fn = flows.slice(
      flows.indexOf("export async function patchWorkflowEmailBodyServerSide"),
      flows.indexOf("export interface RunView"),
    );
    const writes = fn.match(/ref\.update\(\{[^}]*\}/g) ?? [];
    ck("the patch performs exactly one write", writes.length === 1);
    ck("editing cannot publish a draft: that write never sets status",
      writes.every((w) => !/status/.test(w)));
    ck("it reports the status rather than changing it", /status: wf\.status/.test(fn));
  }
  ck("a workflow from another workspace reads as missing",
    /snap\.data\(\)!\.subAccountId !== opts\.subAccountId[\s\S]{0,120}reason: "missing"/.test(flows));
  ck("the result states the automation's status did not change", /Editing it did not change that/.test(caps));
  ck("the lookups name the buttons so an edit can be aimed",
    (caps.match(/buttons: \$\{btns\.map/g) ?? []).length === 2);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
