/**
 * BUG-001 — Home's "Recommended Next Step" card, empty-recommendation state
 * (no CRO audit recommendation to show yet): must render four quick-start
 * actions pointing at the product's real top-level destinations, not a bare
 * line of unclickable text.
 *
 * Production QA (2026-10-24) couldn't exercise this path live because the
 * workspace used for retesting had accumulated real recommendations from
 * prior QA activity — resetting or contaminating that production workspace
 * just to reproduce an empty state was explicitly out of scope. The
 * component itself is pure and presentational (`action: CroAuditRecommendation
 * | null` in, JSX out) — no Firestore read, no network call, no browser
 * needed to exercise the branch deterministically. This is that coverage,
 * structural/source-level per this repo's scripts/ convention (no
 * React-rendering test infra — jsdom/testing-library/vitest — is installed,
 * and installing one for a single four-link list would be the "broad
 * browser harness" this check is explicitly meant to avoid).
 *
 * Run: npx tsx scripts/verify-recommendation-card-empty-state.mts
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const src = read("src/components/ascend/recommendation-card.tsx");

// ── 1. The empty branch is real: action === null renders QuickStartLinks,
// not just the old bare text line ──────────────────────────────────────────
check(
  "1a. RecommendedNextActionCard renders <QuickStartLinks /> when action is falsy (the ternary's else branch)",
  /\{action \? \(\s*<RecommendationRow rec=\{action\} \/>\s*\) : \(/.test(src) && /<QuickStartLinks \/>/.test(src),
);
check(
  "1b. the real recommendation branch is untouched -- action truthy still renders the row, not the quick-start list",
  /<RecommendationRow rec=\{action\} \/>/.test(src),
);

// ── 2. Exactly four quick-start entries, each a real {label, description, href} ──
const listMatch = src.match(/const QUICK_START_LINKS: \{[^}]+\}\[\] = \[([\s\S]*?)\];/);
check("2a. QUICK_START_LINKS array found", !!listMatch);
const entries = listMatch ? [...listMatch[1].matchAll(/\{ label: "([^"]+)", description: "[^"]+", href: "([^"]+)" \}/g)] : [];
check("2b. exactly four quick-start entries", entries.length === 4);

// ── 3. Each href is the product's real canonical top-level destination, and
// a route genuinely exists there -- catches silent drift from a renamed
// section before a customer would hit a 404 from this exact card. ──────────
const EXPECTED: Record<string, string> = {
  "Ask Zeno": "/zeno",
  "Run a Growth Scan": "/intelligence",
  "Build something": "/create",
  "Your contacts": "/leads",
};
for (const [label, expectedHref] of Object.entries(EXPECTED)) {
  const found = entries.find((e) => e[1] === label);
  check(`3. "${label}" is present with href="${expectedHref}"`, !!found && found[2] === expectedHref);
}

// ── 4. Each destination is a real page in THIS app (not a dangling link) ──
const ROUTE_DIRS: Record<string, string> = {
  "/zeno": "src/app/app/zeno/page.tsx",
  "/intelligence": "src/app/app/intelligence/page.tsx",
  "/create": "src/app/app/create/page.tsx",
  "/leads": "src/app/app/leads/page.tsx",
};
for (const [href, pagePath] of Object.entries(ROUTE_DIRS)) {
  check(`4. ${href} resolves to a real page.tsx (${pagePath})`, existsSync(new URL(`../${pagePath}`, import.meta.url)));
}

// ── 5. MUTATION guard: the links actually render as real anchors, not
// inert text -- a plain <span> swap would pass every check above but still
// reproduce the original bug (no clickable action). ────────────────────────
check(
  "5. QuickStartLinks renders each entry as a real <Link href={q.href}>, not inert text",
  /<Link\s+key=\{q\.href\}\s+href=\{q\.href\}/.test(src),
);

console.log(
  failures === 0
    ? `\nverify-recommendation-card-empty-state: all checks passed`
    : `\nverify-recommendation-card-empty-state: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
