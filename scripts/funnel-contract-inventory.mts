/**
 * Inventory of PUBLISHED funnels that violate the runtime contract, grouped by
 * ownership so remediation can be decided per group rather than in bulk.
 *
 * Read-only by default. `--repair-internal` acts ONLY on funnels this script
 * can prove are internal QA/test data, and only by unpublishing them (back to
 * draft), which invents nothing, sends nothing and charges nothing.
 *
 * NODE_OPTIONS="--conditions=react-server" npx tsx scripts/funnel-contract-inventory.mts [--repair-internal] [--json]
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { findBrokenCtas, findDeliveryGaps } = await import("../src/lib/funnels/cta-integrity.ts");
const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
const REPAIR = process.argv.includes("--repair-internal");
// The production host, not whatever .env.local points at locally.
const APP = process.env.PUBLIC_HOST?.replace(/\/$/, "") || "https://app.divinex.io";

/**
 * OWNERSHIP. Deliberately conservative: a funnel is only "internal" when its
 * workspace is provably a test fixture. Anything else is customer or
 * ambiguous, and ambiguous is treated exactly like customer-owned — remediation
 * there needs business intent nobody here has.
 */
const INTERNAL_WS_PATTERNS = [/^qa-/i, /^test-/i, /^qa-bre-/i, /^qa-e2e-/i, /^qa-p1-/i, /^qa-battery-/i];
const INTERNAL_NAME_PATTERNS = [/^\[QA/i, /^\[TEST\]/i, /^\[v\d+\]/i, /^ZZSENTINEL/i, /^\[QA-BAT\]/i, /^\[TMP\]/i];

/**
 * "internal" = a test WORKSPACE; safe to unpublish unattended.
 * "internal_author" = written by a synthetic QA user but living in a LIVE
 *   workspace. Unquestionably test data, but its URL may have been shared, so
 *   it is reported and never touched automatically.
 * "customer" / "ambiguous" = needs business intent. Never touched.
 */
type Group = "internal" | "internal_author" | "customer" | "ambiguous";
const SYNTHETIC_AUTHOR = /@test\.local$|^qa-|^test-/i;

interface Row {
  id: string; name: string; workspaceId: string; workspaceName: string;
  owner: string; url: string; group: Group;
  deadCtas: string[]; deliveryGaps: string[];
  violation: "dead_cta" | "delivery_gap" | "both";
  remediation: string;
}

const emailCache = new Map<string, string>();
async function ownerEmail(uid?: string): Promise<string> {
  if (!uid) return "(unknown)";
  if (emailCache.has(uid)) return emailCache.get(uid)!;
  let e = uid;
  try { e = (await getAdminAuth().getUser(uid)).email ?? uid; } catch { /* deleted or synthetic */ }
  emailCache.set(uid, e);
  return e;
}

const funnels = await db.collection("funnels").where("status", "==", "published").get();
const formCache = new Map<string, string | null>();
const wfBySa = new Map<string, { id: string; name: string; status: string; formId?: string }[]>();
const wsCache = new Map<string, { name: string; exists: boolean }>();
const rows: Row[] = [];

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
  if (broken.length === 0 && gaps.length === 0) continue;

  if (!wsCache.has(sa)) {
    const ws = await db.doc(`subAccounts/${sa}`).get();
    wsCache.set(sa, { name: (ws.data()?.name as string) ?? "(missing)", exists: ws.exists });
  }
  const ws = wsCache.get(sa)!;
  const name = String(f.name ?? "(untitled)");

  const owner = await ownerEmail(f.createdByUid as string | undefined);
  const isInternalWorkspace =
    INTERNAL_WS_PATTERNS.some((p) => p.test(sa)) || INTERNAL_NAME_PATTERNS.some((p) => p.test(name));
  const group: Group = isInternalWorkspace
    ? "internal"
    : SYNTHETIC_AUTHOR.test(owner)
      ? "internal_author"
      : ws.exists
        ? "customer"
        : "ambiguous";

  const violation = broken.length && gaps.length ? "both" : broken.length ? "dead_cta" : "delivery_gap";
  const remediation = group === "internal"
    ? "unpublish (internal test fixture, no business intent involved)"
    : group === "internal_author"
    ? "QA-authored page in a LIVE workspace: recommend unpublishing, but its URL may have been shared, so left for a human to confirm"
    : violation === "delivery_gap"
      ? "operator activates the named follow-up workflow, then re-publishes"
      : violation === "dead_cta"
        ? "operator attaches a form / link / booking page / checkout to each named button, or removes its label, then re-publishes"
        : "operator wires the named buttons AND activates the follow-up, then re-publishes";

  rows.push({
    id: doc.id, name, workspaceId: sa, workspaceName: ws.name,
    owner,
    url: `${APP}/lp/${doc.id}`, group,
    deadCtas: broken.map((b) => `"${b.label}" (${b.sectionType}): ${b.reason}`),
    deliveryGaps: gaps, violation, remediation,
  });
}

const by = (g: Group) => rows.filter((r) => r.group === g);
console.log(`PUBLISHED FUNNELS SCANNED: ${funnels.size}`);
console.log(`VIOLATING THE CONTRACT:    ${rows.length}`);
console.log(`  dead CTA only:    ${rows.filter((r) => r.violation === "dead_cta").length}`);
console.log(`  delivery gap only:${rows.filter((r) => r.violation === "delivery_gap").length}`);
console.log(`  both:             ${rows.filter((r) => r.violation === "both").length}`);
console.log(`\nBY OWNERSHIP`);
console.log(`  internal test workspace:      ${by("internal").length}`);
console.log(`  QA-authored in live workspace:${by("internal_author").length}`);
console.log(`  customer-owned:               ${by("customer").length}`);
console.log(`  ambiguous:                    ${by("ambiguous").length}`);

for (const g of ["customer", "ambiguous", "internal_author", "internal"] as Group[]) {
  const list = by(g);
  if (list.length === 0) continue;
  console.log(`\n===== ${g.toUpperCase()} (${list.length}) =====`);
  for (const r of list) {
    console.log(`\n  ${r.id}  [${r.violation}]`);
    console.log(`    title:     ${JSON.stringify(r.name.slice(0, 70))}`);
    console.log(`    workspace: ${r.workspaceName} (${r.workspaceId})`);
    console.log(`    owner:     ${r.owner}`);
    console.log(`    url:       ${r.url}`);
    for (const d of r.deadCtas) console.log(`    invalid:   ${d}`);
    for (const d of r.deliveryGaps) console.log(`    invalid:   ${d.slice(0, 150)}`);
    console.log(`    fix:       ${r.remediation}`);
  }
}

if (process.argv.includes("--json")) {
  const out = "/tmp/funnel-contract-inventory.json";
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${out}`);
}

if (REPAIR) {
  const targets = by("internal");
  console.log(`\n=== UNPUBLISHING ${targets.length} INTERNAL TEST FUNNELS ===`);
  for (const r of targets) {
    await db.doc(`funnels/${r.id}`).update({ status: "draft" });
    console.log(`  unpublished ${r.id} (${r.workspaceId}) ${JSON.stringify(r.name.slice(0, 50))}`);
  }
  console.log(`\nNOT touched: ${by("internal_author").length} QA-authored pages in live workspaces, ${by("customer").length} customer-owned, ${by("ambiguous").length} ambiguous.`);
}
process.exit(0);
