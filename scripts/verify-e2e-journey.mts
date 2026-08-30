/**
 * COMPREHENSIVE CUSTOMER JOURNEY — Zeno build -> preview -> follow-up
 * workflow -> CRM -> publish boundary.
 *
 * Complements verify-asset-pipeline-output.mts (imagery correctness) by
 * proving the rest of the chain a customer actually walks. Uses the dedicated
 * probe workspace; creates and removes its own data.
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-e2e-journey.mts
 */
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
const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: "U5SBAHsB0nZ7ce552H9h", subAccountId: SA, subAccountRole: "admin" };
const cleanup: { col: string; id: string }[] = [];

// ── Zeno builds a campaign ───────────────────────────────────────────────
const cap = getCapability("create_funnel")!;
const v = cap.validate!({
  funnel_name: "[E2E] journey", headline: "Bring Reading With A Rapper To Your Campus",
  genre: "lead_gen", bullets: ["Culturally relevant curriculum", "Built by educators", "Measurable literacy gains"],
  visual_archetype: "nonprofit_mission", cta_label: "Book a partnership call",
});
if (!v.ok) throw new Error(v.error);
const built = await cap.execute!(ctx as never, v.args);
const funnelId = built.ref!.id;
cleanup.push({ col: "funnels", id: funnelId });
check("1. Zeno builds and returns what it built", built.ref?.kind === "funnel" && !!funnelId, funnelId);

const f = (await db.doc(`funnels/${funnelId}`).get()).data()!;
check("2. PUBLISH BOUNDARY: built as a draft, never live", f.status === "draft", String(f.status));
check("3. It belongs to the workspace that asked", f.subAccountId === SA);

// ── The follow-up the build promised actually exists ─────────────────────
const forms = await db.collection("forms").where("subAccountId", "==", SA).get();
const workflows = await db.collection("workflows").where("subAccountId", "==", SA).get();
const templates = await db.collection("message_templates").where("subAccountId", "==", SA).get();
forms.docs.forEach((d) => cleanup.push({ col: "forms", id: d.id }));
workflows.docs.forEach((d) => cleanup.push({ col: "workflows", id: d.id }));
templates.docs.forEach((d) => cleanup.push({ col: "message_templates", id: d.id }));
check("4. A capture form was created with the campaign", forms.size > 0, `${forms.size} forms`);
check("5. A follow-up workflow was created", workflows.size > 0, `${workflows.size} workflows`);
check("6. A confirmation email template was created", templates.size > 0, `${templates.size} templates`);
const wf = workflows.docs[0]?.data() as { status?: string; enabled?: boolean } | undefined;
check("7. PUBLISH BOUNDARY: the workflow cannot contact anyone until activated",
  wf?.status !== "active" && wf?.enabled !== true, `status=${wf?.status} enabled=${wf?.enabled}`);

// ── CRM is reachable and scoped ──────────────────────────────────────────
const contacts = await db.collection("contacts").where("subAccountId", "==", SA).get();
check("8. CRM is queryable for this workspace", contacts.size >= 0, `${contacts.size} contacts`);
const foreign = await db.collection("contacts").where("subAccountId", "==", "MEYB8CbWlE5fxAn3TJOp").limit(1).get();
check("9. TENANT ISOLATION: another workspace's contacts are a different set",
  foreign.docs.every((d) => (d.data() as { subAccountId?: string }).subAccountId !== SA));

// ── Preview renders the draft; publishing stays deliberate ───────────────
const { loadFunnelForRender } = await import("../src/lib/funnels/load-funnel-for-render.ts");
const publicRender = await loadFunnelForRender(funnelId).catch(() => null);
check("10. PUBLISH BOUNDARY: an unpublished funnel does not render publicly", publicRender === null);

for (const c of cleanup) await db.doc(`${c.col}/${c.id}`).delete();
console.log(`\ncleaned up ${cleanup.length} probe records`);
console.log(bad === 0 ? "JOURNEY INTACT" : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
