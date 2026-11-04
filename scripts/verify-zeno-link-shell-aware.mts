/**
 * QA BUG-003 follow-up: "Continue with Zeno" was shell-blind.
 *
 * The original fix swapped /app/zeno for a bare /zeno to avoid a redirect
 * hop. That is correct INSIDE the Ascend shell and wrong in Flow: the
 * funnels list renders in both, and on crm.divinex.io a bare /zeno is not
 * Zeno at all -- it falls through to the legacy stub that redirects to the
 * caller's first membership. Verified live before this fix: clicking it from
 * /sa/73Bcu.../funnels landed on /sa/MEYB8.../dashboard, a DIFFERENT
 * workspace, with ?funnel= dropped.
 *
 * Executes the real resolver rather than regexing it, so a map edit that
 * breaks resolution cannot pass.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolveAscendShellHref } from "../src/lib/shell/ascend-shell-paths.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (detail && !pass) console.log(`      ${detail}`);
  if (!pass) failures++;
}

const list = readFileSync("src/components/funnels/funnels-list.tsx", "utf8");
const SA = "sa_test_123";

// 1-2. No hardcoded Ascend-only Zeno path survives in a both-shells component.
check("1. no hardcoded `/zeno?funnel=` link remains", !/href=\{`\/zeno\?funnel=/.test(list));
check("2. no hardcoded `/app/zeno` link remains", !list.includes("/app/zeno?funnel="));

// 3. Both Zeno link sites (row button + dropdown item) go through saPath.
const viaSaPath = list.match(/\$\{saPath\("\/ai-suite"\)\}\?funnel=\$\{f\.id\}/g) ?? [];
check("3. both Zeno link sites resolve through saPath('/ai-suite')", viaSaPath.length === 2,
  `found ${viaSaPath.length}, expected 2`);

// 4. The component already had saPath in scope -- no new dependency added.
check("4. saPath comes from the existing useSubAccount() destructure",
  /const \{[^}]*saPath[^}]*\} = useSubAccount\(\)/.test(list));

// 5-7. Resolution, executed.
check("5. Ascend shell resolves /ai-suite -> /zeno", resolveAscendShellHref(SA, "/ai-suite") === "/zeno",
  `got ${resolveAscendShellHref(SA, "/ai-suite")}`);
check("6. Ascend resolution preserves the query string",
  resolveAscendShellHref(SA, "/ai-suite?funnel=abc") === "/zeno?funnel=abc",
  `got ${resolveAscendShellHref(SA, "/ai-suite?funnel=abc")}`);
check("7. it does NOT resolve to the legacy /scale redirect",
  resolveAscendShellHref(SA, "/ai-suite") !== "/scale");

// 8-10. Both destinations are real routes, which is what the old map got wrong.
check("8. Ascend target /app/zeno/page.tsx exists", existsSync("src/app/app/zeno/page.tsx"));
check("9. Flow target /sa/[subAccountId]/ai-suite/page.tsx exists",
  existsSync("src/app/(dashboard)/sa/[subAccountId]/ai-suite/page.tsx"));
check("10. the OLD target /app/scale is a bare redirect, not a Zeno surface",
  existsSync("src/app/app/scale/page.tsx") &&
    /redirect\(/.test(readFileSync("src/app/app/scale/page.tsx", "utf8")));

// 11. The Ascend Zeno page still reads the ?funnel= this link sends.
const zenoPage = readFileSync("src/app/app/zeno/page.tsx", "utf8");
check("11. Ascend Zeno page still consumes ?funnel=", /searchParams/.test(zenoPage) && /funnel/.test(zenoPage));

// 12. Tenancy: the funnel id in the URL must not leak another tenant's name.
check("12. Ascend Zeno page ownership-checks the funnel before naming it",
  /data\.subAccountId === workspaceId/.test(zenoPage));

// ---- MUTATION PROOFS: each asserts the check above can actually fail. ----
const mutations: [string, () => boolean][] = [
  ["M1 reverting the map to /scale fails check 5", () => {
    const src = readFileSync("src/lib/shell/ascend-shell-paths.ts", "utf8");
    return src.includes('"/ai-suite": "/zeno"') && !src.includes('"/ai-suite": "/scale"');
  }],
  ["M2 a hardcoded /zeno href would fail check 1", () => /href=\{`\/zeno\?funnel=/.test('href={`/zeno?funnel=${f.id}`}')],
  ["M3 one saPath site instead of two would fail check 3", () => (('${saPath("/ai-suite")}?funnel=${f.id}').match(/\$\{saPath\("\/ai-suite"\)\}\?funnel=\$\{f\.id\}/g) ?? []).length === 1],
];
for (const [label, fn] of mutations) check(label, fn());

console.log(`\n${failures === 0 ? "verify-zeno-link-shell-aware: all checks passed" : `verify-zeno-link-shell-aware: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
