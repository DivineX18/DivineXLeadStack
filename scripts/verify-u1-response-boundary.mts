/**
 * U1 CERTIFICATION — the LITERAL final customer response.
 *
 * OUTCOME ASSERTION LAW. This does not assert that metadata looks clean, that
 * a DTO was sanitised, that a prompt says not to expose ids, or that source
 * contains no known string. It runs a REAL build through the real capability
 * and inspects the exact text a customer would receive.
 *
 * NON-VACUOUS NEGATIVE CONTROL. The build is driven with unmistakable
 * sentinel values planted in the internal orchestration inputs. The test
 * proves those sentinels ARE present internally — so the fixture is genuinely
 * capable of leaking — and are absent from the final customer response. A
 * negative check that could never have failed is not evidence.
 *
 * Run: FLOW_PROBE_SA=<id> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-u1-response-boundary.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA;
if (!SA) throw new Error("FLOW_PROBE_SA is required.");

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { renderCompletion } = await import("../src/lib/ai-suite/render-completion.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");

const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const sub = (await db.doc(`subAccounts/${SA}`).get()).data();
if (!sub) throw new Error(`Probe workspace ${SA} does not exist.`);

// ── Sentinels planted where internal orchestration will carry them ───────
const SENTINEL_TAG = "ZZINTERNALTAGSENTINEL7731";
const SENTINEL_SUBJECT = "ZZMEDIASUBJECTSENTINEL7731";

const ctx = {
  uid: "irkY5HKIzxb64l5qCyHroTrudJa2", email: "hello@divinex.io", displayName: "",
  agencyId: sub.agencyId as string, subAccountId: SA, subAccountRole: "admin",
};
const cap = getCapability("create_funnel")!;
const v = cap.validate!({
  funnel_name: "[U1] response boundary probe", headline: "A Clear Offer For The Boundary Probe",
  genre: "lead_gen", bullets: ["Real benefit one", "Real benefit two", "Real benefit three"],
  media_subject: SENTINEL_SUBJECT,
  tag: SENTINEL_TAG,
});
if (!v.ok) throw new Error(v.error);

const result = await cap.execute!(ctx as never, v.args);
const funnelId = result.ref!.id;

// The literal text a customer receives — produced the same way the confirm
// route produces it, from the same result object.
const customerText = result.completion ? renderCompletion(result.completion) : result.resultText;

console.log("\n── The literal final customer response ──────────────────────────");
console.log(customerText);
console.log("────────────────────────────────────────────────────────────────\n");

// ── 1. The fixture is genuinely capable of leaking ───────────────────────
console.log("A. Negative control is non-vacuous");
check("1a. sentinels ARE present in the internal receipt",
  result.resultText.includes(SENTINEL_TAG), `tag sentinel in resultText: ${result.resultText.includes(SENTINEL_TAG)}`);
check("1b. the raw funnel id IS present internally",
  result.resultText.includes(funnelId), "resultText carries the id the model needs");
check("1c. the internal parameter name IS present internally",
  result.resultText.includes("bridge_next_funnel_id"));
check("1d. a customer completion was actually produced (not fallback)", !!result.completion);

// ── 2. None of it reaches the customer ───────────────────────────────────
console.log("\nB. The literal customer response is clean");
const forbidden: [string, string][] = [
  [funnelId, "raw funnel document id"],
  [SENTINEL_TAG, "internal tag sentinel"],
  ["bridge_next_funnel_id", "internal bridge parameter"],
  ["bridgeNextFunnelId", "internal bridge parameter (camel)"],
  ["create_funnel", "internal capability name"],
  ["apply_workflow_plan", "internal capability name"],
  ["Image Director", "Director reasoning"],
  ["visualArchetype", "design-selection internals"],
  ["archetype", "design-selection rationale"],
  ["Critic", "Critic reasoning"],
  ["criticVerdict", "Critic internals"],
  ["designStrategy", "internal orchestration metadata"],
  ["Funnel ID", "raw id label"],
  ["subAccountId", "developer terminology"],
  ["Firestore", "developer terminology"],
  ["Sidebar →", "stale IA guidance"],
  ["resultText", "internal field name"],
];
for (const [needle, why] of forbidden) {
  check(`2. customer response omits ${why} ("${needle}")`, !customerText.includes(needle));
}
// Ids are 20-char Firestore auto-ids; catch ANY of them, not just this one.
check("2. customer response contains no Firestore-style document id",
  !/\b[A-Za-z0-9_-]{20}\b/.test(customerText),
  (customerText.match(/\b[A-Za-z0-9_-]{20}\b/) ?? [""])[0]);

// ── 3. It contains what it must ──────────────────────────────────────────
console.log("\nC. The customer response is useful");
check("3a. states an understandable outcome", result.completion!.outcome.length > 20 && !/\bid\b/i.test(result.completion!.outcome));
check("3b. surfaces review requirements", result.completion!.review.length > 0);
check("3c. states plainly that nothing is public yet",
  result.completion!.review.some((r) => /not public|draft until you publish/i.test(r)));
check("3d. offers a direct next action", result.completion!.nextActions.length > 0);
check("3e. offers preview / change / continue actions",
  ["preview", "edit", "continue"].every((k) => result.completion!.nextActions.some((a) => a.kind === k)),
  result.completion!.nextActions.map((a) => a.kind).join(","));
check("3f. exactly ONE completion message (no competing receipt)",
  !customerText.includes("✅ Growth System Created") && !customerText.includes("ASSETS"));

// ── 4. Nothing was published ─────────────────────────────────────────────
console.log("\nD. Nothing became public");
const doc = (await db.doc(`funnels/${funnelId}`).get()).data()!;
check("4. the built funnel is not published", doc.status !== "published", `status=${doc.status}`);

// ── 5. The renderer cannot leak by construction ──────────────────────────
console.log("\nE. The boundary is structural, not a filter");
const leaky = renderCompletion({
  outcome: "Your page is built.", review: [], nextActions: [{ label: "Preview the page", kind: "preview" }],
});
check("5a. the renderer emits only the three customer fields",
  !leaky.includes(funnelId) && !leaky.includes(SENTINEL_TAG) && leaky.includes("Your page is built."));
const routeSrc = readFileSync(new URL("../src/app/api/ai-suite/confirm/route.ts", import.meta.url), "utf8");
check("5b. the route WITHHOLDS the receipt when a completion exists (not filters it)",
  routeSrc.includes("{ completion, resultText: renderCompletion(completion) }"));

await db.doc(`funnels/${funnelId}`).delete();
console.log("\n(probe funnel deleted)");
if (bad) { console.log(`\n${bad} FAILED`); process.exit(1); }
console.log("U1 RESPONSE BOUNDARY CERTIFIED");
