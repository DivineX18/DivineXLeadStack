/**
 * NO EM DASHES, ANYWHERE A CUSTOMER READS.
 *
 * Two halves have to hold together. The static copy in this repo must not
 * contain the character, and generated text must not be able to reintroduce
 * it, because a rule that lives only in a prompt stops applying the moment
 * someone edits the prompt.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-em-dash.mts
 */
import fs from "node:fs";
import path from "node:path";
import { stripEmDashes, EmDashStream } from "../src/lib/text/dedash";

const EM = "—";
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`.replace(EM, "-"));
  if (!ok) fails++;
};

console.log("── the character never survives ──");
ck("a plain sentence is cleaned", !stripEmDashes(`one ${EM} two`).includes(EM));
ck("the html entity is cleaned too", !stripEmDashes("one &mdash; two").includes(EM));
ck("&mdash; leaves no entity behind", !stripEmDashes("one &mdash; two").includes("&mdash;"));
ck("many in one string all go",
  !stripEmDashes(`a ${EM} b ${EM} c. d ${EM} e ${EM} f. g ${EM} h`).includes(EM));
ck("text without one is returned untouched",
  stripEmDashes("nothing to do here") === "nothing to do here");
ck("empty input is safe", stripEmDashes("") === "");
ck("the result is stable when run twice",
  stripEmDashes(stripEmDashes(`a ${EM} b`)) === stripEmDashes(`a ${EM} b`));

console.log("\n── the replacement is grammatical, not a different dash ──");
const cases: [string, string][] = [
  [`your data ${EM} contacts, pipeline, everything ${EM} stays put`,
   "your data (contacts, pipeline, everything) stays put"],
  [`Get Started ${EM} $77/mo`, "Get Started - $77/mo"],
  [`Yes ${EM} every plan includes support.`, "Yes, every plan includes support."],
  [`stored on the contact ${EM} so the source is answerable`,
   "stored on the contact, so the source is answerable"],
  [`availability varies by plan ${EM} every plan includes the core CRM.`,
   "availability varies by plan. Every plan includes the core CRM."],
  [`not deleted on cancellation ${EM} export it as a CSV`,
   "not deleted on cancellation. Export it as a CSV"],
  [`Today, Overdue, Upcoming, Done ${EM} linked to the contact they belong to`,
   "Today, Overdue, Upcoming, Done, linked to the contact they belong to"],
];
for (const [input, want] of cases) {
  const got = stripEmDashes(input);
  ck(`"${want.slice(0, 46)}…"`, got === want, got === want ? "" : `got "${got}"`);
}
ck("no dash is swapped for another dash",
  !/[–‒―]/.test(stripEmDashes(`a ${EM} b`)));

console.log("\n── it is safe on the shapes it actually runs against ──");
{
  const json = JSON.stringify({ headline: `Fast ${EM} and honest`, price: 77 });
  const cleaned = stripEmDashes(json);
  let parsed: { headline: string; price: number } | null = null;
  try { parsed = JSON.parse(cleaned); } catch { /* left null */ }
  ck("a JSON payload still parses after cleaning", parsed !== null);
  ck("the JSON value is cleaned", parsed !== null && !parsed.headline.includes(EM));
  ck("non-string JSON values are untouched", parsed?.price === 77);
}
{
  // Indentation is content in markdown and in code fences.
  const md = `  - a point ${EM} explained\n    nested line`;
  ck("leading indentation survives", stripEmDashes(md).startsWith("  - a point"));
  ck("newlines survive", stripEmDashes(md).includes("\n    nested"));
}
{
  const long = Array.from({ length: 600 }, (_, i) => `x${i} ${EM} y${i}.`).join(" ");
  const out = stripEmDashes(long);
  ck("a very long body is fully cleaned, not cut off by the loop guard",
    !out.includes(EM));
}

console.log("\n── streaming cannot leak one through a chunk boundary ──");
{
  const full = `Here is the plan ${EM} it starts with the diagnosis, and your data ${EM} contacts, deals ${EM} stays put.`;
  for (const size of [1, 3, 7, 40]) {
    const s = new EmDashStream();
    let out = "";
    for (let i = 0; i < full.length; i += size) out += s.push(full.slice(i, i + size));
    out += s.flush();
    ck(`chunk size ${size}: no dash leaks`, !out.includes(EM));
    ck(`chunk size ${size}: matches the non-streamed result`,
      out === stripEmDashes(full), out === stripEmDashes(full) ? "" : `got "${out}"`);
  }
  const empty = new EmDashStream();
  ck("flushing an untouched stream yields nothing", empty.flush() === "");
}

console.log("\n── the boundary is wired, so no prompt can opt out ──");
{
  const wired: [string, string][] = [
    ["src/lib/comms/ai/openrouter.ts", "text: stripEmDashes(text)"],
    ["src/lib/ai-suite/model.ts", "stripEmDashes(text)"],
  ];
  for (const [f, needle] of wired) {
    ck(`${f} sanitises its output`, fs.readFileSync(f, "utf8").includes(needle));
  }
  const mod = fs.readFileSync("src/lib/text/dedash.ts", "utf8");
  ck("the rule module holds no literal em dash of its own", !mod.includes(EM));
}

console.log("\n── no em dash remains in this repo's own copy ──");
{
  const offenders: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", "dist"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx|ts)$/.test(e.name)) continue;
      const lines = fs.readFileSync(p, "utf8").split("\n");
      let inBlock = false;
      lines.forEach((line, i) => {
        const was = inBlock, t = line.trim();
        if (!inBlock && t.startsWith("/*") && !t.includes("*/")) inBlock = true;
        else if (inBlock && line.includes("*/")) inBlock = false;
        const isComment = was || inBlock || t.startsWith("//") ||
          t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
        // A regex that PARSES an em dash out of inbound text has to keep it.
        const isParser = /\/[^\n]*\[[^\]]*—/.test(line) ||
          /replace\(\s*\//.test(line) || /split\(\s*\//.test(line) || /match\(\s*\//.test(line);
        if (!isComment && !isParser && line.includes(EM)) {
          offenders.push(`${p}:${i + 1} ${t.slice(0, 80)}`);
        }
      });
    }
  };
  walk("src");
  ck("no user-visible string contains one", offenders.length === 0,
    offenders.slice(0, 5).join(" | "));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
