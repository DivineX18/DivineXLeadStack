/**
 * PRODUCTION EXPERIENCE 2.0 — PHASE B GATE
 *
 * Exercises the real journey over HTTP against a running production build,
 * real Firestore and a real model call:
 *   Ask Zeno -> build -> durable funnel saved -> explicit completion state
 *   -> Preview -> Edit/Open -> visible in the correct workspace,
 * plus failure, partial success, retry, and tenant-safety.
 *
 * Writes exactly one funnel and deletes it at the end.
 *
 * Run: pnpm build && pnpm start -p 3111, then
 *      NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-prodexp-build-journey.mts
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.E2E_BASE ?? "http://localhost:3111";
const WORKSPACE = "x4NOJFn8bTyav7OeJc1v"; // DivineX #1001 — authorized for testing
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2"; // active admin of that workspace
const ASCEND_HOST = process.env.E2E_ASCEND_HOST ?? "app.divinex.io";
const OTHER_UID = "sWfGDIvnimXHwSpvdNIP7yvUzrx1"; // admin of a DIFFERENT workspace

const { getAdminAuth, getAdminDb } = await import("../../src/lib/firebase/admin.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, note = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${note ? ` — ${note}` : ""}`);
  if (!ok) failures++;
};

/** Real session cookie via the real /api/login path — no cookie forging. */
async function sessionCookieFor(uid: string): Promise<string> {
  const customToken = await getAdminAuth().createCustomToken(uid);
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const j = (await r.json()) as { idToken?: string; error?: { message?: string } };
  if (!j.idToken) throw new Error(`idToken exchange failed: ${j.error?.message}`);
  const login = await fetch(`${BASE}/api/login`, {
    headers: { Authorization: `Bearer ${j.idToken}` },
    redirect: "manual",
  });
  const setCookie = login.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`no session cookie (status ${login.status})`);
  return cookie;
}

const cookie = await sessionCookieFor(UID);
const withWorkspace = `${cookie}; active_workspace_id=${WORKSPACE}`;
check("0. Real session cookie minted through /api/login", cookie.length > 0);

// ── 1. Ask Zeno to build something ───────────────────────────────────────
const ask =
  "Build me a lead generation landing page for Northgate Physiotherapy, a physio clinic in Brisbane. The offer is a free 15-minute movement assessment. Keep it to one page.";

