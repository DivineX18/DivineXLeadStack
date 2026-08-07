/**
 * Ascend OS Phase 2, Slice 9 — structural tests. Verifies architectural
 * properties that a unit test can't (single fetch chokepoint, wrapper
 * composition, no leaked secrets, no duplicated endpoint strings) via
 * static source inspection — same technique as every prior slice's
 * structural suite (verify-shell-composition.mts, etc.).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// ── 1. Exactly one file calls fetch() against an Ascend host ───────────
{
  const intelligenceDir = path.join(root, "src/lib/intelligence");
  const files = execFileSync("find", [intelligenceDir, "-name", "*.ts"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const filesCallingFetchImpl = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /\bfetchImpl\(/.test(src) || /await\s+fetch\(/.test(src);
  });
  check(
    "1a. Exactly one file in lib/intelligence actually invokes fetch/fetchImpl (the client)",
    filesCallingFetchImpl.length === 1 && filesCallingFetchImpl[0].endsWith("ascend-intelligence-client.ts"),
  );
}

// ── 2. All Ascend reads route through the client — no other file
//      constructs an Ascend URL or reads ASCEND_INTELLIGENCE_API_SECRET ──
{
  const compileTargets = [
    "src/lib/intelligence/compose-home-dashboard.ts",
    "src/lib/intelligence/compose-identify-dashboard.ts",
    "src/lib/intelligence/resolve-intelligence-snapshot.ts",
    "src/lib/intelligence/intelligence-wrappers.ts",
    "src/lib/intelligence/compose-business-health.ts",
    "src/lib/intelligence/derive-next-action.ts",
  ];
  for (const f of compileTargets) {
    const src = read(f);
    check(`2. ${f} never reads ASCEND_INTELLIGENCE_API_SECRET directly`, !src.includes("ASCEND_INTELLIGENCE_API_SECRET"));
    check(`2. ${f} never constructs a /zeno/ path directly`, !src.includes("/zeno/"));
  }
}

// ── 3. No client secret ever reaches a "use client" component ──────────
{
  const componentsDir = path.join(root, "src/components/ascend");
  const files = execFileSync("find", [componentsDir, "-name", "*.tsx"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    check(`3. ${path.basename(f)} never references ASCEND_INTELLIGENCE_API_SECRET`, !src.includes("ASCEND_INTELLIGENCE_API_SECRET"));
    check(`3. ${path.basename(f)} never imports the client directly (data flows through props only)`, !src.includes("ascend-intelligence-client"));
  }
}

// ── 4. Wrappers compose — every wrapper checks workspace.read before
//      calling its compose* function ───────────────────────────────────
{
  const src = read("src/lib/intelligence/intelligence-wrappers.ts");
  check("4a. resolveHomeDashboard calls checkWorkspaceRead before composeHomeDashboard", /resolveHomeDashboard[\s\S]{0,200}checkWorkspaceRead[\s\S]{0,200}composeHomeDashboard/.test(src));
  check("4b. resolveIdentifyDashboard calls checkWorkspaceRead before composeIdentifyDashboard", /resolveIdentifyDashboard[\s\S]{0,200}checkWorkspaceRead[\s\S]{0,200}composeIdentifyDashboard/.test(src));
  check("4c. resolveIntelligenceSnapshot calls checkWorkspaceRead before composeIntelligenceSnapshot", /export async function resolveIntelligenceSnapshot[\s\S]{0,200}checkWorkspaceRead[\s\S]{0,200}composeIntelligenceSnapshot/.test(src));
  check("4d. Service wrapper requires a non-empty representedUid before delegating", /representedUid[\s\S]{0,80}return \{ ok: false/.test(src));
  check("4e. Reuses Slice 5's real evaluateWorkspacePermission — not a second evaluator", src.includes('from "@/lib/permissions/evaluate-workspace-permission"'));
}

// ── 5. Pure files stay pure (no Firebase/fetch import) ──────────────────
{
  const pureFiles = ["src/lib/intelligence/ascend-intelligence-retry.ts", "src/lib/intelligence/derive-next-action.ts"];
  for (const f of pureFiles) {
    const src = read(f);
    check(`5. ${f} has zero Firebase/fetch/Next.js imports (genuinely pure)`, !/firebase|next\/|fetch\(/.test(src));
  }
}

// ── 6. Cache is genuinely independent from CRM data paths ──────────────
{
  const src = read("src/lib/intelligence/intelligence-cache.ts");
  check("6a. Intelligence cache module never imports Firestore/Admin SDK", !src.includes("firebase"));
  check("6b. compose-business-health.ts (CRM/Flow data) never imports the intelligence cache", !read("src/lib/intelligence/compose-business-health.ts").includes("intelligence-cache"));
}

// ── 7. No duplicated endpoint-path string literals across the codebase
//      outside the one client file ──────────────────────────────────────
{
  const clientSrc = read("src/lib/intelligence/ascend-intelligence-client.ts");
  const endpointPaths = [
    "/internal/intelligence/business-profiles/",
    "/internal/intelligence/cro-audits",
    "/internal/intelligence/memory",
    "/internal/intelligence/growth-timeline/",
    "/internal/intelligence/reports",
  ];
  for (const p of endpointPaths) {
    check(`7. Endpoint path "${p}" is only constructed in the client file`, clientSrc.includes(p));
  }
  const otherIntelligenceFiles = [
    "src/lib/intelligence/compose-home-dashboard.ts",
    "src/lib/intelligence/compose-identify-dashboard.ts",
    "src/lib/intelligence/resolve-intelligence-snapshot.ts",
    "src/lib/intelligence/intelligence-wrappers.ts",
  ];
  for (const f of otherIntelligenceFiles) {
    const src = read(f);
    const leaked = endpointPaths.some((p) => src.includes(p));
    check(`7b. ${f} does not duplicate any endpoint path string`, !leaked);
  }
}

// ── 8. Types file has no runtime import (pure data) ──────────────────────
{
  const src = read("src/types/intelligence.ts");
  check("8. types/intelligence.ts imports nothing (pure types)", !/^import /m.test(src));
}

// ── 9. Every WithMeta-shaped card component renders IntelligenceStatusBadge ──
{
  const cardFiles = [
    "src/components/ascend/metric-card.tsx",
    "src/components/ascend/growth-score-card.tsx",
    "src/components/ascend/recommendation-card.tsx",
    "src/components/ascend/timeline-card.tsx",
    "src/components/ascend/memory-card.tsx",
    "src/components/ascend/business-health-card.tsx",
    "src/components/ascend/assessment-cards.tsx",
  ];
  for (const f of cardFiles) {
    const src = read(f);
    check(`9. ${f} renders IntelligenceStatusBadge (surfaces status honestly)`, src.includes("IntelligenceStatusBadge"));
  }
}

// ── 10. Home/Identify pages call the wrapper layer, never the composers directly ──
{
  const home = read("src/app/app/home/page.tsx");
  const identify = read("src/app/app/identify/page.tsx");
  check("10a. Home page imports resolveHomeDashboard from the wrapper file", home.includes('from "@/lib/intelligence/intelligence-wrappers"'));
  check("10b. Home page never imports the raw composer directly", !/^import .*compose-home-dashboard/m.test(home));
  check("10c. Identify page imports resolveIdentifyDashboard from the wrapper file", identify.includes('from "@/lib/intelligence/intelligence-wrappers"'));
  check("10d. Identify page never imports the raw composer directly", !/^import .*compose-identify-dashboard/m.test(identify));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
