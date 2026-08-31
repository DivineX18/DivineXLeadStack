import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.startsWith("#")) process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
const d = await db.doc("funnels/7er7trZhwA5djftx6kPl").get();
const f = d.data() as { name?: string; subAccountId?: string; createdAt?: { toMillis?: () => number }; sections?: { type: string; config?: Record<string, unknown> }[] };
console.log("name:", f.name, "| sa:", f.subAccountId);
const hero = f.sections?.find((x) => x.type === "hero");
console.log("HERO mediaType:", (hero?.config as Record<string,unknown>)?.mediaType, "mediaUrl:", (hero?.config as Record<string,unknown>)?.mediaUrl ?? "(none)");
console.log("section order:", (f.sections ?? []).map((x) => x.type).join(" > "));
console.log("created:", new Date(f.createdAt?.toMillis?.() ?? 0).toISOString());
for (const s of f.sections ?? []) {
  const c = s.config ?? {};
  const bits: string[] = [];
  if (c.mediaUrl) bits.push(`mediaUrl=${String(c.mediaUrl).slice(0, 58)}`);
  if (c.photoUrl) bits.push(`photoUrl=${String(c.photoUrl).slice(0, 58)}`);
  const imgs = c.images as { url: string }[] | undefined;
  if (imgs?.length) { bits.push(`images(${imgs.length}):`); imgs.forEach(i => bits.push(`   ${i.url}`)); }
  const logos = c.logos as { url: string }[] | undefined;
  if (logos?.length) bits.push(`logos(${logos.length})`);
  const items = (c.items as { imageUrl?: string }[] | undefined)?.filter(i => i.imageUrl);
  if (items?.length) bits.push(`itemImages(${items.length})`);
  if (bits.length) console.log(` ${s.type}:\n   ${bits.join("\n   ")}`);
}
