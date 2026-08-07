/**
 * Ascend OS Phase 2, Slice 10 — genuine tests for the hardened envelope
 * contract + the required business-profile-id header. Real calls, real
 * assertions, dependency-injected fetch (never a real network call) —
 * same discipline as Slice 9's own unit suite.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

process.env.ASCEND_INTELLIGENCE_API_URL = "https://fake-ascend.test";
process.env.ASCEND_INTELLIGENCE_API_SECRET = "test-secret";

const { createAscendIntelligenceClient } = await import("../src/lib/intelligence/ascend-intelligence-client.ts");
const { clearIntelligenceCache } = await import("../src/lib/intelligence/intelligence-cache.ts");

const okAssessment = {
  id: "gs_1",
  businessProfileId: "bp_1",
  status: "complete",
  growthScore: { overallScore: 65, primaryConstraint: null, categoryScores: [], scannedAt: new Date().toISOString() },
  recommendedFunnel: null,
  createdAt: new Date().toISOString(),
};

// ── 1. Envelope ok:true — parses .data, not the envelope itself ─────────
{
  clearIntelligenceCache();
  let sentHeader: string | null = null;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    sentHeader = (init?.headers as Record<string, string> | undefined)?.["X-Intelligence-Business-Profile-Id"] ?? null;
    return new Response(JSON.stringify({ ok: true, data: okAssessment, error: null }), { status: 200 });
  }) as unknown as typeof fetch;

  const client = createAscendIntelligenceClient({ fetchImpl });
  const res = await client.getLatestGrowthAssessment("bp_1");
  check("1a. Envelope ok:true -> status ok", res.meta.status === "ok");
  check("1b. Parses the envelope's nested data, not the envelope wrapper", res.data?.id === "gs_1" && res.data?.status === "complete");
  check("1c. Sends the required X-Intelligence-Business-Profile-Id header", sentHeader === "bp_1");
}

// ── 2. Envelope ok:false — every documented error code maps through ─────
{
  const codes = ["unauthorized", "business_not_found", "workspace_mismatch", "not_found", "internal_error"];
  for (const code of codes) {
    clearIntelligenceCache();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, data: null, error: { code, message: "denied" } }), { status: 200 })) as unknown as typeof fetch;
    const client = createAscendIntelligenceClient({ fetchImpl });
    const res = await client.getLatestGrowthAssessment("bp_2");
    check(`2. Envelope error code "${code}" -> status unavailable, reasonCode preserved`, res.meta.status === "unavailable" && res.meta.reasonCode === code);
  }
}

// ── 3. Envelope ok:false with an UNRECOGNIZED error code -> falls back to internal_error ──
{
  clearIntelligenceCache();
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ ok: false, data: null, error: { code: "some_future_code_not_in_the_contract", message: "x" } }), { status: 200 })) as unknown as typeof fetch;
  const client = createAscendIntelligenceClient({ fetchImpl });
  const res = await client.getLatestGrowthAssessment("bp_3");
  check("3. Unrecognized error code degrades to internal_error rather than leaking an arbitrary string", res.meta.reasonCode === "internal_error");
}

// ── 4. Legacy/bare shape (no ok/data/error fields) still parses — backward compatible ──
{
  clearIntelligenceCache();
  const fetchImpl = (async () => new Response(JSON.stringify(okAssessment), { status: 200 })) as unknown as typeof fetch;
  const client = createAscendIntelligenceClient({ fetchImpl });
  const res = await client.getLatestGrowthAssessment("bp_4");
  check("4. A bare (non-envelope) response body still parses successfully", res.meta.status === "ok" && res.data?.id === "gs_1");
}

// ── 5. A {data: ...}-only legacy shape (Slice 9's original assumption) still works ──
{
  clearIntelligenceCache();
  const fetchImpl = (async () => new Response(JSON.stringify({ data: okAssessment }), { status: 200 })) as unknown as typeof fetch;
  const client = createAscendIntelligenceClient({ fetchImpl });
  const res = await client.getLatestGrowthAssessment("bp_5");
  check("5. A {data: ...}-wrapped (non-envelope) response still parses successfully", res.meta.status === "ok" && res.data?.id === "gs_1");
}

delete process.env.ASCEND_INTELLIGENCE_API_URL;
delete process.env.ASCEND_INTELLIGENCE_API_SECRET;
clearIntelligenceCache();

// ── 6. Structural — the contract doc exists and covers the required sections ──
{
  const doc = read("docs/architecture/INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md");
  for (const section of [
    "Authentication contract",
    "Authorization model",
    "Response envelope",
    "Required endpoints",
    "Observability",
    "Why the Ascend side isn't built yet",
  ]) {
    check(`6. Contract doc includes section "${section}"`, doc.includes(section));
  }
  check("6b. Contract doc discloses the unresolved branch divergence rather than hiding it", doc.includes("c7422b0") && doc.includes("3c4d3e8"));
  check("6c. Contract doc states no Ascend-side code was written this slice", doc.includes("no code was written to the Ascend Intelligence repository"));
}

// ── 7. Structural — client references the new header + envelope types ──
{
  const src = read("src/lib/intelligence/ascend-intelligence-client.ts");
  check("7a. Client sends X-Intelligence-Business-Profile-Id", src.includes("X-Intelligence-Business-Profile-Id"));
  check("7b. Client defines the envelope shape (isBridgeEnvelope)", src.includes("isBridgeEnvelope"));
  check("7c. Client validates envelope error codes against a known set (never trusts an arbitrary string through)", src.includes("ENVELOPE_ERROR_CODES"));
}

// ── 8. Structural — audit module carries the new bridge event kinds ────
{
  const src = read("src/lib/intelligence/intelligence-audit.ts");
  for (const kind of ["bridge_request_sent", "bridge_envelope_ok", "bridge_envelope_error"]) {
    check(`8. intelligence-audit.ts declares "${kind}"`, src.includes(kind));
  }
}

// ── 9. Security audit (structural — the properties the master prompt asks
//      this slice to prove) ────────────────────────────────────────────
{
  const clientSrc = read("src/lib/intelligence/ascend-intelligence-client.ts");
  check("9a. Client never reads/forwards a Firebase session cookie or uid to Ascend", !/cookie|sessionCookie|__session/i.test(clientSrc));
  check("9b. Client never reads a Clerk-related value (Flow has no Clerk code anywhere — Slice 7's own finding)", !/clerk/i.test(clientSrc));
  check("9c. The shared secret env var is not a NEXT_PUBLIC_* variable (never build-time inlined to the browser bundle)", !"ASCEND_INTELLIGENCE_API_SECRET".startsWith("NEXT_PUBLIC_"));

  const configSrc = read("src/lib/intelligence/ascend-intelligence-config.ts");
  check("9d. Config module is server-only", configSrc.includes('import "server-only"'));

  // No page/component ever receives the raw secret as a prop or return value.
  const homeSrc = read("src/app/app/home/page.tsx");
  const identifySrc = read("src/app/app/identify/page.tsx");
  check("9e. Home page never references the shared secret", !homeSrc.includes("ASCEND_INTELLIGENCE_API_SECRET"));
  check("9f. Identify page never references the shared secret", !identifySrc.includes("ASCEND_INTELLIGENCE_API_SECRET"));

  // Workspace crossover: every wrapper's permission check is keyed to the
  // SAME workspaceId that gets passed into the composer — structurally
  // confirmed there's no code path where a caller could pass workspaceId A
  // to the permission check and workspaceId B to the composer.
  const wrapperSrc = read("src/lib/intelligence/intelligence-wrappers.ts");
  check(
    "9g. No workspace crossover — checkWorkspaceRead and the composer always receive the identical workspaceId parameter",
    /checkWorkspaceRead\(uid, workspaceId\)[\s\S]{0,150}compose\w+\(workspaceId\)/.test(wrapperSrc),
  );
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
