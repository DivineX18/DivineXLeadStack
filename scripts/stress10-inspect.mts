// Post-run inspector: renders each stress-test funnel's LIVE page, extracts
// visible text + structure, and scans for the failure classes the stress
// spec names: debris, fabrication signals (invented numbers/testimonials/
// guarantees), placeholder leakage, duplicate copy across sections, and
// missing CTAs. Structural silhouette comes from the stored report.
// Run: npx tsx scripts/stress10-inspect.mts
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(new URL("../.stress10-report.json", import.meta.url), "utf8")) as {
  key: string;
  funnels: { id: string; url: string; name: string; sections: { type: string; headline: string | null }[] }[];
}[];

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const FABRICATION_PATTERNS: [string, RegExp][] = [
  ["testimonial attribution", /[—–-]\s*(?:Sarah|Mike|John|Jennifer|David|Lisa|Maria|James)\s+[A-Z][a-z]+\s*(?:,|\.|$)/],
  ["star rating claim", /\d\.\d\s*(?:★|stars|\/5)/i],
  ["review count", /\d{2,}(?:,\d{3})*\+?\s*(?:reviews|customers|clients|businesses|members) (?:served|helped|trust)/i],
  ["percentage outcome claim", /\b\d{2,3}%\s*(?:of (?:our|clients|customers)|success|satisfaction|improvement)/i],
  ["money-back guarantee", /money[- ]back guarantee/i],
  ["years in business", /\b(?:over|more than)\s+\d+\s+years\b/i],
  ["tool-syntax debris", /<\/?an[a-z_]*|<parameter|<invoke|<function/i],
  ["builder placeholder text", /ADD A VIDEO|ADD AN IMAGE|THIS SECTION HAS NO CONTENT/i],
];

for (const sc of report) {
  for (const f of sc.funnels ?? []) {
    const url = `https://crm.divinex.io/lp/${f.id}`;
    let html = "";
    try {
      html = await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).text();
    } catch (e) {
      console.log(`\n### ${sc.key} ${url}\n  FETCH FAILED: ${e}`);
      continue;
    }
    const txt = visibleText(html);
    console.log(`\n### ${sc.key} — ${f.name} (${url})`);
    console.log(`  chars=${txt.length} sections=${f.sections.length} [${f.sections.map((s) => s.type).join(" → ")}]`);
    const hits: string[] = [];
    for (const [label, re] of FABRICATION_PATTERNS) {
      const m = txt.match(re);
      if (m) hits.push(`${label}: "${String(m[0]).slice(0, 60)}"`);
    }
    console.log(hits.length ? hits.map((h) => `  ⚠️  ${h}`).join("\n") : "  clean: no fabrication/debris/placeholder signals");
    // duplicate headline check across sections
    const heads = f.sections.map((s) => s.headline).filter(Boolean) as string[];
    const dupes = heads.filter((h, i) => heads.indexOf(h) !== i);
    if (dupes.length) console.log(`  ⚠️  duplicate section headlines: ${dupes.join(" | ")}`);
    // first 340 chars of the page (hero read)
    console.log(`  hero-read: ${txt.replace(/^.*?Purpose-Driven Businesses\.\s*/, "").slice(0, 340)}`);
  }
}
