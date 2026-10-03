/**
 * THE CONNECTED ASSESSMENT JOURNEY.
 *
 * Three defects, found by walking the real request "opt-in → assessment →
 * thank-you with a Book a Call CTA":
 *
 *  1. Multistep journeys came out as UNLINKED pages. create_funnel's receipt
 *     ends with the new Funnel ID and "pass as bridge_next_funnel_id when
 *     creating an UPSTREAM step", but the confirm route withholds that
 *     receipt from the client (U1), and the chat client builds the model's
 *     history from what it received. The model was told to carry an id it
 *     was structurally prevented from seeing.
 *  2. A bad bridge id built the whole system, threw, and reported "this did
 *     not happen" over an orphaned page, which is what turned one wrong
 *     argument into a duplicate.
 *  3. Assessments were generated as `lead_magnet`, which cannot publish
 *     without an attached file, for pages that never promised one.
 */
import { readFileSync } from "node:fs";
import {
  detectLeadMagnetMismatch,
} from "../src/lib/funnels/claim-integrity";
import { assessmentFormFields, assessmentSteps } from "../src/lib/funnels/assessment-form";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

console.log("\n1. An assessment is not a lead magnet");
// The two real misclassified pages.
for (const copy of [
  ["Get Your Free Assessment", "Find out what's actually driving your symptoms"],
  ["Book Your Free Assessment", "A 45-minute diagnostic that ends with a plan"],
  ["Root Cause Health Diagnostic", "Take the diagnostic quiz"],
  ["Where is your growth stuck?", "A 10-question scorecard"],
]) {
  const m = detectLeadMagnetMismatch({ genre: "lead_magnet", copy });
  check(`"${copy[0]}" is caught`, m !== null, JSON.stringify(m?.reason ?? "not caught").slice(0, 60));
}

console.log("\n2. A real lead magnet is left alone");
// BOTH halves required: these promise a file, so they stay magnets even
// when the word "assessment" appears.
for (const copy of [
  ["Download the 12-point checklist", "Get the PDF"],
  ["Get your free guide", "A 20-page playbook"],
  ["The swipe file", "Send me the templates"],
  ["Free assessment worksheet PDF", "Download your copy"],
  ["Get the ebook", "Includes a self-assessment chapter"],
]) {
  check(`"${copy[0]}" stays a lead magnet`, detectLeadMagnetMismatch({ genre: "lead_magnet", copy }) === null);
}

console.log("\n3. Other genres are never second-guessed");
for (const genre of ["application", "lead_gen", "booking", "webinar", "tripwire", "vsl", "challenge"]) {
  check(`${genre} is untouched`, detectLeadMagnetMismatch({ genre, copy: ["Take the assessment"] }) === null);
}
// BOTH halves are required, and this is the half the other fixtures miss.
// A magnet whose copy promises neither a file nor an assessment is just
// vaguely worded; flagging it would refuse legitimate pages. Without this,
// deleting the assessment requirement passes every other check here.
for (const copy of [
  ["Join the list", "Be first to hear what we publish"],
  ["Get started with us", "Leave your details and we'll be in touch"],
  ["The insider list", "One email a month, no noise"],
]) {
  check(`vague magnet copy "${copy[0]}" is NOT flagged`,
    detectLeadMagnetMismatch({ genre: "lead_magnet", copy }) === null);
}
check("empty copy is not a mismatch", detectLeadMagnetMismatch({ genre: "lead_magnet", copy: [] }) === null);
check("blank strings are not a mismatch", detectLeadMagnetMismatch({ genre: "lead_magnet", copy: ["", "  "] }) === null);

