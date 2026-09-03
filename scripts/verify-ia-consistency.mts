/**
 * IA CONSISTENCY — P0.3 / U2.
 *
 * Two jobs:
 *   1. the navigation registry matches the LOCKED customer IA;
 *   2. no customer-facing string tells someone to click a destination that
 *      does not exist in that IA.
 *
 * A one-time grep would not hold — the point of a regression check is that
 * reintroducing a deprecated destination FAILS rather than quietly shipping.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-ia-consistency.mts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const { ASCEND_LIFECYCLE_SECTIONS } = await import("../src/types/ascend-shell.ts");

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// ── 1. The registry IS the locked IA ─────────────────────────────────────
const EXPECTED = ["home", "create", "leads", "performance", "intelligence", "settings"];
check("1. Lifecycle sections match the locked IA", JSON.stringify([...ASCEND_LIFECYCLE_SECTIONS]) === JSON.stringify(EXPECTED),
  JSON.stringify([...ASCEND_LIFECYCLE_SECTIONS]));

// ── 2. Deprecated top-level concepts are gone from the registry ─────────
const DEPRECATED = ["campaigns", "crm", "brand"];
for (const d of DEPRECATED) {
  check(`2. "${d}" is not a top-level section`, !(ASCEND_LIFECYCLE_SECTIONS as readonly string[]).includes(d));
}

// ── 3. No customer-facing string names a destination outside the IA ─────
// "Sidebar → X" phrasing described the legacy Flow shell. Any survivor is a
// customer being told to click something that is not there.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}
const files = [...walk("src/lib"), ...walk("src/components")];
const offenders: string[] = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/"[^"]*Sidebar\s*(?:→|->)\s*([A-Za-z ]+)/g)) {
    offenders.push(`${f}: Sidebar → ${m[1].trim()}`);
  }
}
check("3. No customer-facing string uses legacy 'Sidebar → X' guidance", offenders.length === 0,
  offenders.slice(0, 3).join(" | "));

// ── 4. Deprecated destinations are not offered as customer guidance ─────
// Guards the specific regression the owner named: nav guidance drifting back
// to "Campaigns", "CRM" or "Brand" as top-level places to go.
const navGuidance: string[] = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/"[^"]*(?:go to|under|open|find it in|head to)\s+(Campaigns|CRM|Brand & Assets)\b[^"]*"/gi)) {
    navGuidance.push(`${f}: ${m[0].slice(0, 70)}`);
  }
}
check("4. No guidance points at deprecated top-level destinations", navGuidance.length === 0,
  navGuidance.slice(0, 3).join(" | "));

// ── 5. Removed LIFECYCLE names are not offered as destinations ──────────
//
// GAP THIS CLOSES. Check 4 only matched inside double-quoted strings, and
// only listed Campaigns/CRM/Brand. Human acceptance found customer-visible
// copy reading "run a Growth Scan or CRO Audit under Identify" — JSX TEXT
// CONTENT, naming a lifecycle destination P0.3 deleted. It sent customers to
// a place that no longer exists in the navigation, and every source-level
// check passed.
//
// So this scans raw source (quoted or not) and covers the removed lifecycle
// vocabulary. The navigational preposition is required because "grow",
// "scale" and "launch" are ordinary English words that appear legitimately
// in marketing copy — only "…under Identify"-shaped guidance is a defect.
const REMOVED_LIFECYCLE = "Identify|Launch|Grow|Optimize|Scale";
const lifecycleGuidance: string[] = [];
for (const f of files) {
  // Strip comments FIRST. A comment legitimately discusses the old IA — this
  // very check's own rationale does — and matching that would fail for the
  // wrong reason. Handles JSX `{/* … */}` too, which a line-prefix test
  // misses because the line begins with `{`.
  const code = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  for (const m of code.matchAll(
    new RegExp(`(?:go to|under|open|find it in|head to|from|in)\\s+(?:${REMOVED_LIFECYCLE})\\b(?!\\s*(?:ing|s\\b))`, "g"),
  )) {
    lifecycleGuidance.push(`${f}: …${m[0]}…`);
  }
}
check("5. No customer copy sends users to a removed lifecycle destination",
  lifecycleGuidance.length === 0, lifecycleGuidance.slice(0, 3).join(" | "));

console.log(`\n${bad === 0 ? "IA CONSISTENT" : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
