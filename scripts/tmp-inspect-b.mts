import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const d = (await getAdminDb().doc("funnels/qa-p1-B-lead-gen").get()).data() as { sections: { type: string; canvas?: string; config: Record<string, unknown> }[] };
for (const s of d.sections) {
  console.log(`\n[${s.type}] canvas=${s.canvas ?? "-"}`);
  for (const [k, v] of Object.entries(s.config)) {
    if (typeof v === "string" && v) console.log(`   ${k} (${v.length}): ${JSON.stringify(v)}`);
  }
}
process.exit(0);
