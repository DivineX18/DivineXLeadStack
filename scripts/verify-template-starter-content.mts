/**
 * Authored templates must ship structure, and must never ship proof.
 *
 * Run: npx tsx scripts/verify-template-starter-content.mts
 *
 * The banned-pattern check is the important one: it fails if any placeholder
 * could be read by a visitor as a fact about the business (a rating, a client
 * count, a credential, a price).
 */
process.env.DATABASE_URL ??= "postgresql://u:u@127.0.0.1:1/u";
const { starterConfigFor } = await import("../src/lib/funnels/template-starter-content.ts");
const { FUNNEL_TEMPLATES } = await import("../src/lib/funnels/templates.ts");
const { buildFrameworkSections } = await import("../src/lib/funnels/frameworks.ts");
let fails = 0; const ck = (n, ok, d="") => { console.log(`${ok?"PASS":"FAIL"}  ${n}${d?` — ${d}`:""}`); if(!ok) fails++; };

const BANNED = /\b(\d+[\d,]*\s*(customers|clients|reviews|years)|\d(\.\d)?\s*stars?|award[- ]winning|certified|licensed|ISO|\$\d)/i;
let filled = 0, total = 0, banned = [];
for (const t of FUNNEL_TEMPLATES) {
  const secs = buildFrameworkSections(t.genre, t.depth, t.complexity);
  for (const sec of secs) {
    const type = typeof sec === "string" ? sec : sec.type;
    total++;
    const c = starterConfigFor(type, t);
    if (c) { filled++; const j = JSON.stringify(c); const m = j.match(BANNED); if (m) banned.push(`${t.id}/${type}: ${m[0]}`); }
  }
}
console.log(`\ntemplates: ${FUNNEL_TEMPLATES.length}  sections: ${total}  seeded: ${filled}  left empty: ${total-filled}\n`);
ck("most sections now carry starter structure", filled / total > 0.5, `${Math.round(filled/total*100)}%`);
ck("no fabricated proof anywhere", banned.length === 0, banned.join(" | "));
ck("proof_strip stays empty", starterConfigFor("proof_strip", FUNNEL_TEMPLATES[0]) === null);
ck("trust_badges stays empty", starterConfigFor("trust_badges", FUNNEL_TEMPLATES[0]) === null);
ck("video stays empty", starterConfigFor("video", FUNNEL_TEMPLATES[0]) === null);
const emer = FUNNEL_TEMPLATES.find(t => /emergency/i.test(t.id));
const ec = starterConfigFor("cta_banner", emer);
ck("emergency template gets a call-first CTA", /Call now/i.test(JSON.stringify(ec)), JSON.stringify(ec));
ck("emergency FAQ is intent-specific", /how quickly can you get here/i.test(JSON.stringify(starterConfigFor("faq", emer))));
const magnet = FUNNEL_TEMPLATES.find(t => t.genre === "lead_magnet");
ck("lead magnet FAQ differs from emergency", JSON.stringify(starterConfigFor("faq", magnet)) !== JSON.stringify(starterConfigFor("faq", emer)));
ck("testimonial placeholder instructs, never quotes", /Paste a real customer quote/i.test(JSON.stringify(starterConfigFor("testimonials", emer))));
ck("generic 'Ready?' banner replaced", !/"headline":"Ready\?"/.test(JSON.stringify(starterConfigFor("cta_banner", magnet))));
console.log(fails===0?"\nALL PASS":`\n${fails} FAILED`);
process.exit(fails?1:0);
