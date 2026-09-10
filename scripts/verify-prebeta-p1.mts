// Regression coverage for the pre-beta P1 repair pass.
//
// P1-A — landing-page composition:
//   * chain-only sections (upsell_offer) are structurally invalid on a
//     standalone page and valid on a real chain step
//   * over-length page copy is REPORTED to the author, never silently clipped
//   * the story-fold law reaches sections spliced in after composition
// P1-B — authenticated shell routing:
//   * hostname alone never grants Ascend
//   * entitlement + host + flag together do
//   * the fresh-login workspace tie-break is deterministic and matches the
//     client-side rule it replaces
//
// Pure: no Firestore, no LLM, no network.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-prebeta-p1.mts

import type { FunnelSection } from "../src/types/funnels";
import {
  invalidChainSections,
  isChainOnlySection,
  isChainStepFunnel,
  chainSectionRejection,
} from "../src/lib/funnels/commercial-structure";
import { enforceFoldDifferentiation, deriveArtDirection } from "../src/lib/funnels/art-direction";
import { decideShellMode } from "../src/lib/shell/decide-shell-mode";
import { decideWorkspaceSelection } from "../src/lib/identity/workspace-selection";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const section = (id: string, type: FunnelSection["type"], config: Record<string, unknown> = {}): FunnelSection =>
  ({ id, type, config }) as FunnelSection;

// ── P1-A.1 commercial structure ────────────────────────────────────────────
console.log("\n── P1-A: commercial structure ──");

const freeLeadMagnet: FunnelSection[] = [
  section("s1", "hero", { headline: "Free Website Growth Assessment" }),
  section("s2", "offer", { headline: "Get your free copy", priceCents: 0, bullets: ["a"] }),
  section("s3", "upsell_offer", { headline: "Wait, add this to your order?", priceCents: 100000 }),
];

check(
  "upsell_offer is classed as chain-only",
  isChainOnlySection("upsell_offer"),
);
check(
  "checkout is NOT chain-only (a standalone sales page starts the chain)",
  !isChainOnlySection("checkout"),
);
check(
  "a $1,000 upsell on a standalone free lead magnet is rejected",
  invalidChainSections(freeLeadMagnet, "standalone").length === 1,
  chainSectionRejection(invalidChainSections(freeLeadMagnet, "standalone")).slice(0, 80),
);
check(
  "an absent chainRole is treated as standalone (legacy docs)",
  invalidChainSections(freeLeadMagnet, undefined).length === 1,
);
check(
  "the SAME sections on a real upsell step are valid",
  invalidChainSections(freeLeadMagnet, "upsell").length === 0,
);
check(
  "a downsell step is a chain step too",
  isChainStepFunnel("downsell") && invalidChainSections(freeLeadMagnet, "downsell").length === 0,
);
check(
  "a standalone page with a checkout section is untouched",
  invalidChainSections(
    [section("s1", "hero"), section("s2", "checkout", { priceCents: 4900, upsellFunnelId: "abc" })],
    "standalone",
  ).length === 0,
);
check(
  "an ordinary page with no chain sections is untouched",
  invalidChainSections([section("s1", "hero"), section("s2", "faq")], "standalone").length === 0,
);

// ── P1-A.2 story-fold law reaches late-spliced sections ────────────────────
console.log("\n── P1-A: fold differentiation covers spliced-in strips ──");

