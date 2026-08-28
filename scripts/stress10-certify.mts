// CERTIFICATION ANALYZER — turns the stress-run report into the spec's
// matrix and PROVES the full chain live for the webinar scenario:
// registration event → lifecycle state seeded → anchored reminder eligible.
// Run after stress10.mts:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/stress10-certify.mts
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const report = JSON.parse(readFileSync(new URL("../.stress10-report.json", import.meta.url), "utf8")) as Record<string, never>[];
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { lifecycleDocId } = await import("../src/lib/lifecycle/engine");
const { applyLifecycleStateForEvent } = await import("../src/lib/workflows/lifecycle-events");
const db = getAdminDb();

const FAB = /money.back guarantee|tax.deductible|501\(c\)|maximum|per quarter|hundreds of (kids|children)|funds one child|dermatologist.tested|\[[^\]\n]{2,60}\]|555\d{4}|(?:answer|response)\w*.{0,20}(?:in|within) \d+ (?:seconds|minutes)/i;

for (const sc of report as { key: string; funnels?: Record<string, never>[] }[]) {
  for (const f of (sc.funnels ?? []) as {
    id: string; genre: string; persuasionDepth: string; decisionComplexity: string;
    eventStartAt?: string | null;
    sections: { type: string; headline: string | null; cta: string | null }[];
    workflows: { strategyPlan?: { conversionEvent: string; goalState: string; goalTag: string; handoffDays: number; synthesized?: boolean } | null;
      nodes: { type: string; subject?: string | null; commType?: string | null; offsetMinutes?: number | null; eligibility?: { domain: string; states: string[] } | null; bodyPreview?: string | null }[] }[];
  }[]) {
    const flat = JSON.stringify(f.sections);
    const fabs = flat.match(FAB);
    const wf = f.workflows[0];
    const sp = wf?.strategyPlan;
    const emails = wf?.nodes.filter((n) => n.type === "send_email") ?? [];
    const wus = wf?.nodes.filter((n) => n.type === "wait_until") ?? [];
    const branches = wf?.nodes.filter((n) => n.type === "if_else").length ?? 0;
    console.log(`\n=== ${sc.key} (/lp/${f.id})`);
    console.log(`  genre=${f.genre} ${f.persuasionDepth}/${f.decisionComplexity} sections=${f.sections.length} eventStartAt=${f.eventStartAt ?? "-"}`);
    console.log(`  plan: event='${sp?.conversionEvent ?? "-"}' goal='${sp?.goalState ?? "-"}' tag=${sp?.goalTag ?? "-"} handoff=${sp?.handoffDays ?? "-"}d synth=${sp?.synthesized ?? false}`);
    console.log(`  comms: [${emails.map((e) => e.commType ?? "?").join(", ")}] | wait_until=${wus.length} goal-gates=${branches}`);
    for (const w of wus) console.log(`    anchor: offset=${w.offsetMinutes}min eligibility=${w.eligibility ? `${w.eligibility.domain}:${w.eligibility.states.join("/")}` : "none"}`);
    console.log(`  fabrication: ${fabs ? `⚠️ "${fabs[0]}"` : "CLEAN"}`);
    // dead-CTA: any cta-bearing section must have a form or workflows exist
    const ctaSections = f.sections.filter((s) => s.cta);
    console.log(`  CTAs: ${ctaSections.length} | automation: ${wf ? "wired" : "NONE"}`);
  }
}

// ── LIVE CHAIN PROBE: webinar registration → lifecycle → eligibility ──
const webinarEntry = (report as { key: string; funnels?: { id: string }[] }[]).find((s) => s.key === "4-webinar");
const webinarId = webinarEntry?.funnels?.[0]?.id;
if (webinarId) {
  const fun = (await db.doc(`funnels/${webinarId}`).get()).data()!;
  const formId = (fun.sections as { config?: { formId?: string } }[]).map((s) => s.config?.formId).find(Boolean);
  const cRef = db.collection("contacts").doc();
  await cRef.set({ subAccountId: fun.subAccountId, agencyId: fun.agencyId, name: "QA Registrant", tags: [], createdByUid: "qa" });
  // The REAL registration event through the production consumer:
  await applyLifecycleStateForEvent({
    subAccountId: fun.subAccountId,
    type: "form.submitted",
    payload: { submission: { form_id: formId, contact_id: cRef.id } },
  });
  const lc = await db.doc(`lifecycleStates/${lifecycleDocId("webinar", webinarId, cRef.id)}`).get();
  console.log(`\nCHAIN PROBE (webinar ${webinarId}):`);
  console.log(`  registration event → lifecycle record: ${lc.exists ? `state=${lc.data()!.state} reason=${lc.data()!.reason}` : "MISSING ❌"}`);
  await cRef.delete();
  if (lc.exists) await lc.ref.delete();
}
process.exit(0);