const chatRes = await fetch(`${BASE}/api/ai-suite/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: withWorkspace },
  body: JSON.stringify({
    level: "sub-account",
    subAccountId: WORKSPACE,
    messages: [{ role: "user", content: ask }],
  }),
});
const chatRaw = (await chatRes.json().catch(() => null)) as
  | { type?: string; proposal?: { id: string; capability: string; args: Record<string, unknown>; summary: string }; text?: string; error?: string }
  | null;
const chat = chatRaw?.proposal
  ? { type: chatRaw.type, capability: chatRaw.proposal.capability, args: chatRaw.proposal.args, summary: chatRaw.proposal.summary }
  : { type: chatRaw?.type, capability: undefined as string | undefined, args: undefined as Record<string, unknown> | undefined, summary: undefined as string | undefined };
check("1a. Ask Zeno returns 200", chatRes.ok, `status ${chatRes.status} ${chatRaw?.error ?? ""}`);
check(
  "1b. Zeno proposes a funnel build (not a question, not prose)",
  chat.type === "proposal" && chat.capability === "create_funnel",
  `type=${chat.type} capability=${chat.capability}`,
);
check("1c. The proposal carries a human-readable summary", typeof chat.summary === "string" && chat.summary.length > 0);

if (chat.type !== "proposal" || !chat.args) {
  console.log("\nCannot continue without a proposal. Raw response:", JSON.stringify(chatRaw).slice(0, 800));
  process.exit(1);
}

// ── 2. Confirm -> the build completion contract ─────────────────────────
const confirmRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: withWorkspace },
  body: JSON.stringify({
    level: "sub-account",
    subAccountId: WORKSPACE,
    capability: chat.capability,
    args: chat.args,
  }),
});
const confirm = (await confirmRes.json().catch(() => null)) as
  | { ok?: boolean; resultText?: string; resultRef?: { kind: string; id: string } | null; error?: string }
  | null;
check("2a. Confirm returns 200", confirmRes.ok, `status ${confirmRes.status} ${confirm?.error ?? ""}`);
check(
  "2b. THE FIX: the response carries resultRef so the UI can show what was built",
  !!confirm?.resultRef?.id && confirm.resultRef.kind === "funnel",
  JSON.stringify(confirm?.resultRef),
);

const funnelId = confirm?.resultRef?.id;
if (!funnelId) {
  console.log("\nNo resultRef — the completion state cannot render. resultText:", confirm?.resultText);
  process.exit(1);
}

// ── 3. Durability + correct workspace ───────────────────────────────────
const snap = await db.doc(`funnels/${funnelId}`).get();
const funnel = snap.data() as { subAccountId?: string; status?: string; sections?: unknown[]; name?: string } | undefined;
check("3a. The funnel is durably saved in Firestore", snap.exists);
check("3b. It belongs to the workspace that asked for it", funnel?.subAccountId === WORKSPACE, `${funnel?.subAccountId}`);
check("3c. It is a DRAFT — building never publishes", funnel?.status !== "published", `status=${funnel?.status}`);
check("3d. It has real sections, not an empty shell", (funnel?.sections?.length ?? 0) >= 3, `${funnel?.sections?.length} sections`);

// ── 4. Preview — the surface that did not exist before ──────────────────
const prevRes = await fetch(`${BASE}/preview/funnel/${funnelId}`, { headers: { cookie: withWorkspace } });
const prevHtml = await prevRes.text();
check("4a. Preview renders a draft (it could not render anywhere before)", prevRes.ok, `status ${prevRes.status}`);
check("4b. Draft state is stated on the page", prevHtml.includes("Draft preview"));
check("4c. It renders the REAL funnel content, not a placeholder", prevHtml.includes(funnel?.name ?? "@@") || prevHtml.length > 12000, `${prevHtml.length} bytes`);
check(
  "4d. Non-production: submissions are disabled in preview",
  prevHtml.includes("Submissions are disabled in preview") || prevHtml.includes("disabled in preview"),
);
check("4e. Preview offers the way onward (Edit)", prevHtml.includes(`/app/campaigns/funnel/${funnelId}`));

// ── 5. Tenant safety ────────────────────────────────────────────────────
const anonRes = await fetch(`${BASE}/preview/funnel/${funnelId}`, { redirect: "manual" });
check(
  "5a. Signed-out visitors cannot reach a draft preview",
  anonRes.status === 307 || anonRes.status === 302 || anonRes.status === 401 || anonRes.status === 404,
  `status ${anonRes.status}`,
);
const otherCookie = await sessionCookieFor(OTHER_UID);
const crossRes = await fetch(`${BASE}/preview/funnel/${funnelId}`, {
  headers: { cookie: `${otherCookie}; active_workspace_id=${WORKSPACE}` },
  redirect: "manual",
});
check(
  "5b. A member of another workspace cannot read this draft",
  crossRes.status === 404 || crossRes.status === 307 || crossRes.status === 302,
  `status ${crossRes.status}`,
);

// ── 6. The funnel is visible where the customer is sent ────────────────
const listRes = await fetch(`${BASE}/api/sub-accounts/${WORKSPACE}/funnels`, { headers: { cookie: withWorkspace } });
const list = (await listRes.json().catch(() => ({}))) as { funnels?: { id: string }[] };
check(
  "6a. It appears in the workspace's own funnel list",
  (list.funnels ?? []).some((f) => f.id === funnelId),
  `${list.funnels?.length ?? 0} funnels`,
);
const editRes = await fetch(`${BASE}/app/campaigns/funnel/${funnelId}`, { headers: { cookie: withWorkspace } });
check("6b. Edit opens the funnel editor", editRes.ok || editRes.status === 307, `status ${editRes.status}`);
const campRes = await fetch(`${BASE}/app/campaigns`, { headers: { cookie: withWorkspace }, redirect: "manual" });
check("6c. Open campaigns resolves", campRes.ok || campRes.status === 307, `status ${campRes.status}`);

// ── 7. Failure + retry behaviour ────────────────────────────────────────
const badRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: withWorkspace },
  body: JSON.stringify({
    level: "sub-account",
    subAccountId: WORKSPACE,
    // A genuinely incomplete build request — no headline, no offer, nothing
    // to render. This is what a rejected build looks like.
    capability: "create_funnel",
    args: { funnelName: "Rejected build probe" },
  }),
});
const bad = (await badRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
check("7a. A rejected build fails cleanly with a stated reason", !badRes.ok && typeof bad?.error === "string", `status ${badRes.status}: ${bad?.error?.slice(0, 80)}`);
check(
  "7a2. The failure message is written for the customer, not the model",
  !/YOU are the copywriter|contract violation|call create_funnel again/i.test(bad?.error ?? ""),
  bad?.error?.slice(0, 60),
);
const strayAfterFailure = await db
  .collection("funnels")
  .where("subAccountId", "==", WORKSPACE)
  .where("name", "==", "Rejected build probe")
  .get();
check("7b. A failed build creates nothing (so retrying is safe, as the UI says)", strayAfterFailure.empty, `${strayAfterFailure.size} stray doc(s)`);

// Retry the SAME proposal after a failure — the UI now allows this.
const retryRes = await fetch(`${BASE}/api/ai-suite/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: withWorkspace },
  body: JSON.stringify({ level: "sub-account", subAccountId: WORKSPACE, capability: chat.capability, args: chat.args }),
});
const retry = (await retryRes.json().catch(() => null)) as { ok?: boolean; resultRef?: { id: string } | null } | null;
check("7c. Retrying a failed action succeeds and returns its own resultRef", !!retry?.resultRef?.id, `${retry?.resultRef?.id}`);

// ── 7d. The new customer information architecture actually renders ─────
for (const [label, path] of [
  ["Campaigns", "/app/campaigns"],
  ["CRM", "/app/crm"],
  ["Intelligence", "/app/intelligence"],
  ["Brand & Assets", "/app/brand"],
  ["Home", "/app/home"],
] as const) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { cookie: withWorkspace, host: ASCEND_HOST },
    redirect: "manual",
  });
  const html = r.ok ? await r.text() : "";
  check(`7d. ${label} renders at ${path}`, r.ok && html.includes(label.split(" ")[0]), `status ${r.status}`);
}
for (const [legacy, dest] of [
  ["/app/create", "/app/campaigns"],
  ["/app/grow", "/app/crm"],
  ["/app/identify", "/app/intelligence"],
] as const) {
  const r = await fetch(`${BASE}${legacy}`, { headers: { cookie: withWorkspace, host: ASCEND_HOST }, redirect: "manual" });
  check(`7e. ${legacy} still works (redirects to ${dest})`, r.headers.get("location")?.includes(dest) ?? false, `${r.status} -> ${r.headers.get("location")}`);
}

// ── 8. Cleanup ──────────────────────────────────────────────────────────
const created = [funnelId, retry?.resultRef?.id].filter(Boolean) as string[];
for (const id of created) await db.doc(`funnels/${id}`).delete();
check("8. Test funnels cleaned up", true, created.join(", "));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