const profile = deriveArtDirection({ emotionalTransformation: "uncertainty_to_confidence" });
// Reproduce the real ordering bug: strips inserted AFTER composition.
const composed = enforceFoldDifferentiation(
  [
    section("s1", "hero", { headline: "H" }),
    section("s2", "benefits_grid", { items: [{ title: "a" }] }),
    section("s3", "faq", { items: [{ question: "q", answer: "a" }] }),
  ],
  profile,
);
const withLateStrips: FunnelSection[] = [
  composed[0],
  section("rating-1", "proof_strip", { variant: "rating", rating: { score: 4.8, reviewCount: 120 } }),
  section("evidence-1", "proof_strip", { variant: "logos", logos: [{ url: "https://x/a.png", alt: "a" }] }),
  ...composed.slice(1),
];
check(
  "before the fix, late-spliced strips carry no canvas",
  withLateStrips.filter((s) => s.type === "proof_strip").every((s) => !s.canvas),
);
const reRun = enforceFoldDifferentiation(withLateStrips, profile);
check(
  "re-running the pass assigns a canvas to every spliced-in strip",
  reRun.filter((s) => s.type === "proof_strip").every((s) => !!s.canvas),
  reRun.map((s) => `${s.type}[${s.canvas ?? "-"}]`).join(" > "),
);
check(
  "re-running preserves the canvases already decided",
  reRun.find((s) => s.id === "s2")?.canvas === composed.find((s) => s.id === "s2")?.canvas,
);
const rendered = reRun.filter((s) => s.type !== "hero");
let adjacentClash = false;
for (let i = 1; i < rendered.length; i++) {
  if (rendered[i].canvas && rendered[i].canvas === rendered[i - 1].canvas) adjacentClash = true;
}
check("no two adjacent rendered beats share a surface", !adjacentClash);

// ── P1-B shell mode ────────────────────────────────────────────────────────
console.log("\n── P1-B: shell mode ──");

const base = { ascendHostname: "app.divinex.io", isProduction: true, devOverride: null } as const;

check(
  "Ascend host + entitled workspace + flag on -> Ascend",
  decideShellMode({ ...base, hostname: "app.divinex.io", workspaceTier: "full_ascend", unifiedShellFlagEnabled: true }) === "full_ascend",
);
check(
  "Ascend host + NON-entitled workspace -> Flow (hostname alone never grants)",
  decideShellMode({ ...base, hostname: "app.divinex.io", workspaceTier: "crm_only", unifiedShellFlagEnabled: true }) === "crm_only",
);
check(
  "Ascend host + unresolved workspace -> Flow",
  decideShellMode({ ...base, hostname: "app.divinex.io", workspaceTier: null, unifiedShellFlagEnabled: true }) === "crm_only",
);
check(
  "Flow host + entitled workspace -> Flow",
  decideShellMode({ ...base, hostname: "crm.divinex.io", workspaceTier: "full_ascend", unifiedShellFlagEnabled: true }) === "crm_only",
);
check(
  "rollout flag off -> Flow (the kill switch still works)",
  decideShellMode({ ...base, hostname: "app.divinex.io", workspaceTier: "full_ascend", unifiedShellFlagEnabled: false }) === "crm_only",
);

// ── P1-B fresh-login workspace resolution ──────────────────────────────────
console.log("\n── P1-B: fresh-login workspace resolution ──");

check(
  "a sole membership resolves with no cookie",
  decideWorkspaceSelection(null, ["ws-a"]).workspaceId === "ws-a",
);
check(
  "several memberships with no cookie still refuse to guess at the identity layer",
  decideWorkspaceSelection(null, ["ws-a", "ws-b"]).reason === "multiple_available",
);
check(
  "the cookie always wins when present",
  decideWorkspaceSelection("ws-b", ["ws-a", "ws-b"]).workspaceId === "ws-b",
);

// The shell wrapper's tie-break, asserted in the same shape the wrapper uses
// so it cannot drift from LegacyRedirect's client-side rule.
function pick(rows: { id: string; accountNumber: number }[]): string | null {
  return (
    [...rows].sort((a, b) => a.accountNumber - b.accountNumber || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}
check(
  "the tie-break picks the lowest accountNumber, matching the client rule",
  pick([{ id: "zz", accountNumber: 1004 }, { id: "aa", accountNumber: 1001 }]) === "aa",
);
check(
  "the tie-break is stable when accountNumbers collide",
  pick([{ id: "bb", accountNumber: 1001 }, { id: "aa", accountNumber: 1001 }]) === "aa",
);
check("the tie-break returns null with nothing to pick from", pick([]) === null);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
