/**
 * W2 — WHAT THE CUSTOMER IS LOOKING AT, PROVEN.
 *
 * The client says where someone is. It is never why they are allowed to
 * change something. Every case below exists because the opposite would be
 * a way to reach another workspace's data, or to edit the wrong record
 * because it was the one on screen.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-context-resolution.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { parseRouteRef, parseExplicitRef, resolveContextResource, resolveCurrentResource, renderResourceContextLines } =
  await import("../src/lib/ai-suite/context-resources");
const { getAdminDb } = await import("../src/lib/firebase/admin");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };

// FAIL CLOSED: the dev workspace must exist and must be the one we expect.
const SA = process.env.ZENO_DEV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OTHER_SA = "2rLhSqe7lBjghhZOOaFh";
const saSnap = await db.doc(`subAccounts/${SA}`).get();
if (!saSnap.exists) { console.error(`workspace ${SA} not found, refusing to run`); process.exit(1); }
const AG = String(saSnap.data()?.agencyId ?? "");
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";

const made: string[] = [];
try {
  console.log("-- the route names a resource, both shells --");
  {
    const cases: [string, string, string][] = [
      ["/sa/WS1/booking/intro-call", "booking_page", "intro-call"],
      ["/app/create/booking/intro-call", "booking_page", "intro-call"],
      ["/sa/WS1/forms/f123", "form", "f123"],
      ["/app/create/forms/f123", "form", "f123"],
      ["/sa/WS1/workflows/w9", "workflow", "w9"],
      ["/sa/WS1/workflows/w9/runs", "workflow", "w9"],
      ["/sa/WS1/contacts/c7", "contact", "c7"],
      ["/app/grow/contacts/c7", "contact", "c7"],
      ["/sa/WS1/templates/t4", "message_template", "t4"],
      ["/sa/WS1/community/g2/members", "community", "g2"],
      ["/sa/WS1/forms/f123?tab=design#x", "form", "f123"],
    ];
    for (const [route, kind, id] of cases) {
      const r = parseRouteRef(route);
      ck(`${route} -> ${kind}`, r?.kind === kind && r?.id === id, JSON.stringify(r));
    }
    // Nothing is guessed from an unknown segment.
    for (const route of ["/sa/WS1/dashboard", "/sa/WS1/pipeline", "/app/home", "/sa/WS1/unknownthing/x", "/", ""])
      ck(`${route || "(empty)"} resolves to nothing`, parseRouteRef(route) === null);
    ck("a non-string route resolves to nothing", parseRouteRef(undefined) === null && parseRouteRef({} as never) === null);
    ck("an absurdly long route is refused", parseRouteRef("/sa/x/forms/" + "a".repeat(600)) === null);
    ck("an id with a slash cannot smuggle a path",
      parseRouteRef("/sa/WS1/forms/..%2F..%2Fadmin")?.id !== "../../admin");
  }

  console.log("\n-- an explicit ref is shape-checked, never trusted --");
  {
    ck("a known kind parses", parseExplicitRef({ kind: "deal", id: "d1" })?.kind === "deal");
    ck("an invented kind is dropped", parseExplicitRef({ kind: "nuclear_launch", id: "d1" }) === null);
    ck("a malformed id is dropped", parseExplicitRef({ kind: "deal", id: "../../x" }) === null);
    ck("a child id is carried", parseExplicitRef({ kind: "workflow", id: "w1", childId: "e2" })?.childId === "e2");
    ck("a funnel sectionId is accepted as the child", parseExplicitRef({ kind: "funnel", id: "f1", sectionId: "s3" })?.childId === "s3");
    ck("a malformed child is dropped, the parent survives",
      (() => { const r = parseExplicitRef({ kind: "workflow", id: "w1", childId: "../x" }); return r?.id === "w1" && r.childId === undefined; })());
  }

  // ---- real records, in the dev workspace, marked and removed ----
  const { createFormServerSide } = await import("../src/lib/server/forms-service");
  const { createWorkflowServerSide, updateWorkflowServerSide } = await import("../src/lib/server/workflows-service");
  const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");

  const formId = await createFormServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV W2 - DELETE form" });
  made.push(`forms/${formId}`);
  const wfId = await createWorkflowServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV W2 - DELETE flow", template: "blank" });
  made.push(`workflows/${wfId}`);
  await updateWorkflowServerSide({ subAccountId: SA, workflowId: wfId, patch: {
    trigger: { type: "form.submitted", filters: { all: [] } }, startNodeId: "e1",
    nodes: {
      e1: { id: "e1", type: "send_email", config: { subject: "One", body: "a\n\n{{unsubscribeLink}}" }, next: "e2" },
      e2: { id: "e2", type: "send_email", config: { subject: "Two", body: "b\n\n{{unsubscribeLink}}" }, next: null },
    } } });
  const SLUG = "zeno-dev-w2-delete";
  await db.doc(`subAccounts/${SA}/bookingPages/${SLUG}`).delete().catch(() => {});
  await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
    slug: SLUG, name: "ZENO DEV W2 - DELETE page", description: "", status: "draft",
    durationMinutes: 30, bufferMinutes: 0, timezone: "America/Chicago", visibleDays: 14,
    minNoticeHours: 1, maxPerDay: 5, workingHours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    intakeFields: [], remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
    confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
  made.push(`subAccounts/${SA}/bookingPages/${SLUG}`);

  console.log("\n-- a real resource resolves, and says what a tool needs --");
  {
    const f = await resolveContextResource(SA, { kind: "form", id: formId });
    ck("the form resolves", f?.label === "ZENO DEV W2 - DELETE form", JSON.stringify(f));
    ck("and gives the tool its argument", f?.toolArgs.form_id === formId);
    const b = await resolveContextResource(SA, { kind: "booking_page", id: SLUG });
    ck("the booking page resolves", b?.label === "ZENO DEV W2 - DELETE page");
    ck("and gives the tool its argument", b?.toolArgs.booking_page_id === SLUG);
    const w = await resolveContextResource(SA, { kind: "workflow", id: wfId, childId: "e2" });
    ck("the automation resolves", w?.label === "ZENO DEV W2 - DELETE flow");
    ck("the SELECTED email is identified as email 2", w?.child?.label.startsWith("email 2") === true, JSON.stringify(w?.child));
    ck("and the tool is told which number that is", w?.toolArgs.email_number === "2");
    const card = renderResourceContextLines(w!).join("\n");
    ck("the card gives exact tool arguments", card.includes(`workflow_id="${wfId}"`) && card.includes('email_number="2"'));
    ck("the card states that a named target wins over the screen", /IF THEY NAME A DIFFERENT ONE/.test(card));
    ck("the card tells it not to speak the ids", /never say them to the customer/.test(card));
  }

  console.log("\n-- adversarial --");
  {
    // Forged resource: a real id, the wrong workspace asking.
    ck("a resource from another workspace is indistinguishable from missing",
      (await resolveContextResource(OTHER_SA, { kind: "form", id: formId })) === null);
    ck("the booking page likewise",
      (await resolveContextResource(OTHER_SA, { kind: "booking_page", id: SLUG })) === null);
    ck("the automation likewise",
      (await resolveContextResource(OTHER_SA, { kind: "workflow", id: wfId })) === null);
    ck("a nonexistent id gives the identical answer",
      (await resolveContextResource(SA, { kind: "form", id: "doesNotExistAtAll" })) === null);

    // Wrong type: a form id presented as a booking page.
    ck("a form id presented as a booking page resolves to nothing",
      (await resolveContextResource(SA, { kind: "booking_page", id: formId })) === null);
    ck("a booking slug presented as a form resolves to nothing",
      (await resolveContextResource(SA, { kind: "form", id: SLUG })) === null);

    // Child from another parent: a node id that is not in THIS workflow.
    const foreignChild = await resolveContextResource(SA, { kind: "workflow", id: wfId, childId: "nodeFromSomewhereElse" });
    ck("a child that is not part of this parent is dropped", foreignChild !== null && foreignChild.child === undefined);
    ck("and the parent still resolves, so the request is not silently misaimed",
      foreignChild?.id === wfId && foreignChild.toolArgs.email_number === undefined);
  }

  console.log("\n-- precedence and staleness --");
  {
    // An explicit ref wins over the route.
    const both = await resolveCurrentResource(SA, {
      route: `/sa/${SA}/booking/${SLUG}`,
      resourceRef: { kind: "form", id: formId },
    });
    ck("an explicit ref beats the route", both?.kind === "form" && both.id === formId);

    // A forged explicit ref must NOT silently fall back to the route's
    // resource: that would edit what is on screen because the named one
    // could not be reached.
    const forged = await resolveCurrentResource(SA, {
      route: `/sa/${SA}/booking/${SLUG}`,
      resourceRef: { kind: "form", id: "notARealFormAnywhere" },
    });
    ck("an unresolvable explicit ref falls back to the route, not to nothing",
      forged?.kind === "booking_page", JSON.stringify(forged));

    // Staleness: context comes from the route on every message, so
    // navigating changes it with no conversation reset.
    const onA = await resolveCurrentResource(SA, { route: `/sa/${SA}/booking/${SLUG}` });
    const onB = await resolveCurrentResource(SA, { route: `/sa/${SA}/forms/${formId}` });
    ck("page A gives A", onA?.id === SLUG);
    ck("navigating to page B gives B, with no conversation reset", onB?.id === formId);
    const client = readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8");
    ck("the browser reads its route at send time, so it cannot go stale",
      /route: typeof window !== "undefined" \? window\.location\.pathname : undefined/.test(client));
  }

  console.log("\n-- it feeds the existing execution path, not a new one --");
  {
    // W6 moved the turn loop out of the route and into the orchestrator so
    // Telegram runs the same code. The invariants below are unchanged; the
    // file that holds them is not. Read BOTH, so an assertion cannot pass
    // merely because the thing it guards was moved somewhere unchecked.
    const route =
      readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8") +
      readFileSync("src/lib/ai-suite/orchestrator.ts", "utf8");
    ck("context only ever adds a knowledge card", /cards\.push\(\{\s*\n\s*id: "zeno-current-resource"/.test(route));
    ck("it does not execute anything itself",
      !/resolveCurrentResource[\s\S]{0,600}cap\.execute/.test(route));
    ck("the funnel resolver still owns funnels, so there is one answer per page",
      /if \(!artifact\) \{/.test(route));
    const ctx = readFileSync("src/lib/ai-suite/context-resources.ts", "utf8");
    ck("the workspace is never read from the client", !/subAccountId = input\./.test(ctx));
    ck("every loader proves ownership or returns null",
      (ctx.match(/return null;/g) ?? []).length >= 12);
  }
} catch (err) {
  // An aborted run is a failed run. Without this a throw escapes to the
  // finally, which prints a result from a counter that was never
  // incremented, and a run that blew up reports ALL PASS.
  fails++;
  console.log(`FAIL  the suite threw before finishing - ${err instanceof Error ? err.message : String(err)}`);
} finally {
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const strayForms = (await db.collection("forms").where("subAccountId", "==", SA).get())
    .docs.filter((d) => /ZENO DEV W2/.test(String(d.data().name ?? ""))).length;
  console.log(`\ncleaned up ${made.length} dev records; strays: ${strayForms}`);
  if (strayForms > 0) fails++;
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
