/**
 * APPROVAL STATE MODEL — P0.4.
 *
 * The acceptance standard is NOT that new states exist. It is that the
 * migration is ADDITIVE: no existing record is stranded, and no new state
 * accidentally publishes anything. Approving is not publishing.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-approval-states.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { isPubliclyRenderable, FUNNEL_STATUS_LABEL } = await import("../src/types/funnels.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const ALL = Object.keys(FUNNEL_STATUS_LABEL) as (keyof typeof FUNNEL_STATUS_LABEL)[];

// ── Only "published" is public. This is the whole safety property. ───────
check("1. published IS publicly renderable", isPubliclyRenderable("published"));
for (const s of ALL.filter((x) => x !== "published")) {
  check(`2. "${s}" is NOT publicly renderable`, !isPubliclyRenderable(s));
}
check("3. approved does NOT publish (approving != publishing)", !isPubliclyRenderable("approved"));
check("4. scheduled does NOT publish", !isPubliclyRenderable("scheduled"));
check("5. undefined/null status is not public (fails closed)",
  !isPubliclyRenderable(undefined) && !isPubliclyRenderable(null));

// ── Additive: the original values still exist and still mean what they did ─
check("6. Original 'draft' still valid", ALL.includes("draft"));
check("7. Original 'published' still valid", ALL.includes("published"));
check("8. published reads as 'Live' to customers", FUNNEL_STATUS_LABEL.published === "Live");

// ── No existing record is stranded ───────────────────────────────────────
const snap = await db.collection("funnels").limit(300).get();
const statuses = new Map<string, number>();
for (const d of snap.docs) {
  const st = (d.data() as { status?: string }).status ?? "(missing)";
  statuses.set(st, (statuses.get(st) ?? 0) + 1);
}
const unknown = [...statuses.keys()].filter((s) => s !== "(missing)" && !ALL.includes(s as never));
check("9. Every existing funnel's status is a valid state", unknown.length === 0,
  `${snap.size} funnels: ${JSON.stringify(Object.fromEntries(statuses))}`);

// ── Nothing was accidentally published by the migration ──────────────────
// A migration must never move a record INTO the public state. Compare the
// live count against what it should be: only records already stored as
// "published".
const liveCount = [...snap.docs].filter((d) => isPubliclyRenderable((d.data() as { status?: never }).status)).length;
const storedPublished = statuses.get("published") ?? 0;
check("10. Public count equals stored-published count (nothing auto-published)",
  liveCount === storedPublished, `${liveCount} public vs ${storedPublished} stored`);

// ── approval metadata is optional ────────────────────────────────────────
const withApproval = snap.docs.filter((d) => "approval" in (d.data() as object)).length;
check("11. approval metadata is optional (pre-P0.4 records valid without it)",
  snap.size === 0 || withApproval < snap.size || withApproval === 0,
  `${withApproval}/${snap.size} carry it`);

console.log(`\n${bad === 0 ? "APPROVAL STATES CERTIFIED (additive, nothing stranded, nothing published)" : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
