/**
 * TEMPLATE LIBRARY (V1 requirement 7).
 *
 * The claim being certified is not "there are 24 entries". It is that the
 * library is a library: structurally varied, honest, and producing pages that
 * are ordinary funnels the moment they exist, so they publish, edit and get
 * critiqued exactly like everything else.
 *
 * The failure this guards against is 25 recolours of one page. So the catalog
 * is checked for real architectural spread, and one template of each genre is
 * actually BUILT against real Firestore and inspected: does it get the genre's
 * own section sequence, does the starter copy land, is it a draft.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { FUNNEL_TEMPLATES, getFunnelTemplate, templateIndustries } = await import("../src/lib/funnels/templates.ts");
const { createFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// ------------------------------------------------------------- the catalog
check("the library is launch-sized (20 to 30)",
  FUNNEL_TEMPLATES.length >= 20 && FUNNEL_TEMPLATES.length <= 30, String(FUNNEL_TEMPLATES.length));
check("every id is unique", new Set(FUNNEL_TEMPLATES.map((t) => t.id)).size === FUNNEL_TEMPLATES.length);

const genres = new Set(FUNNEL_TEMPLATES.map((t) => t.genre));
const packs = new Set(FUNNEL_TEMPLATES.map((t) => t.designPack));
check("structural variation is real, not cosmetic (5+ page architectures)", genres.size >= 5,
  [...genres].join(", "));
check("visual variation is real (5+ design systems)", packs.size >= 5, [...packs].join(", "));
check("no single architecture dominates the library",
  Math.max(...[...genres].map((g) => FUNNEL_TEMPLATES.filter((t) => t.genre === g).length)) <= FUNNEL_TEMPLATES.length / 2);
check("high-value industries are covered", templateIndustries().length >= 15, String(templateIndustries().length));

// Honesty. A template cannot know a business's numbers, awards or customers,
// so it must never carry a claim that implies it does.
const FABRICATED = /\b\d+(,\d{3})*\+?\s*(customers|clients|reviews|users|members|businesses)\b|\b\d(\.\d)?\s*star|award[- ]winning|#1\b|\bvoted best\b|\bas seen (on|in)\b|\btrusted by\b|\b\d+% (increase|more|growth)/i;
const PLACEHOLDER = /\[[^\]]*\]|\byour company name here\b|lorem ipsum|xxx|tbd|todo/i;
for (const t of FUNNEL_TEMPLATES) {
  const copy = `${t.name} ${t.description} ${t.headline} ${t.subheadline} ${t.ctaLabel} ${t.structure}`;
  if (FABRICATED.test(copy)) { check(`"${t.name}" invents no proof`, false, copy.match(FABRICATED)![0]); bad--; bad++; }
  if (PLACEHOLDER.test(copy)) { check(`"${t.name}" has no bracketed placeholder`, false, copy.match(PLACEHOLDER)![0]); }
}
check("no template fabricates social proof or statistics",
  !FUNNEL_TEMPLATES.some((t) => FABRICATED.test(`${t.headline} ${t.subheadline} ${t.description}`)));
check("no template ships bracketed placeholder copy",
  !FUNNEL_TEMPLATES.some((t) => PLACEHOLDER.test(`${t.headline} ${t.subheadline} ${t.ctaLabel}`)));
check("no em dash in customer-facing template copy",
  !FUNNEL_TEMPLATES.some((t) => /—/.test(`${t.name} ${t.description} ${t.headline} ${t.subheadline} ${t.ctaLabel} ${t.structure}`)));
check("every card states its structure, so the difference is visible before choosing",
  FUNNEL_TEMPLATES.every((t) => t.structure.split(",").length >= 3));
check("every template names a real outcome, not a mechanism",
  FUNNEL_TEMPLATES.every((t) => t.headline.length > 12 && t.subheadline.length > 30 && t.ctaLabel.length > 3));
check("an unknown id is not silently resolved", getFunnelTemplate("no-such-template") === undefined);

// ------------------------------------------------ one build per architecture
// Building one of EACH genre proves the pairing produces the genre's real
// structure rather than the same page with different words.
const built: string[] = [];
const seen = new Map<string, string[]>();
try {
  for (const genre of genres) {
    const t = FUNNEL_TEMPLATES.find((x) => x.genre === genre)!;
    const id = await createFunnelServerSide({
      subAccountId: SA, createdByUid: OWNER,
      name: `[E2E template] ${t.name}`,
      genre: t.genre, designPack: t.designPack,
      ...(t.depth ? { depth: t.depth } : {}),
      ...(t.complexity ? { complexity: t.complexity } : {}),
    });
    built.push(id);
    const doc = (await db.doc(`funnels/${id}`).get()).data() as {
      status?: string; sections?: { type: string }[]; subAccountId?: string; accentColor?: string;
    };
    const types = (doc.sections ?? []).map((s) => s.type);
    seen.set(t.id, types);
    // The lead-magnet framework is a deliberate ONE-FOLD page: the hero
    // captures directly, because an email-for-asset trade converts worse with
    // scroll between the ask and the field. Every other architecture must be a
    // full page. The card's structure line is checked against this below, so a
    // one-fold template can never advertise sections it does not have.
    const minSections = t.genre === "lead_magnet" ? 1 : 3;
    check(`"${t.name}" builds a real page`, types.length >= minSections, `${types.length} sections`);
    if (types.length === 1) {
      check(`"${t.name}" tells the operator it is one fold`, /one fold/i.test(t.structure), t.structure);
    }
    check(`"${t.name}" is a DRAFT, never live on creation`, doc.status === "draft", String(doc.status));
    check(`"${t.name}" belongs to this workspace only`, doc.subAccountId === SA);
    check(`"${t.name}" carries a capture or action surface`,
      types.some((x) => ["hero", "offer", "ticket_tiers", "checkout", "multi_step_form"].includes(x)));
  }

  // The real anti-recolour test: two different architectures must not produce
  // the same section sequence.
  const sequences = [...seen.values()].map((v) => v.join(">"));
  check("different templates produce genuinely different page structures",
    new Set(sequences).size === sequences.length, `${new Set(sequences).size} distinct of ${sequences.length}`);
} finally {
  await Promise.all(built.map((id) => db.doc(`funnels/${id}`).delete().catch(() => {})));
}

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
