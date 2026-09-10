import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
const SA = "x4NOJFn8bTyav7OeJc1v";

console.log("=== WORKFLOWS in DivineX #1001 ===");
const wfs = await db.collection("workflows").where("subAccountId", "==", SA).get();
console.log("count:", wfs.size);
wfs.forEach((d) => {
  const w = d.data() as Record<string, unknown>;
  const nodes = (w.nodes ?? {}) as Record<string, { type?: string; config?: Record<string, unknown> }>;
  const emails = Object.values(nodes).filter((n) => n?.type === "send_email");
  console.log(
    `  ${d.id} name=${JSON.stringify(w.name)} status=${w.status} active=${w.active} trigger=${JSON.stringify(w.trigger)} nodes=${Object.keys(nodes).length} sendEmail=${emails.length}`,
  );
  for (const e of emails) {
    const body = String(e.config?.body ?? "");
    console.log(`      send_email subject=${JSON.stringify(e.config?.subject)} bodyLen=${body.length} hasDownloadLink=${/api\/funnel-asset|Download your copy/.test(body)}`);
  }
});

console.log("\n=== FORM SUBMISSIONS for the failing lead-magnet form ===");
const FORM = "y07zKelgPPAqhhROyIr6";
const fdoc = await db.doc(`forms/${FORM}`).get();
console.log("form exists:", fdoc.exists, JSON.stringify({ name: fdoc.data()?.name, sa: fdoc.data()?.subAccountId }));
const subs = await db.collection(`forms/${FORM}/submissions`).limit(10).get();
console.log("submissions:", subs.size);
subs.forEach((d) => console.log("   ", d.id, JSON.stringify(d.data()).slice(0, 200)));

console.log("\n=== workflow runs ===");
const runs = await db.collection("workflowRuns").where("subAccountId", "==", SA).limit(10).get().catch(() => null);
console.log("workflowRuns:", runs ? runs.size : "(collection unreadable)");
runs?.forEach((d) => console.log("   ", d.id, JSON.stringify(d.data()).slice(0, 220)));

console.log("\n=== resend/env presence (names only) ===");
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_APP_URL", "QSTASH_TOKEN"]) {
  console.log(`   ${k}: ${process.env[k] ? "set" : "MISSING"}`);
}
process.exit(0);
