import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

const IDS = process.env.IDS?.split(",") ?? [
  "EcKaDdB6Px5G0jF1CIBc", // F1 unwanted section / thin copy
  "4QubyXKllrxTySsG2DP4", // F2 no email, upload fails
  "CwDjKGbO3LormOssqcmz", // F3 "Get the starter kit" dead
  "J7yDukVJ40vNQ71tF5js", // F4 "Schedule Now" dead
];

for (const id of IDS) {
  const snap = await db.doc(`funnels/${id}`).get();
  if (!snap.exists) { console.log(`\n### ${id} DOES NOT EXIST`); continue; }
  const f = snap.data() as Record<string, unknown>;
  const secs = (f.sections ?? []) as { id: string; type: string; canvas?: string; config: Record<string, unknown> }[];
  console.log(`\n### ${id} | ${JSON.stringify(f.name)}`);
  console.log(`    genre=${f.genre} status=${f.status} chainRole=${f.chainRole} sa=${f.subAccountId}`);
  console.log(`    created=${new Date(((f.createdAt as { toMillis(): number })?.toMillis?.() ?? 0)).toISOString()} by=${f.createdByUid}`);
  console.log(`    leadMagnetAsset=${JSON.stringify(f.leadMagnetAsset ?? null)}`);
  console.log(`    bridge=${JSON.stringify(f.bridge ?? null)}`);
  for (const s of secs) {
    const c = s.config;
    const cta = c.cta as Record<string, unknown> | undefined;
    const bits = [
      c.ctaLabel ? `ctaLabel=${JSON.stringify(c.ctaLabel)}` : "",
      c.ctaHref !== undefined ? `ctaHref=${JSON.stringify(c.ctaHref)}` : "",
      c.formId !== undefined ? `formId=${JSON.stringify(c.formId)}` : "",
      cta ? `cta=${JSON.stringify(cta)}` : "",
      c.checkoutMode ? `checkoutMode=${c.checkoutMode}` : "",
      c.priceCents !== undefined ? `priceCents=${c.priceCents}` : "",
      c.variant ? `variant=${c.variant}` : "",
    ].filter(Boolean);
    if (bits.length) console.log(`    [${s.type}] ${bits.join(" ")}`);
  }
  // Which forms does it reference, and do they exist?
  const formIds = new Set<string>();
  for (const s of secs) { const fid = s.config.formId; if (typeof fid === "string" && fid) formIds.add(fid); }
  for (const fid of formIds) {
    const fs = await db.doc(`forms/${fid}`).get();
    console.log(`    form ${fid}: exists=${fs.exists} sa=${fs.data()?.subAccountId} name=${JSON.stringify(fs.data()?.name)}`);
  }
}
process.exit(0);
