// Ascend Intelligence Library → Flow sync (write side of the bridge — see
// src/lib/conversion/ascend-frameworks.ts for the read side + rationale).
//
// Pulls the ACTIVE rows of Ascend's Postgres `frameworks` table and upserts
// them into Flow's Firestore at intelligenceFrameworks/{slug}; frameworks
// deactivated or deleted on the Ascend side are deactivated here on the next
// sync. Manual/on-demand by design (same trust model as Ascend's own
// script-triggered CRM lead sync): no runtime coupling, no shared secrets in
// either deployed app — this script runs on a machine that already holds
// both repos' local env files.
//
// Run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/sync-ascend-frameworks.mts
//       ASCEND_ENV=/path/to/.env.local overrides the Ascend env location.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const ASCEND_ROOT = "/Users/boss/DivineX-Business-Intelligence";
const ascendEnvPath = process.env.ASCEND_ENV ?? `${ASCEND_ROOT}/.env.local`;
let databaseUrl = "";
for (const line of readFileSync(ascendEnvPath, "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && line.slice(0, i).trim() === "DATABASE_URL") databaseUrl = line.slice(i + 1).trim();
}
if (!databaseUrl) {
  console.error(`No DATABASE_URL in ${ascendEnvPath}`);
  process.exit(1);
}

const require2 = createRequire(import.meta.url);
const { Client } = require2(`${ASCEND_ROOT}/lib/db/node_modules/pg`) as typeof import("pg");
const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
const rows = (
  await pg.query(
    "SELECT id, name, slug, description, category, content, is_active, sort_order FROM frameworks ORDER BY sort_order",
  )
).rows as {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}[];
await pg.end();

const { getAdminDb } = await import("../src/lib/firebase/admin");
const db = getAdminDb();
const col = db.collection("intelligenceFrameworks");

const seenSlugs = new Set<string>();
for (const r of rows) {
  seenSlugs.add(r.slug);
  await col.doc(r.slug).set(
    {
      name: r.name,
      description: r.description ?? "",
      category: r.category ?? "strategy",
      content: r.content ?? "",
      active: r.is_active === true,
      sortOrder: r.sort_order ?? 0,
      ascendId: r.id,
      syncedAt: new Date(),
    },
    { merge: true },
  );
  console.log(`${r.is_active ? "✓" : "○"} ${r.slug} [${r.category}] ${r.content?.length ?? 0} chars`);
}
// Deactivate anything no longer present on the Ascend side.
const existing = await col.get();
for (const d of existing.docs) {
  if (!seenSlugs.has(d.id) && d.data().active) {
    await d.ref.update({ active: false, syncedAt: new Date() });
    console.log(`○ ${d.id} — deactivated (removed on Ascend)`);
  }
}
console.log(`\nSynced ${rows.length} frameworks (${rows.filter((r) => r.is_active).length} active).`);
process.exit(0);
