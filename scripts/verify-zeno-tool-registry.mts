/**
 * THE 502 THAT TOOK THE WHOLE ASSISTANT DOWN.
 *
 * A duplicate capability name shipped. Every model provider rejects that
 * outright — `400 tools: Tool names must be unique` — and a 400 is not
 * retryable, so it threw and the chat route's catch-all returned a 5xx. The
 * effect was total: every sub-account message failed, including plain
 * conversation that was never going to call a tool. Only one prompt was
 * reported, so it looked like a booking bug.
 *
 * It shipped because nothing could see it. TypeScript accepts two objects in
 * an array, getCapability returns the first and behaves correctly, and the
 * coverage matrix was built from a Set of names, which cannot represent a
 * duplicate at all. Nothing failed until a request reached a provider.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-zeno-tool-registry.mts
 */
import fs from "node:fs";
import { AI_SUITE_CAPABILITIES, toolsForLevel, parseBookingPageRef } from "../src/lib/ai-suite/capabilities";
import { resolveEventInterval } from "../src/lib/server/events-service";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};
const route = fs.readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
const caps = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");

console.log("-- the registry itself --");
{
  const names = AI_SUITE_CAPABILITIES.map((c) => c.name);
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  ck("no capability name appears twice", dupes.length === 0, dupes.join(", "));
  ck("the guard runs on import, not per request", /^assertUniqueCapabilityNames\(\);$/m.test(caps));
  ck("the guard explains what a duplicate does", /Tool names must be unique/.test(caps));
}

console.log("\n-- every tool payload a provider could be sent --");
for (const [level, role] of [
  ["sub-account", { agencyRoleIsOwner: false, subAccountRole: "admin" }],
  ["sub-account", { agencyRoleIsOwner: false, subAccountRole: "collaborator" }],
  ["sub-account", { agencyRoleIsOwner: true }],
  ["agency", { agencyRoleIsOwner: true }],
  ["agency", { agencyRoleIsOwner: false }],
] as const) {
  const tools = toolsForLevel(level, role as never);
  const n = tools.map((t) => t.function.name as string);
  const d = [...new Set(n.filter((x, i) => n.indexOf(x) !== i))];
  ck(`${level}/${(role as { subAccountRole?: string }).subAccountRole ?? (role.agencyRoleIsOwner ? "owner" : "member")}: ${tools.length} tools, all uniquely named`,
    d.length === 0, d.join(", "));
  // A nameless or parameterless tool is rejected the same way.
  ck(`  every tool has a name and a parameters object`,
    tools.every((t) => typeof t.function.name === "string" && (t.function.name as string).length > 0
      && typeof t.function.parameters === "object" && t.function.parameters !== null));
  ck(`  every name matches the provider-allowed pattern`,
    tools.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.function.name as string)));
}

