/**
 * One call builds three things, so a repeated call builds three more.
 *
 * create_funnel creates a funnel, its capture form AND its follow-up workflow
 * together, and had no idempotency of any kind. When Zeno asks a clarifying
 * question before building and the customer answers, the capability is emitted
 * a second time and a second complete set appears under identical names.
 *
 * QA hit exactly that and could not publish: two identically-named workflows
 * existed, the live one was whichever had been activated, and the other sat
 * hidden behind it. The system prompt deliberately routes a genuinely missing
 * business fact to a clarifying question, so this path is designed for rather
 * than rare.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-duplicate-guard.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  if (ok) console.log(`PASS  ${n}`);
  else { fails++; console.log(`FAIL  ${n}${d ? ` | ${d}` : ""}`); }
};
const read = (f: string) => readFileSync(f, "utf8");
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CAPS = "src/lib/ai-suite/capabilities.ts";
const GUARD = "src/lib/funnels/duplicate-guard.ts";

console.log("-- nothing is created before the check --");
{
  const caps = code(CAPS);
  const start = caps.indexOf('name: "create_funnel"');
  const exec = caps.slice(caps.indexOf("execute:", start));

  const guardAt = exec.indexOf("findRecentFunnelByName");
  const createAt = exec.indexOf("createFunnelServerSide(");
  ck("the guard exists", guardAt >= 0);
  ck("and runs BEFORE the funnel, form or workflow are created",
    guardAt >= 0 && createAt > guardAt, `guard@${guardAt} create@${createAt}`);

  // MUTATION — ordering is the whole property, so the predicate is applied to
  // the real file AND to a synthetic where the two are reversed. A guard that
  // ran after the create would be detecting the duplicate it had just made.
  const guardComesFirst = (src: string) => {
    const g = src.indexOf("findRecentFunnelByName");
    const c = src.indexOf("createFunnelServerSide(");
    return g >= 0 && c > g;
  };
  ck("MUTATION: the same check fails when the order is reversed",
    guardComesFirst(exec) &&
      !guardComesFirst("const id = await createFunnelServerSide({});\nawait findRecentFunnelByName(sa, name);"));

  // Refuses rather than silently returning the first funnel: the customer
  // asked for a funnel and one exists they have not seen, so naming it lets
  // them go look. Returning it quietly reads as "built".
  ck("it refuses with the existing funnel's id, rather than silently reusing it",
    /CapabilityUserError\([\s\S]{0,400}recentTwin\.id/.test(exec));
  ck("and tells them how to genuinely get a second one",
    /different name/i.test(exec));
}

console.log("\n-- the window is time-bounded, not absolute --");
{
  const { DUPLICATE_FUNNEL_WINDOW_MS } = await import("../src/lib/funnels/duplicate-guard.ts");
  ck("a duplicate window is exported and finite",
    typeof DUPLICATE_FUNNEL_WINDOW_MS === "number" && DUPLICATE_FUNNEL_WINDOW_MS > 0 && Number.isFinite(DUPLICATE_FUNNEL_WINDOW_MS));
  // Long enough to cover a clarifying exchange, short enough that a real
  // second "Spring Promo" next quarter is never refused.
  ck("it is minutes, not forever",
    DUPLICATE_FUNNEL_WINDOW_MS >= 60_000 && DUPLICATE_FUNNEL_WINDOW_MS <= 6 * 60 * 60 * 1000,
    String(DUPLICATE_FUNNEL_WINDOW_MS));

  const svc = code(GUARD);
  ck("MUTATION: the time filter is applied, so an old namesake is not refused",
    /DUPLICATE_FUNNEL_WINDOW_MS/.test(svc) && /now - toMillis\(f\.createdAt\)/.test(svc));

  // The model regenerates the name from the same brief, so a re-emission
  // differs by capitalisation or spacing at most.
  ck("names compare case- and space-insensitively",
    /\.trim\(\)\.toLowerCase\(\)/.test(svc));

  // Tenancy: a namesake in another workspace is not this workspace's problem.
  ck("the lookup is scoped to the one workspace",
    /\.where\("subAccountId", "==", subAccountId\)/.test(svc.slice(svc.indexOf("findRecentFunnelByName"))));

  // Equality-only, so no composite index is needed to deploy this.
  const fn = svc.slice(svc.indexOf("export async function findRecentFunnelByName"));
  ck("MUTATION: no range query that would demand a new composite index",
    !/\.where\([^)]*">="|\.where\([^)]*"<="|orderBy\(/.test(fn));

  ck("an empty name matches nothing rather than everything",
    /if \(!wanted\) return null;/.test(fn));
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
