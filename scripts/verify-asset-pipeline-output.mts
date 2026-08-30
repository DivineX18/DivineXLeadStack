import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.startsWith("#")) process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const SA = process.env.FLOW_PROBE_SA!;
const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const snap = (await db.doc(`divinexProfiles/${SA}`).get()).data() as
  { assets?: { fileUrl: string; classification?: string; status?: string }[]; brand?: Record<string, unknown> };
const approved = (snap.assets ?? []).filter((a) => a.status === "approved");
const partnerUrls = new Set(approved.filter((a) => a.classification === "partner").map((a) => a.fileUrl));
const photoUrls = new Set(approved.filter((a) => ["hero", "photo"].includes(a.classification ?? "")).map((a) => a.fileUrl));
const logoUrl = ((snap.brand?.visual as { tokens?: { logoUrl?: string } } | undefined)?.tokens?.logoUrl) ?? "";

const cap = getCapability("create_funnel")!;
const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: "U5SBAHsB0nZ7ce552H9h", subAccountId: SA, subAccountRole: "admin" };
const v = cap.validate!({
  funnel_name: "[E2E] RWAR partnerships", headline: "Bring Reading With A Rapper To Your Campus",
  subheadline: "A culturally relevant literacy program that connects the classroom to a real career pathway.",
  genre: "lead_gen", bullets: ["Culturally relevant curriculum", "Built by educators", "Measurable literacy gains"],
  visual_archetype: "nonprofit_mission", cta_label: "Book a partnership call",
});
if (!v.ok) throw new Error(v.error);
const built = await cap.execute!(ctx as never, v.args);
const f = (await db.doc(`funnels/${built.ref!.id}`).get()).data()!;
const sections = f.sections as { type: string; config: Record<string, unknown> }[];

const photoSlots: string[] = [];
const logoSlots: string[] = [];
for (const s of sections) {
  const c = s.config;
  if (typeof c.mediaUrl === "string") photoSlots.push(c.mediaUrl);
  if (typeof c.photoUrl === "string") photoSlots.push(c.photoUrl);
  for (const g of (c.images as { url: string }[] | undefined) ?? []) photoSlots.push(g.url);
  for (const it of (c.items as { imageUrl?: string }[] | undefined) ?? []) if (it.imageUrl) photoSlots.push(it.imageUrl);
  for (const l of (c.logos as { url: string }[] | undefined) ?? []) logoSlots.push(l.url);
}
const all = [...photoSlots, ...logoSlots];

check("A. The page actually uses the business's own imagery", all.length > 0, `${photoSlots.length} photo slots, ${logoSlots.length} logo slots`);
check("B. NO partner seal/logo used as photography", photoSlots.every((u) => !partnerUrls.has(u)),
  photoSlots.filter((u) => partnerUrls.has(u)).length + " violations");
check("C. Every image is an APPROVED asset", all.every((u) => u === logoUrl || partnerUrls.has(u) || photoUrls.has(u)));
check("D. Imagery is DISTRIBUTED, not dumped in one gallery",
  sections.filter((s) => { const c = s.config; return c.mediaUrl || c.photoUrl || (c.images as unknown[] | undefined)?.length || (c.items as {imageUrl?:string}[] | undefined)?.some((i)=>i.imageUrl); }).length >= 2,
  `${sections.filter((s) => { const c = s.config; return c.mediaUrl || c.photoUrl || (c.images as unknown[] | undefined)?.length || (c.items as {imageUrl?:string}[] | undefined)?.some((i)=>i.imageUrl); }).length} sections carry imagery`);
check("E. No repeated imagery", new Set(photoSlots).size === photoSlots.length, `${photoSlots.length} slots, ${new Set(photoSlots).size} unique`);
check("F. Full-resolution originals (no CDN thumbnail transforms)", all.every((u) => !/\/v1\/(fill|crop)\//.test(u)));
const hero = sections.find((s) => s.type === "hero");
check("G. Hero uses photography, not a seal", !hero?.config.mediaUrl || !partnerUrls.has(hero.config.mediaUrl as string), String(hero?.config.mediaUrl ?? "(none)").slice(0, 60));

console.log(`\nFUNNEL=${built.ref!.id}`);
process.exit(bad === 0 ? 0 : 1);
