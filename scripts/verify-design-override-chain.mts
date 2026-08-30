/**
 * DESIGN OVERRIDE CHAIN — a valid visual instruction must survive:
 *   tool input -> validation -> design strategy -> funnel document
 *
 * Regression guard for a real defect found 2026-08-30: create_funnel passed
 * only 2 of the 9 overrides resolveDesignStrategy accepts, so seven
 * documented visual instructions were parsed, validated and silently
 * dropped. Zeno could accept a valid hero_layout and the page would ignore
 * it, which is invisible from the outside — the page just looks generic.
 *
 * luxury_premium is used deliberately: it ALLOWS founder_image but DEFAULTS
 * to background_image, so the override only appears if it genuinely
 * survived. An archetype whose first choice is founder_image would pass
 * even with the bug present.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-design-override-chain.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.startsWith("#")) process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
const SA = "x4NOJFn8bTyav7OeJc1v";
const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: "U5SBAHsB0nZ7ce552H9h", subAccountId: SA, subAccountRole: "admin" };
const cap = getCapability("create_funnel")!;
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const made: string[] = [];

async function build(extra: Record<string, unknown>) {
  const v = cap.validate!({
    funnel_name: "[TEST] override chain", headline: "A calmer way to feel better",
    genre: "lead_magnet", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
    visual_archetype: "luxury_premium", ...extra,
  });
  if (!v.ok) throw new Error(v.error);
  const r = await cap.execute!(ctx as never, v.args);
  made.push(r.ref!.id);
  const f = (await db.doc(`funnels/${r.ref!.id}`).get()).data()!;
  const hero = (f.sections as { type: string; config: Record<string, unknown> }[]).find((s) => s.type === "hero");
  return hero?.config.layout as string;
}

// wellness allows [centered, founder_image] and DEFAULTS to centered, so
// founder_image can only appear if the override survived the whole chain.
check("default is the archetype's own choice", (await build({})) === "background_image");
check("VALID hero_layout override reaches the funnel document", (await build({ hero_layout: "founder_image" })) === "founder_image");
// browser_mockup is not allowed for wellness — must still be ignored.
check("INVALID override still ignored (frozen contract preserved)", (await build({ hero_layout: "browser_mockup" })) === "background_image");

for (const id of made) await db.doc(`funnels/${id}`).delete();
console.log(`\ncleaned up ${made.length} test funnels`);
console.log(bad === 0 ? "OVERRIDE CHAIN INTACT END-TO-END" : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
