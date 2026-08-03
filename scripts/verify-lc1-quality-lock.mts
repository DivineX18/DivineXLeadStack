// Permanent regression coverage for "Flow — Launch Candidate (LC 1.0)"
// (2026-08-03): a quality-lock/polish pass with no new features. Covers
// the concrete bugs found during a live 18-funnel human-experience review
// across chiropractor/dentist/roofing/HVAC/real-estate/legal/accounting/
// financial-advisor/SaaS/nonprofit/coach/wellness/agency/course/webinar/
// application/ecommerce prompts:
//
//  1. Subheadline (and cta_banner_subtext/eyebrow/confirmation_email_subject)
//     were plain `.slice(0, N)` truncated — several real generations ended
//     mid-word ("...every morn", "...keep it go") whenever the model's
//     sentence ran past the cap. Fixed with a word-boundary-safe
//     truncateAtWord() helper.
//  2. StoryConfig.photoPlaceholderLabel / TeamConfig.members[].
//     photoPlaceholderLabel were defined on the type, settable by
//     create_funnel/the builder, but the PUBLIC RENDERER never actually
//     displayed them — a coach_consultant funnel's founder-photo
//     placeholder silently never appeared on the live page. Fixed by
//     wiring MediaPlaceholder into both section components (component-level
//     fix — this script verifies the DATA create_funnel produces is
//     correct; verifying the render itself needs a browser, since this
//     repo has no component-render test harness).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-lc1-quality-lock.mts

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Word-boundary-safe truncation, deterministic (no live call needed
// to reproduce — hand-feed the exact shape of sentence that broke live:
// a subheadline a few characters past the 140-char cap). ---

{
  // 141 chars — one character over the cap, ending mid-word at the exact
  // boundary a plain slice(0,140) would have cut through.
  const overlong =
    "PulseMetrics pulls revenue, orders, ad spend, and inventory into one real-time view — so you stop stitching spreadsheets together every morning.";
  const validated = cap.validate!({
    genre: "lead_gen",
    headline: "See Your Store's Numbers in One Dashboard",
    bullets: ["Real benefit one", "Real benefit two"],
    subheadline: overlong,
  });
  check("1a. Overlong subheadline proposal validates", validated.ok);
  if (validated.ok) {
    const sub = validated.args.subheadline as string;
    check("1b. Subheadline is capped at <=140 chars", sub.length <= 140, `len=${sub.length}`);
    // The character immediately after the kept text in the ORIGINAL string
    // must be a word boundary (space or end-of-string), never a mid-word
    // cut (found live 2026-08-03: "...every morn").
    const boundaryChar = overlong[sub.length];
    check(
      "1d. The cut point in the original text lands on a real word boundary",
      boundaryChar === undefined || boundaryChar === " ",
      `cut at index ${sub.length}, next char: ${JSON.stringify(boundaryChar)}`,
    );
    check("1e. No trailing partial word remains (e.g. 'morn')", !/\b(morn|goi|behin|mont)$/i.test(sub), sub);
  }
}
{
  // A short, in-budget subheadline must round-trip completely unchanged
  // (no over-eager truncation on normal-length copy).
  const validated = cap.validate!({
    genre: "lead_gen",
    headline: "Same-Day Chiropractic Care",
    bullets: ["Walk-ins welcome", "Insurance accepted"],
    subheadline: "A short, complete subheadline under the cap.",
  });
  check(
    "1f. A normal-length subheadline is preserved exactly, not altered",
    validated.ok && validated.args.subheadline === "A short, complete subheadline under the cap.",
  );
}
{
  // cta_banner_subtext shares the same 140-char risk (VSL genre).
  const overlong =
    "We provide job training and placement for formerly incarcerated adults and we need partners, employers, and supporters to keep this program going strong.";
  const validated = cap.validate!({
    genre: "vsl",
    headline: "A Second Chance Starts With a First Job",
    bullets: ["Real benefit one", "Real benefit two"],
    cta_banner_subtext: overlong,
  });
  check("1g. Overlong cta_banner_subtext proposal validates", validated.ok);
  if (validated.ok) {
    const sub = validated.args.ctaBannerSubtext as string;
    const boundaryChar = overlong[sub.length];
    check(
      "1h. cta_banner_subtext cuts on a real word boundary too",
      sub.length <= 140 && (boundaryChar === undefined || boundaryChar === " "),
      `len=${sub.length}, next char: ${JSON.stringify(boundaryChar)}`,
    );
  }
}

// --- 2. Placeholder data flow: story/team photo placeholders (the render
// fix itself needs a browser to verify — see script header). ---

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `lc1${Date.now()}`;
const AGENCY_ID = `test-agency-${RUN_ID}`;
const SUB_ID = `test-sa-${RUN_ID}`;
await db.doc(`agencies/${AGENCY_ID}`).set({ name: "Verify Agency", createdAt: new Date() });
await db.doc(`subAccounts/${SUB_ID}`).set({
  name: "Verify Sub-Account",
  agencyId: AGENCY_ID,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const user = await auth.createUser({ email: `lc1-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });
function fakeCtx(): AiSuiteActionContext {
  return { uid: user.uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId: AGENCY_ID, subAccountId: SUB_ID };
}

const createdFunnelIds: string[] = [];

try {
  // webinar is the one genre whose framework includes a "story" (Host)
  // stage — coach_consultant's founder_photo media strategy should
  // produce a real story.photoPlaceholderLabel + brief when no real photo
  // was given.
  const validated = cap.validate!({
    genre: "webinar",
    headline: "How We Book 20 Calls a Month Without Cold Outreach",
    bullets: ["Real benefit one", "Real benefit two"],
    visual_archetype: "coach_consultant",
    media_subject: "Me presenting at a live workshop",
    story_paragraphs: ["Why this works: real reasoning, not a fabricated case study."],
  });
  check("2a. Webinar + coach_consultant + media_subject proposal validates", validated.ok);
  if (validated.ok) {
    const result = await cap.execute!(fakeCtx(), validated.args);
    createdFunnelIds.push(result.ref!.id);
    const snap = await db.doc(`funnels/${result.ref!.id}`).get();
    const sections = snap.data()!.sections as { type: string; config: Record<string, unknown> }[];
    const story = sections.find((s) => s.type === "story");
    check("2b. Story section exists on the webinar framework", !!story);
    check(
      "2c. Story carries a real photoPlaceholderLabel + brief with the given subject (data the renderer now displays)",
      typeof story?.config.photoPlaceholderLabel === "string" &&
        (story.config.photoPlaceholderLabel as string).length > 0 &&
        typeof story?.config.photoPlaceholderBrief === "string" &&
        (story.config.photoPlaceholderBrief as string).includes("Me presenting at a live workshop"),
      JSON.stringify({ label: story?.config.photoPlaceholderLabel, brief: story?.config.photoPlaceholderBrief }),
    );
  }
} finally {
  for (const id of createdFunnelIds) await db.doc(`funnels/${id}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
