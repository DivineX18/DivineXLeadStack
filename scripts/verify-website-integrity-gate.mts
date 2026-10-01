/**
 * A WEBSITE WITH INVENTED FACTS IS NOT A FINISHED DELIVERABLE.
 *
 * gitpage's template fabricates testimonials, stats and program details, and
 * we cannot configure that away: it is a third-party generator. The audit
 * used to be advisory, so a flagged build still said "ready" and still showed
 * the live URL with the success treatment. A trial prospect reads that and
 * sends the link.
 *
 * These checks hold the line that the audit DECIDES the status, that an
 * unverifiable page is never promoted, and that nothing downstream, including
 * the assistant, describes a held build as live.
 */
import { readFileSync } from "node:fs";
import { assessPublishedSite } from "../src/lib/website/publish-gate";
import { auditGeneratedContent } from "../src/lib/website/content-audit";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const FABRICATED = `<html><body>
  <section><h2>What our customers say</h2>
    <blockquote>"Sarah Mitchell" said this changed everything.</blockquote></section>
  <div class="stats">450K+ Readers &middot; 4.8★ Rating &middot; 10K+ Lives Transformed</div>
  <p>30-day money-back guarantee, no questions asked.</p>
</body></html>`;
const CLEAN = `<html><body>
  <h1>Roof inspections in Houston</h1>
  <p>We run a fixed 25-point inspection and photograph every issue we find.</p>
  <ul><li>Free inspection</li><li>Written recommendation</li></ul>
</body></html>`;

console.log("\n1. The fixtures are what the test thinks they are");
check("the fabricated fixture really does trip the audit", auditGeneratedContent(FABRICATED).length > 0);
check("the clean fixture really does not", auditGeneratedContent(CLEAN).length === 0,
  JSON.stringify(auditGeneratedContent(CLEAN).map((f) => f.category)));

console.log("\n2. The audit decides the status");
const origFetch = globalThis.fetch;
const serve = (body: string | null, ok = true) => {
  globalThis.fetch = (async () =>
    body === null ? Promise.reject(new Error("unreachable")) : ({ ok, text: async () => body } as Response)) as typeof fetch;
};

serve(CLEAN);
const clean = await assessPublishedSite("https://example.test/s", { canRetry: true });
check("a clean page becomes ready", clean.outcome === "ready", clean.outcome);
check("a clean page records no flags", clean.contentFlags === null);
check("a clean page records no integrity reason", clean.integrityReason === null);

serve(FABRICATED);
const bad = await assessPublishedSite("https://example.test/s", { canRetry: true });
check("a fabricated page does NOT become ready", bad.outcome !== "ready", bad.outcome);
check("a fabricated page is held for review", bad.outcome === "needs_review");
check("the reason names fabrication", bad.integrityReason === "fabricated_content");
check("the specific claims are carried for correction",
  !!bad.contentFlags && bad.contentFlags.length > 0);

console.log("\n3. An unverifiable page is never promoted");
serve(null);
const retryable = await assessPublishedSite("https://example.test/s", { canRetry: true });
check("an unfetchable page asks for another poll rather than guessing",
  retryable.outcome === "retry", retryable.outcome);
serve(null);
const final = await assessPublishedSite("https://example.test/s", { canRetry: false });
check("on the last attempt it is held, not promoted", final.outcome === "needs_review", final.outcome);
check("and it says it could not be verified", final.integrityReason === "unverified");
serve("not found", false);
const notOk = await assessPublishedSite("https://example.test/s", { canRetry: false });
check("a non-200 page is held too", notOk.outcome === "needs_review", notOk.outcome);
const noUrl = await assessPublishedSite(null, { canRetry: true });
check("a missing URL is held, never ready", noUrl.outcome === "needs_review", noUrl.outcome);
globalThis.fetch = origFetch;

console.log("\n4. Both publish paths go through the gate");
const poll = readFileSync("src/app/api/sub-accounts/[id]/website/[siteId]/poll/route.ts", "utf8");
const pollNow = readFileSync("src/app/api/sub-accounts/[id]/website/[siteId]/poll-now/route.ts", "utf8");
for (const [name, src] of [["poll", poll], ["poll-now", pollNow]] as const) {
  check(`${name} calls the gate`, src.includes("assessPublishedSite("));
  // The literal that used to promote unconditionally.
  check(`${name} never hardcodes status: "ready"`, !/status:\s*"ready"/.test(src));
  check(`${name} writes the gate's outcome`, /status:\s*integrity\.outcome/.test(src));
  check(`${name} keeps the work`, /liveUrl:\s*pollResult\.pagesUrl/.test(src));
}

console.log("\n5. Nothing downstream calls a held build live");
const cap = readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
const i = cap.indexOf('const detail =\n          status === "ready" && w.liveUrl');
const block = cap.slice(i, i + 1400);
check("the assistant branch for needs_review exists", block.includes('status === "needs_review"'));
check("the assistant does not report a held build as live",
  !/needs_review[\s\S]{0,80}`live at/.test(block));
check("the assistant is told to say it is not shareable",
  /NOT ready to share|not confirmed safe to share/.test(block));
const svc = readFileSync("src/lib/server/websites-service.ts", "utf8");
check("wasPublished still requires ready", /wasPublished: doc\.status === "ready"/.test(svc));
const ui = readFileSync("src/components/website/website-builder.tsx", "utf8");
check("the UI only offers Visit on a ready build",
  /\{status === "ready" && liveUrl && \(\s*<Button/.test(ui));
check("the UI renders a needs_review state", ui.includes('status === "needs_review" && ('));
check("the old optional wording is gone", !ui.includes("Review before sharing the link"));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