console.log("\n-- a capability fault is not an outage --");
{
  ck("only a model-reach failure is tagged for 5xx", /class ModelUnreachableError/.test(route));
  ck("the model call is what gets tagged",
    /try \{\s*turn = await runAiSuiteTurn\([\s\S]{0,120}throw new ModelUnreachableError/.test(route));
  ck("the 502 branch requires that tag", /err instanceof ModelUnreachableError[\s\S]{0,300}status: 502/.test(route));
  ck("anything else answers in the conversation",
    /turn failed:[\s\S]{0,700}type: "message"/.test(route));
  ck("a genuine unexpected error is still logged in full", /err\.stack \?\? err\.message/.test(route));
  ck("a throwing validate cannot end the turn", /function safeValidate\(/.test(route));
  ck("both validate sites in the loop go through it",
    (route.match(/safeValidate\(cap,/g) ?? []).length === 2);
  ck("a CapabilityUserError reaches the customer as words", /err instanceof CapabilityUserError[\s\S]{0,200}type: "message"/.test(route));
}

console.log("\n-- a public link is a usable identifier --");
{
  const r = parseBookingPageRef("https://crm.divinex.io/b/MEYB8CbWlE5fxAn3TJOp/30-minute-consultation");
  ck("a full booking URL resolves to its slug", r.ok === true && r.slug === "30-minute-consultation");
  ck("and carries the workspace it named", r.ok === true && r.workspaceId === "MEYB8CbWlE5fxAn3TJOp");
  // Not special-cased to one host or one deployment.
  const alt = parseBookingPageRef("https://book.someclient.com/b/WS123/intro-call");
  ck("any host works, not just this deployment", alt.ok === true && alt.slug === "intro-call");
  const bare = parseBookingPageRef("30-minute-consultation");
  ck("a bare slug still works", bare.ok === true && bare.slug === "30-minute-consultation" && bare.workspaceId === null);
  const path = parseBookingPageRef("/b/WS123/intro-call");
  ck("a path without a host works", path.ok === true && path.slug === "intro-call");
  ck("a link that is not a booking link is refused",
    parseBookingPageRef("https://crm.divinex.io/f/abc123").ok === false);
  ck("junk is refused", parseBookingPageRef("https://example.com/").ok === false);
  ck("an encoded slug is decoded",
    (() => { const x = parseBookingPageRef("/b/WS1/thirty%20minutes"); return x.ok === true && x.slug === "thirty minutes"; })());

  // Tenancy: the workspace is carried, and enforced where ctx exists.
  ck("validate does not judge the workspace, execute does",
    /linkWorkspaceId !== ctx\.subAccountId/.test(caps));
  ck("a foreign link refuses instead of editing the local same-named page",
    /belongs to a different workspace/.test(caps));
  const c = AI_SUITE_CAPABILITIES.find((x) => x.name === "update_booking_page")!;
  const v = c.validate({ booking_page_id: "https://crm.divinex.io/b/WS1/intro", duration_minutes: 45 });
  ck("a URL validates end to end", v.ok === true);
  if (v.ok) {
    ck("and re-validates (the confirm route re-checks its own output)", c.validate(v.args).ok === true);
    ck("the carried workspace is not mistaken for a requested change",
      c.summarize(v.args).includes("durationMinutes") && !c.summarize(v.args).includes("linkWorkspaceId"));
  }
  ck("a URL with no other change is still refused",
    c.validate({ booking_page_id: "https://crm.divinex.io/b/WS1/intro" }).ok === false);
}

console.log("\n-- lookups can be chained into their editors --");
{
  // Each editor needs an id; the matching lookup is the only place to get one.
  ck("find_events prints the event id", /- \$\{data\.title \?\? "\(untitled\)"\}, id: \$\{doc\.id\}/.test(caps));
  ck("find_events flags a booking-sourced event, which cannot be moved",
    /booked through a booking page/.test(caps));
  ck("list_webhooks prints the subscription id", /- \$\{d\.url\}, id: \$\{d\.id\}/.test(caps));
  ck("list_booking_pages prints the public link so a pasted URL matches",
    /link: \$\{base\}\/b\/\$\{ctx\.subAccountId\}\/\$\{b\.slug\}/.test(caps));
  for (const [lookup, editor] of [
    ["find_deals", "update_deal"], ["find_tasks", "update_task"],
    ["find_events", "update_event"], ["list_webhooks", "update_webhook"],
    ["list_forms", "update_form"], ["list_booking_pages", "update_booking_page"],
    ["list_communities", "update_community"], ["list_members", "update_member_role"],
  ]) {
    const l = AI_SUITE_CAPABILITIES.find((c) => c.name === lookup);
    const e = AI_SUITE_CAPABILITIES.find((c) => c.name === editor);
    ck(`${lookup} -> ${editor}: both exist, lookup is readonly, editor is not`,
      !!l && !!e && l.readonly === true && e.readonly !== true);
  }
}

console.log("\n-- an event is an interval, not two independent fields --");
{
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 2, h, m));
  const R = resolveEventInterval;

  // The live defect: moving the start left the end behind, and the stored
  // event ended 90 minutes before it began.
  const moved = R({ currentStart: at(16), currentEnd: at(16, 30), nextStart: at(18) });
  ck("moving the start carries the duration with it",
    "startAt" in moved && moved.startAt!.getTime() === at(18).getTime()
      && moved.endAt!.getTime() === at(18, 30).getTime());

  const longer = R({ currentStart: at(9), currentEnd: at(11), nextStart: at(14) });
  ck("a two-hour meeting stays two hours",
    "endAt" in longer && longer.endAt!.getTime() === at(16).getTime());

  const both = R({ currentStart: at(16), currentEnd: at(16, 30), nextStart: at(18), nextEnd: at(19, 15) });
  ck("an explicit end is honoured exactly as given",
    "endAt" in both && both.endAt!.getTime() === at(19, 15).getTime());

  const endOnly = R({ currentStart: at(16), currentEnd: at(16, 30), nextEnd: at(17) });
  ck("extending the end alone leaves the start alone",
    "endAt" in endOnly && endOnly.endAt!.getTime() === at(17).getTime() && !("startAt" in endOnly));

  ck("an end before the start is refused, not stored",
    "refused" in R({ currentStart: at(16), currentEnd: at(16, 30), nextEnd: at(15) }));
  ck("a start after the end is refused too",
    "refused" in R({ currentStart: at(16), currentEnd: at(16, 30), nextStart: at(20), nextEnd: at(17) }));
  ck("a zero-length interval is refused",
    "refused" in R({ currentStart: at(16), currentEnd: at(16, 30), nextStart: at(17), nextEnd: at(17) }));

  // An event with no stored end must not gain a fabricated one.
  const noEnd = R({ currentStart: at(16), currentEnd: null, nextStart: at(18) });
  ck("an event with no end does not acquire one",
    "startAt" in noEnd && noEnd.endAt === undefined);

  ck("the refusal reaches the customer as words",
    /ending before it starts/.test(caps));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
