import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { findBrokenCtas, findDeliveryGaps } = await import("../src/lib/funnels/cta-integrity.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

const funnels = await db.collection("funnels").where("status", "==", "published").get();
const formCache = new Map<string, string | null>();
const wfBySa = new Map<string, { id: string; name: string; status: string; formId?: string }[]>();

let deadCta = 0, deliveryGap = 0, clean = 0;
const rows: string[] = [];

for (const doc of funnels.docs) {
  const f = doc.data() as Record<string, unknown>;
  const sa = f.subAccountId as string;
  if (!sa) continue;
  const sections = (f.sections ?? []) as { config: { formId?: string | null } }[];
  const formIds = new Set<string>();
  for (const s of sections) if (typeof s.config?.formId === "string" && s.config.formId) formIds.add(s.config.formId);

  const existing = new Set<string>();
  for (const id of formIds) {
    if (!formCache.has(id)) {
      const fs = await db.doc(`forms/${id}`).get();
      formCache.set(id, fs.exists ? ((fs.data()?.subAccountId as string) ?? null) : null);
    }
    if (formCache.get(id) === sa) existing.add(id);
  }
  if (!wfBySa.has(sa)) {
    const snap = await db.collection("workflows").where("subAccountId", "==", sa).get();
    wfBySa.set(sa, snap.docs.map((d) => {
      const w = d.data() as { name?: string; status?: string; trigger?: { formId?: string } };
      return { id: d.id, name: w.name ?? "Follow-up", status: w.status ?? "draft", formId: w.trigger?.formId };
    }));
  }
  const workflows = (wfBySa.get(sa) ?? []).filter((w) => !!w.formId && formIds.has(w.formId));

  const broken = findBrokenCtas(sections as never[], existing);
  const gaps = findDeliveryGaps({
    formIds: [...formIds],
    workflows: workflows.map(({ id, name, status }) => ({ id, name, status })),
    hasLeadMagnetAsset: !!f.leadMagnetAsset,
    genre: f.genre as never,
  });
  if (broken.length) deadCta++;
  if (gaps.length) deliveryGap++;
  if (!broken.length && !gaps.length) clean++;
  else rows.push(`  ${doc.id} sa=${sa} genre=${f.genre} dead=${broken.length} gaps=${gaps.length} ${JSON.stringify(String(f.name).slice(0, 55))}`);
}

console.log(`PUBLISHED FUNNELS: ${funnels.size}`);
console.log(`  with at least one DEAD CTA:      ${deadCta}`);
console.log(`  with a DELIVERY GAP:             ${deliveryGap}`);
console.log(`  fully clean under the contract:  ${clean}`);
console.log("\nAffected:");
for (const r of rows.slice(0, 40)) console.log(r);
if (rows.length > 40) console.log(`  ... and ${rows.length - 40} more`);
process.exit(0);
