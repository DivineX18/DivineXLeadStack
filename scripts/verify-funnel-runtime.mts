/**
 * Published-funnel runtime contract, checked against the REAL failing funnels
 * and the real deployment.
 *
 * Every case here came from VA testing on app.divinex.io, not from a
 * hypothesis:
 *   dead CTA          "Schedule Now" / "Get the Starter Kit" rendered and did nothing
 *   no delivery       form submitted, contact created, no email ever sent
 *   upload            "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-runtime.mts
 *      BASE=https://app.divinex.io ... to check a specific deployment
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { findBrokenCtas, findDeliveryGaps } = await import("../src/lib/funnels/cta-integrity.ts");
const { checkUploadable, UPLOAD_MAX_BYTES } = await import("../src/lib/funnels/upload-client.ts");
const { MAX_ASSET_BYTES } = await import("../src/lib/funnels/assets.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── 1. The reported funnels are each caught by the contract ────────────────
console.log("\n── the four reported funnels, against the publish contract ──");

const REPORTED = [
  { id: "EcKaDdB6Px5G0jF1CIBc", label: "F1 unwanted section / thin copy" },
  { id: "4QubyXKllrxTySsG2DP4", label: "F2 no email, no delivery" },
  { id: "CwDjKGbO3LormOssqcmz", label: "F3 'Get the Starter Kit' dead" },
  { id: "J7yDukVJ40vNQ71tF5js", label: "F4 'Schedule Now' dead" },
];

for (const r of REPORTED) {
  const snap = await db.doc(`funnels/${r.id}`).get();
  if (!snap.exists) { check(`${r.label}: funnel exists`, false); continue; }
  const f = snap.data() as Record<string, unknown>;
  const sections = (f.sections ?? []) as never[];
  const sa = f.subAccountId as string;

  const formIds = new Set<string>();
  for (const s of sections as { config: { formId?: string | null } }[]) {
    if (typeof s.config.formId === "string" && s.config.formId) formIds.add(s.config.formId);
  }
  const existing = new Set<string>();
  for (const id of formIds) {
    const fs = await db.doc(`forms/${id}`).get();
    if (fs.exists && fs.data()?.subAccountId === sa) existing.add(id);
  }
  const wfSnap = await db.collection("workflows").where("subAccountId", "==", sa).get();
  const workflows = wfSnap.docs
    .map((d) => {
      const w = d.data() as { name?: string; status?: string; trigger?: { formId?: string } };
      return { id: d.id, name: w.name ?? "Follow-up", status: w.status ?? "draft", formId: w.trigger?.formId };
    })
    .filter((w) => !!w.formId && formIds.has(w.formId));

  const broken = findBrokenCtas(sections, existing);
  const gaps = findDeliveryGaps({
    formIds: [...formIds],
    workflows: workflows.map(({ id, name, status }) => ({ id, name, status })),
    hasLeadMagnetAsset: !!f.leadMagnetAsset,
    genre: f.genre as never,
  });

  console.log(`\n  ${r.label} (${r.id}) status=${f.status}`);
  for (const b of broken) console.log(`     dead CTA: "${b.label}" on ${b.sectionType} — ${b.reason}`);
  for (const g of gaps) console.log(`     delivery gap: ${g}`);
  check(`${r.label}: the contract refuses to re-publish it as-is`, broken.length + gaps.length > 0, `${broken.length} dead CTA(s), ${gaps.length} delivery gap(s)`);
}

// ── 2. A known-good shape still passes ─────────────────────────────────────
console.log("\n── a correctly wired page still publishes ──");
const goodSections = [
  { id: "s1", type: "hero", config: { headline: "H", ctaLabel: "Get the guide", formId: "form-1", cta: { style: "popup_form" } } },
  { id: "s2", type: "cta_banner", config: { headline: "Ready", ctaLabel: "Get the guide", formId: "form-1", cta: { style: "popup_form" } } },
] as never[];
check("a popup_form CTA with a real form passes", findBrokenCtas(goodSections, new Set(["form-1"])).length === 0);
check(
  "an active follow-up satisfies the delivery contract",
  findDeliveryGaps({ formIds: ["form-1"], workflows: [{ id: "w", name: "f", status: "active" }], hasLeadMagnetAsset: true, genre: "lead_magnet" }).length === 0,
);
check(
  "a draft follow-up does NOT satisfy it",
  findDeliveryGaps({ formIds: ["form-1"], workflows: [{ id: "w", name: "f", status: "draft" }], hasLeadMagnetAsset: false, genre: "lead_gen" }).length === 1,
);
check(
  "a hand-built page with no follow-up at all is left alone",
  findDeliveryGaps({ formIds: ["form-1"], workflows: [], hasLeadMagnetAsset: false, genre: "lead_gen" }).length === 0,
);
check(
  "a formId pointing at a deleted form counts as dead",
  findBrokenCtas(goodSections, new Set()).length === 2,
);
check(
  "a section with no button label is not a broken CTA",
  findBrokenCtas([{ id: "s1", type: "hero", config: { headline: "H" } }] as never[], new Set()).length === 0,
);
check(
  "a real external link is a working action",
  findBrokenCtas([{ id: "s1", type: "cta_banner", config: { ctaLabel: "Buy", ctaHref: "https://shop.example.com" } }] as never[], new Set()).length === 0,
);
check(
  'an empty ctaHref is NOT a working action',
  findBrokenCtas([{ id: "s1", type: "cta_banner", config: { ctaLabel: "Buy", ctaHref: "" } }] as never[], new Set()).length === 1,
);
check(
  'a bare "#" href is NOT a working action',
  findBrokenCtas([{ id: "s1", type: "cta_banner", config: { ctaLabel: "Buy", ctaHref: "#" } }] as never[], new Set()).length === 1,
);
check(
  "a configured Stripe checkout is a working action",
  findBrokenCtas([{ id: "s1", type: "checkout", config: { ctaLabel: "Buy", checkoutMode: "stripe_checkout", priceCents: 4900 } }] as never[], new Set()).length === 0,
);
check(
  "a booking CTA with a real slug is a working action",
  findBrokenCtas([{ id: "s1", type: "hero", config: { ctaLabel: "Schedule Now", cta: { style: "popup_calendar", bookingPageSlug: "intro" } } }] as never[], new Set()).length === 0,
);
check(
  "a booking CTA with NO slug is dead (the 'Schedule Now' shape)",
  findBrokenCtas([{ id: "s1", type: "hero", config: { ctaLabel: "Schedule Now", cta: { style: "popup_calendar" } } }] as never[], new Set()).length === 1,
);
check(
  "a phone CTA with no number is dead",
  findBrokenCtas([{ id: "s1", type: "hero", config: { ctaLabel: "Call us", cta: { style: "phone" } } }] as never[], new Set()).length === 1,
);

// ── 3. Upload limits are honest ────────────────────────────────────────────
console.log("\n── upload limits ──");
check("the client and server caps agree", UPLOAD_MAX_BYTES === MAX_ASSET_BYTES, `client=${UPLOAD_MAX_BYTES} server=${MAX_ASSET_BYTES}`);
check(
  "the cap is below the measured ~8.4MB platform cliff",
  MAX_ASSET_BYTES < 8_400_000,
  `${(MAX_ASSET_BYTES / 1024 / 1024).toFixed(1)}MB`,
);
{
  const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
  const msg = checkUploadable(big);
  check("an oversized file is refused in the browser, before the request", msg !== null && /over the/.test(msg), JSON.stringify(msg));
  check("the refusal names the file and the limit", !!msg?.includes("big.pdf"), JSON.stringify(msg));
}
{
  const ok = new File([new Uint8Array(1024)], "fine.pdf", { type: "application/pdf" });
  check("a normal PDF is allowed through", checkUploadable(ok) === null);
}
{
  const bad = new File([new Uint8Array(10)], "notes.txt", { type: "text/plain" });
  check("an unsupported type is refused with a readable reason", (checkUploadable(bad) ?? "").includes("notes.txt"));
}

console.log(`\n${failures === 0 ? "FUNNEL RUNTIME CONTRACT: ALL CHECKS PASSED" : `FUNNEL RUNTIME CONTRACT: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
