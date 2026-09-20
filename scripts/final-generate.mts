/**
 * FINAL E2E — Steps 5 & 6. Intelligence bridge, then ONE landing page.
 *
 * Brand discovery and asset approval run first because they are part of the
 * ordinary onboarding a customer completes, and because a page generated
 * against an empty library proves nothing about media distribution.
 *
 * The generation request deliberately says nothing about the business, its
 * constraint, or what to build. If the page comes back grounded, the grounding
 * arrived through the product's own bridge — which is the thing being certified.
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const FLOW = "https://crm.divinex.io";
const ASCEND = "https://divinex-business-intelligence.onrender.com";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const SA = process.env.QA_SA!;
const PROFILE = Number(process.env.QA_PROFILE!);

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const sign = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await sign.json()) as any;
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const api = async (p: string, init?: { method?: string; body?: unknown; timeoutMs?: number }) => {
  const r = await fetch(`${FLOW}${p}`, {
    method: init?.method ?? "GET",
    headers: { cookie, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(init?.timeoutMs ?? 600_000),
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j };
};
const ascendGet = async (path: string, ws?: string) => {
  const r = await fetch(`${ASCEND}${path}`, {
    headers: { Authorization: `Bearer ${process.env.ASCEND_SSO_SHARED_SECRET}`, ...(ws ? { "x-divinex-workspace": ws } : {}) },
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j };
};

// ── Ordinary onboarding: discover the brand, confirm it, approve the assets ──
console.log("discovery ...");
const d = await api("/api/app/onboarding", { method: "POST", body: { subAccountId: SA, action: "discover", websiteUrl: "https://www.divinex.io" }, timeoutMs: 300_000 });
console.log("  discover ->", d.s);
const ident = d.j?.discovery?.identity ?? {};
await api("/api/app/onboarding", {
  method: "POST",
  body: {
    subAccountId: SA,
    action: "confirm_brand",
    business: { businessName: ident.businessName || "DivineX", websiteUrl: "https://www.divinex.io" },
    brandVisual: { tokens: { palette: d.j?.discovery?.tokens?.palette ?? [], logoUrl: ident.logoUrl } },
  },
});
const p0 = await ascendGet(`/api/divinex/profile/${PROFILE}`, SA);
const assets = (p0.j?.assets ?? []) as { id: number; fileUrl: string }[];
const firstParty = assets.filter((a) => /divinex\.io\//i.test(a.fileUrl));
const rev = await api("/api/app/onboarding", {
  method: "POST",
  body: { subAccountId: SA, action: "review_assets", decisions: firstParty.map((a) => ({ id: a.id, status: "approved" })) },
});
console.log(`  assets ${assets.length}, approved ${firstParty.length} ->`, rev.s);
// Re-run start so the profile binding lands now the snapshot doc exists.
await api("/api/app/onboarding", { method: "POST", body: { subAccountId: SA, action: "start" } });

// ── STEP 5 — the bridge, unprompted ─────────────────────────────────────
console.log("\n══ STEP 5 — intelligence bridge ══");
const messages: { role: string; content: string }[] = [{ role: "user", content: "Create a landing page for my business." }];
let proposal: { capability: string; args: Record<string, unknown> } | null = null;

for (let turn = 1; turn <= 4 && !proposal; turn++) {
  const r = await api("/api/ai-suite/chat", { method: "POST", body: { level: "sub-account", subAccountId: SA, messages } });
  if (r.s !== 200) { console.log("chat ->", r.s, r.t.slice(0, 300)); process.exit(1); }
  if (r.j?.type === "proposal") { proposal = r.j.proposal; break; }
  const text = String(r.j?.text ?? "");
  if (turn === 1) {
    console.log("  assistant (unprompted knowledge):");
    console.log("   ", text.slice(0, 600).replace(/\n+/g, " "));
  }
  messages.push({ role: "assistant", content: text });
  messages.push({
    role: "user",
    content: turn === 1 ? "The free Business Growth Scan. I want visitors to submit the scan request. Go ahead and build it." : "Yes, go ahead.",
  });
}
if (!proposal) { console.log("no proposal"); process.exit(1); }

// ── STEP 6 — exactly one page ───────────────────────────────────────────
console.log("\n══ STEP 6 — generate ONE funnel ══");
const a = proposal.args as Record<string, any>;
for (const k of ["funnelName", "genre", "objective", "awareness", "trafficTemperature", "headline", "ctaLabel", "includeCaptureForm", "priceCents", "realRating", "suppliedEvidenceLogos"]) {
  if (k in a) console.log(`  ${k}:`, JSON.stringify(a[k]));
}
const exec = await api("/api/ai-suite/confirm", {
  method: "POST",
  body: { level: "sub-account", subAccountId: SA, capability: proposal.capability, args: proposal.args },
  timeoutMs: 900_000,
});
console.log("\nconfirm ->", exec.s);
console.log(JSON.stringify(exec.j ?? exec.t).slice(0, 900));
writeFileSync("/tmp/final-result.json", JSON.stringify(exec.j ?? { raw: exec.t }, null, 2));
const funnelId = exec.j?.resultRef?.id;
console.log("\nFUNNEL_ID=" + funnelId);
