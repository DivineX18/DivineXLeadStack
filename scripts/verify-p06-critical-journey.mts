/**
 * P0.6 FINAL — THE CRITICAL CUSTOMER JOURNEY, end to end.
 *
 * Certifies the JOURNEY, not every implementation detail independently:
 * a real Zeno build → real artifact → Growth Plan → preview → review state
 * agreement → approval safety → public-rendering safety → tenant isolation.
 *
 * Non-vacuous throughout: the plan item comes from the build path being
 * certified (never inserted by hand), the approval check runs against an
 * artifact proven unpublished first, and the tenant test uses a real foreign
 * artifact proven to exist.
 *
 * Run: FLOW_PROBE_SA=<a> FLOW_PROBE_SA_B=<b> \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-p06-critical-journey.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const A = process.env.FLOW_PROBE_SA, B = process.env.FLOW_PROBE_SA_B;
if (!A || !B) throw new Error("FLOW_PROBE_SA and FLOW_PROBE_SA_B are required.");

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { renderCompletion } = await import("../src/lib/ai-suite/render-completion.ts");
const { resolveGrowthPlanExecution } = await import("../src/lib/intelligence/growth-plan-execution.ts");
const { loadFunnelForRender } = await import("../src/lib/funnels/load-funnel-for-render.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { createFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");

const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };
const sub = (await db.doc(`subAccounts/${A}`).get()).data()!;
const cleanup: (() => Promise<unknown>)[] = [];

try {
  // ── A. A REAL BUILD through the normal path ────────────────────────────
  console.log("A. Real Zeno build");
  const ctx = { uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "", agencyId: sub.agencyId as string, subAccountId: A, subAccountRole: "admin" };
  const cap = getCapability("create_funnel")!;
  const v = cap.validate!({
    funnel_name: "[P0.6 JOURNEY] probe", headline: "A Clear Offer For The Journey Probe",
    genre: "lead_gen", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
    media_subject: "A wide photograph of the team at work",
  });
  if (!v.ok) throw new Error(v.error);
  const built = await cap.execute!(ctx as never, v.args);
  const id = built.ref!.id;
  cleanup.push(() => db.doc(`funnels/${id}`).delete().catch(() => {}));
  check("A1. the build produced a real artifact reference", !!id);

  // ── B. The artifact genuinely exists in authoritative storage ──────────
  console.log("\nB. Artifact exists");
  let doc = (await db.doc(`funnels/${id}`).get()).data()!;
  check("B1. the artifact exists in Firestore", !!doc && doc.subAccountId === A);
  check("B2. it was created as a draft, not published", doc.status === "draft", `status=${doc.status}`);

  // ── C. It appears in the Growth Plan ───────────────────────────────────
  console.log("\nC. Growth Plan visibility");
  let plan = await resolveGrowthPlanExecution(A);
  let item = plan.find((p) => p.artifactId === id);
  check("C1. the built work appears in the Growth Plan", !!item, `${plan.length} item(s)`);
  check("C2. it is described in customer nouns, not capability names",
    item!.kind === "Landing page" && !JSON.stringify(item).includes("create_funnel"));
  check("C3. the plan carries no internal orchestration terminology",
    !/criticVerdict|visualRequirements|subAccountId|bridge_/.test(JSON.stringify({ ...item, artifactId: "" })));

  // ── D. Zeno completion, Growth Plan and artifact AGREE ─────────────────
  console.log("\nD. Three surfaces agree");
  const completionText = built.completion ? renderCompletion(built.completion) : "";
  check("D1. Zeno says it is built and needs review",
    /built|ready/i.test(completionText) && /draft|not public/i.test(completionText));
  check("D2. Growth Plan says the same thing", /built/i.test(item!.stateLabel) && item!.stage === "needs_you",
    item!.stateLabel);
  check("D3. the artifact's own state agrees", doc.status === "draft");
  // AUDIT OF THIS CHECK: the first version matched any occurrence of "live",
  // which fired on the review note "check it before this goes live" — a
  // WARNING not to publish, i.e. correct copy. Assert the CLAIM, not the word.
  const CLAIMS_LIVE = /\b(?:is|now|already)\s+(?:live|published)\b|\bhas been published\b|\bwe(?:'ve| have) published\b/i;
  check("D4. none of the three CLAIMS it is live",
    !CLAIMS_LIVE.test(completionText) && item!.stage !== "live" && doc.status !== "published",
    (completionText.match(CLAIMS_LIVE) ?? [""])[0]);
  check("D4-control. the claims-live detector actually fires",
    CLAIMS_LIVE.test("Your page is now live at that address."));

  // ── E. DRAFT PREVIEW LAW ───────────────────────────────────────────────
  console.log("\nE. Draft preview");
  check("E1. the plan exposes a preview path", item!.nextAction.href === `/preview/funnel/${id}`);
  check("E2. it is a review action, not a dead end", /preview|review/i.test(item!.nextAction.label));

  // ── G/H. APPROVAL SAFETY + PUBLIC RENDERING ────────────────────────────
  console.log("\nG/H. Approved is not published");
  // Non-vacuous: prove it is NOT publicly renderable BEFORE approving, so
  // the assertion below cannot pass against something already public.
  check("H1. an unapproved draft is not publicly renderable", (await loadFunnelForRender(id)) === null);

  await db.doc(`funnels/${id}`).update({ status: "approved" });
  doc = (await db.doc(`funnels/${id}`).get()).data()!;
  check("G1. approving did NOT change status to published", doc.status === "approved");
  check("G2. an APPROVED artifact is still not publicly renderable",
    (await loadFunnelForRender(id)) === null, "approved ≠ published");

  plan = await resolveGrowthPlanExecution(A);
  item = plan.find((p) => p.artifactId === id)!;
  check("G3. the plan says approved but NOT published",
    /approved/i.test(item.stateLabel) && /not published/i.test(item.stateLabel), item.stateLabel);
  check("G4. the plan never labels an approved artifact as Live", item.stage !== "live");

  // I. Publication is deliberately NOT exercised — flipping a probe funnel
  // to `published` would create publicly-renderable state on a live
  // deployment. H (the mandatory half) is proven above; this is the
  // explicit reason I is omitted, not a skipped check reported as a pass.
  console.log("I. publication NOT exercised — would create public probe state (H proven instead)");

  // ── L. TENANT ISOLATION ────────────────────────────────────────────────
  console.log("\nL. Tenant isolation");
  const SENT = `ZZFOREIGNPLAN${Date.now()}`;
  const fRes = await createFunnelServerSide({ subAccountId: B, createdByUid: ctx.uid, name: SENT, genre: "lead_gen" } as never);
  const foreignId = typeof fRes === "string" ? fRes : (fRes as { id: string }).id;
  cleanup.push(() => db.doc(`funnels/${foreignId}`).delete().catch(() => {}));
  const fdoc = (await db.doc(`funnels/${foreignId}`).get()).data()!;
  check("L1. the foreign artifact genuinely exists and belongs to B",
    fdoc.subAccountId === B && fdoc.name === SENT);

  const planA = await resolveGrowthPlanExecution(A);
  check("L2. workspace B's artifact is ABSENT from workspace A's plan",
    !planA.some((p) => p.artifactId === foreignId));
  check("L3. its sentinel appears nowhere in A's plan", !JSON.stringify(planA).includes(SENT));
  const planB = await resolveGrowthPlanExecution(B);
  check("L4. isolation holds in both directions", !planB.some((p) => p.artifactId === id));

  // ── K. U1 on the customer completion ───────────────────────────────────
  console.log("\nK. U1 boundary");
  for (const [needle, why] of [
    [id, "raw artifact id"], ["create_funnel", "capability name"],
    ["bridge_next_funnel_id", "bridge parameter"], ["Critic", "Critic reasoning"],
    ["subAccountId", "developer terminology"],
  ] as [string, string][]) {
    check(`K. completion omits ${why}`, !completionText.includes(needle));
  }
  check("K. plan text omits Firestore-style ids",
    !/\b[A-Za-z0-9_-]{20}\b/.test(JSON.stringify(plan.map((p) => ({ ...p, artifactId: "", nextAction: { ...p.nextAction, href: "" } })))));
} finally {
  for (const c of cleanup.reverse()) await c();
  console.log("\n(probe artifacts deleted)");
}

console.log(bad ? `\n${bad} FAILED` : "\nP0.6 CRITICAL JOURNEY CERTIFIED");
process.exit(bad ? 1 : 0);
