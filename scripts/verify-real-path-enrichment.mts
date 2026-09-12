/**
 * IS THE FIXTURE HARNESS TESTING THE PRODUCT CUSTOMERS ACTUALLY USE?
 *
 * The five-fixture battery calls `create_funnel.execute()` directly with a
 * hand-written argument object. The real product does not: a customer types a
 * sentence, Zeno proposes a `create_funnel` call whose arguments IT wrote, and
 * the customer confirms it. Those are different inputs, and a claim that "in
 * real use Zeno supplies the richer fields" is an assertion until the two are
 * run side by side.
 *
 * So this runs the SAME five businesses down the real path — POST the ask to
 * /api/ai-suite/chat, take the proposal exactly as returned, confirm it — and
 * prints what Zeno actually put in the arguments. Nothing here writes a field
 * on Zeno's behalf, edits its proposal, or adds a business fact: each `ask`
 * carries only facts the fixture already asserts (see the fixtures file), and
 * whatever comes back is the product's real output.
 *
 * It answers one question with evidence rather than inference: does the normal
 * customer path deliver materially more than the thin-input floor, and if so,
 * exactly which fields.
 *
 *   FLOW_PROBE_SA=<subAccountId> FLOW_PROBE_UID=<ownerUid> \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/verify-real-path-enrichment.mts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA;
const UID = process.env.FLOW_PROBE_UID;
if (!SA || !UID) throw new Error("FLOW_PROBE_SA and FLOW_PROBE_UID are required.");
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/private/tmp/real-path";
mkdirSync(OUT, { recursive: true });

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const { FIXTURES } = await import("./fixtures/landing-page-fixtures.mts");

// Sign in as a real member the way the browser does, so the chat route runs
// under the same auth and tenancy it runs under for a customer.
const ct = await getAdminAuth().createCustomToken(UID);
const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await signIn.json()) as { idToken?: string };
if (!idToken) throw new Error("could not mint an id token for the probe user");
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
if (!cookie) throw new Error("no session cookie returned by /api/login");

/** The fields whose presence is the whole question. */
// CAMELIZED, because validate() aliases the snake_case tool schema into camel
// case before returning. Tracking the schema's names found nothing at all and
// read as "Zeno supplies none of this", which was the opposite of the truth.
const TRACKED = [
  "stageContent", "processSteps", "storyParagraphs", "faqItems",
  "heroTrustBadges", "trustBadges", "realRating", "suppliedEvidenceLogos",
  "salesArgument", "valueStack", "guaranteeHeadline", "ctaBannerHeadline",
  "mediaSubject", "visualArchetype", "emotionalTransformation",
] as const;

interface Row {
  id: string;
  ok: boolean;
  note: string;
  present: string[];
  stageEntries: number;
  itemsTotal: number;
  itemsDescribed: number;
  funnelId?: string;
}
const rows: Row[] = [];

for (const fx of FIXTURES) {
  console.log(`\n${"=".repeat(72)}\n${fx.label}\n${"=".repeat(72)}`);
  const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      level: "sub-account",
      subAccountId: SA,
      messages: [{ role: "user", content: fx.ask }],
      pageContext: { route: `/sa/${SA}/funnels` },
    }),
  });
  const chat = (await chatRes.json().catch(() => ({}))) as {
    type?: string;
    text?: string;
    proposal?: { capability?: string; args?: Record<string, unknown> };
  };

  if (chat.type !== "proposal" || chat.proposal?.capability !== "create_funnel") {
    console.log(`  NO PROPOSAL — type=${chat.type} ${(chat.text ?? "").slice(0, 160)}`);
    rows.push({ id: fx.id, ok: false, note: `no proposal (${chat.type})`, present: [], stageEntries: 0, itemsTotal: 0, itemsDescribed: 0 });
    continue;
  }

  // The proposal EXACTLY as Zeno wrote it. Never edited here.
  const args = chat.proposal.args ?? {};
  writeFileSync(`${OUT}/${fx.id}-zeno-args.json`, JSON.stringify(args, null, 2));

  const present = TRACKED.filter((k) => {
    const v = args[k];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });

  // The single most important measure: does Zeno write PER-ITEM DESCRIPTIONS?
  // That is what turns a bare checklist into a process visual with substance,
  // and the thin-input floor never has it.
  const stage = (args.stageContent as { section_type?: string; items?: { title?: string; description?: string }[] }[] | undefined) ?? [];
  let itemsTotal = 0;
  let itemsDescribed = 0;
  for (const entry of stage) {
    for (const it of entry.items ?? []) {
      itemsTotal++;
      if ((it.description ?? "").trim().length >= 20) itemsDescribed++;
    }
  }

  console.log(`  fields Zeno supplied: ${present.join(", ") || "(none of the tracked fields)"}`);
  console.log(`  stage_content entries: ${stage.length} (${stage.map((e) => e.section_type).join(", ")})`);
  console.log(`  per-item descriptions: ${itemsDescribed}/${itemsTotal}`);

  // Execute it the way the customer's confirm button does.
  const confirmRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ level: "sub-account", subAccountId: SA, capability: "create_funnel", args }),
  });
  // /api/ai-suite/confirm answers with `resultRef: { kind, id }`, not `ref`.
  const confirmed = (await confirmRes.json().catch(() => ({}))) as { resultRef?: { kind?: string; id?: string }; error?: string };
  const funnelId = confirmed.resultRef?.kind === "funnel" ? confirmed.resultRef.id : undefined;
  console.log(`  built: ${funnelId ?? `FAILED — ${confirmed.error ?? confirmRes.status}`}`);

  rows.push({
    id: fx.id,
    ok: !!funnelId,
    note: funnelId ? "" : (confirmed.error ?? String(confirmRes.status)),
    present: [...present],
    stageEntries: stage.length,
    itemsTotal,
    itemsDescribed,
    funnelId,
  });
}

console.log(`\n${"=".repeat(72)}\nWHAT THE REAL PATH SUPPLIES THAT THE FIXTURE DOES NOT\n${"=".repeat(72)}`);
for (const r of rows) {
  console.log(
    `${r.id.padEnd(16)} stage_content:${String(r.stageEntries).padStart(2)}  described items:${r.itemsDescribed}/${r.itemsTotal}  ${r.ok ? r.funnelId : `(${r.note})`}`,
  );
  console.log(`                 ${r.present.join(", ") || "(none)"}`);
}
console.log(`\nZeno's raw arguments written to ${OUT}/*-zeno-args.json`);
console.log(`funnel ids: ${rows.filter((r) => r.ok).map((r) => `${r.id}=${r.funnelId}`).join(" ")}`);