console.log("\n4. The refusal tells the model what to do instead");
const cap = readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
check("validate runs the check", /detectLeadMagnetMismatch\(\{/.test(cap));
check("it names both correct genres", /Use "application" if this page IS the assessment[\s\S]{0,140}"lead_gen"/.test(cap));
check("it says nothing was created", /genre "lead_magnet" is wrong[\s\S]{0,420}Nothing was created/.test(cap));
check("it asks for stage_content to be rewritten", /Rewrite stage_content for whichever you pick/.test(cap));

console.log("\n5. The chain link is resolved BEFORE anything is written");
const writeAt = cap.indexOf("const funnelId = await createFunnelServerSide(");
const checkAt = cap.indexOf('bridge_next_funnel_id "${args.bridgeNextFunnelId}" doesn');
check("both sites were located", writeAt > 0 && checkAt > 0);
check("the link is validated before the funnel is created", checkAt < writeAt, `${checkAt} vs ${writeAt}`);
check("a rejected link says nothing was created", /Nothing was created, so call create_funnel again with the real id/.test(cap));
check("the self-reference case drops the link instead of throwing",
  /if \(bridgeTarget && bridgeTarget === funnelId\) bridgeTarget = null;/.test(cap));

console.log("\n6. The model can see what it just built");
const rb = readFileSync("src/lib/ai-suite/recent-builds.ts", "utf8");
const chat = readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
check("the chat route injects recent builds", /renderRecentBuildsCard\(/.test(chat));
check("the card carries real ids", /\$\{r\.resultRef!\.id\}/.test(rb));
check("only genuinely created things are listed", /status", "==", "executed"/.test(rb));
check("only this workspace", /subAccountId", "==", subAccountId/.test(rb));
check("it tells the model to use them for the upstream link", /pass the downstream funnel's id above as bridge_next_funnel_id/.test(rb));
check("it forbids inventing or placeholdering an id", /never pass a placeholder/.test(rb));
check("it warns against rebuilding something already listed", /do not build it again/.test(rb));
// U1: the receipt must still never be sent to the browser.
const confirm = readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8");
check("the confirm route still withholds the receipt from the client",
  !/agentNote/.test(confirm) && /resultText: renderCompletion\(completion\)/.test(confirm));

console.log("\n7. The journey can END on the completion page");
// Zeno built an entire extra funnel whose only job was to carry a "Book a
// Call" button, because the thank-you page could only link to another
// funnel. A journey that ends in a booking should end on the assessment's
// own completion page.
{
  const types = readFileSync("src/types/funnels.ts", "utf8");
  const thanks = readFileSync("src/app/lp/[funnelId]/thanks/page.tsx", "utf8");
  check("the completion step can hold a non-funnel destination", /nextHref\?: string \| null;/.test(types));
  check("the thanks page renders on either", /bridge\?\.nextFunnelId \|\| bridge\?\.nextHref/.test(thanks));
  check("an internal step still wins when both are set",
    /bridge\.nextFunnelId \? `\/lp\/\$\{bridge\.nextFunnelId\}` : \(bridge\.nextHref as string\)/.test(thanks));
  check("the model is told to use it for a final booking step",
    /without building a whole extra funnel whose only job is to carry one button/.test(cap));
  // A published page's button is a real link; a javascript: or data: href
  // on it is an injection, and a bare word is a dead button.
  check("only app paths and https URLs are accepted",
    cap.includes("^\\/[A-Za-z0-9/_-]*$") && cap.includes("^https:"));
  check("anything else is refused before the funnel is created",
    /bridge_next_href[\s\S]{0,160}Nothing was created/.test(cap));
}

console.log("\n8. A diagnostic is asked one question at a time");
// Composition over the existing form system, not a quiz engine: ordinary
// fields, the existing multi_step_form section, one submission.
{
  const qs = [
    { question: "How long have you had symptoms?", options: ["Under 3 months", "3-12 months", "Over a year"] },
    { question: "What does a normal morning feel like?" },
  ];
  const fields = assessmentFormFields(qs);
  const steps = assessmentSteps(qs);

  check("identity is asked FIRST, not after the questions",
    fields[0].mapsTo === "name" && fields[1].mapsTo === "email", fields.slice(0,2).map(f=>f.mapsTo).join(","));
  check("step one collects name and email together",
    steps[0].fieldIds.join(",") === "name,email", steps[0].fieldIds.join(","));
  check("every question gets its own screen",
    steps.length === qs.length + 1 && steps.slice(1).every((st) => st.fieldIds.length === 1), String(steps.length));
  check("the screen's title IS the question", steps[1].title === qs[0].question, steps[1].title);
  check("preset answers become a pick-one", fields[2].type === "select" && fields[2].options.length === 3, fields[2].type);
  check("a question with no options stays free text", fields[3].type === "text" && fields[3].options.length === 0, fields[3].type);
  check("answers do not invent new contact columns", fields.slice(2).every((f) => f.mapsTo === null));
  check("every question is required, so a submission is complete", fields.slice(2).every((f) => f.required));
  // Non-vacuous: no questions must change nothing at all.
  check("an ordinary form is untouched", assessmentSteps([]).length === 1 && assessmentFormFields([]).length === 2);

  check("the capture form is built from the questions", /fields: assessmentFormFields\(assessment\)/.test(cap));
  check("the offer section becomes the stepped flow", /type: "multi_step_form"/.test(cap));
  check("it submits to the SAME form that was just created", /formId: createdFormId,\s*\n\s*steps: assessmentSteps/.test(cap));
  check("a workspace booking page ends the journey when one exists",
    /mode: "booking" as const, bookingSlug/.test(cap));
  check("without one it ends honestly rather than on a dead button",
    /mode: "message" as const/.test(cap));
  check("ordinary funnels never become stepped", /if \(assessment\.length > 0\) \{/.test(cap));
  // Order matters: the booking page has to exist before the funnel, or the
  // completion screen falls back to a message and a whole extra funnel gets
  // built later just to hold the button.
  // A booking page the model cannot see is a booking page it builds twice.
  const rbCard = readFileSync("src/lib/ai-suite/recent-builds.ts", "utf8");
  check("booking pages are referenceable, so a second one is not created",
    /REFERENCEABLE = new Set\(\[[^\]]*"booking_page"/.test(rbCard));
  check("and the booking page is offered as a slug, which is what the CTA takes",
    /booking page, slug "\$\{r\.resultRef!\.id\}/.test(rbCard) &&
    /pass its slug as cta_booking_page_slug instead of creating another one/.test(rbCard));
  // The model is never told this workspace's id, so a /b/ path is a fact it
  // cannot supply. Asking for one made it guess "{subAccountId}", get
  // refused, and finally ask the CUSTOMER for the booking URL.
  check("a booking destination is resolved from the slug, not templated by the model",
    /const asBooking = \/\^\\\/b/.test(cap) && /bridgeHref = `\/b\/\$\{subAccountId\}\/\$\{hit\.slug\}`/.test(cap));
  check("a bare slug is accepted as the booking destination",
    /\(\/\^\[A-Za-z0-9_-\]\+\$\/\.test\(raw\) \? raw : null\)/.test(cap));
  check("an unknown slug is refused with the real ones named",
    /There is no booking page with the slug/.test(cap) && /The ones that exist are:/.test(cap));
  check("the model is no longer shown a /b/ template it cannot fill",
    !/'\/b\/<subAccountId>\/<slug>'/.test(cap) &&
    /do NOT try to construct a \/b\/ path, you are not told this workspace's id/.test(cap));
  check("the model is told to create the booking page FIRST",
    /create the booking page FIRST with create_booking_page, then pass its slug as cta_booking_page_slug/.test(cap));
  check("and told what going the other way costs",
    /a second funnel gets built later just to hold the booking button/.test(cap));
  // Scope: no scoring/branching/results engine was built.
  const af = readFileSync("src/lib/funnels/assessment-form.ts", "utf8");
  for (const forbidden of ["score", "branch", "weight", "result page", "personality"]) {
    check(`no ${forbidden} engine was introduced`, !new RegExp(`\\b${forbidden}`, "i").test(af.replace(/\/\*[\s\S]*?\*\//g, "")));
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
