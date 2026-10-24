/**
 * QA BUG-009 — "Missing Option to Remove or Detach Uploaded File in Lead
 * Magnet Builder." Once attached, leadMagnetAsset lived outside the PATCH
 * route's allowlist entirely (lib/server/funnels-service.ts's own P0.5
 * comment: "a field the TYPE accepts is still silently dropped unless it
 * is written here"), so nothing could ever clear it — confirmed by reading
 * the Files & delivery UI, which rendered the attached filename as a plain
 * span with no control next to it.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-lead-magnet-removal.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const service = read("src/lib/server/funnels-service.ts");
const route = read("src/app/api/sub-accounts/[id]/funnels/[funnelId]/route.ts");
const builder = read("src/components/funnels/funnel-builder.tsx");

// ── The server accepts and applies the removal ────────────────────────────
{
  check("1a. FunnelPatch declares removeLeadMagnetAsset", /removeLeadMagnetAsset\?:\s*boolean/.test(service));
  check(
    "1b. the write boundary clears the field via FieldValue.delete(), not a null write",
    /if \(patch\.removeLeadMagnetAsset\) write\.leadMagnetAsset = FieldValue\.delete\(\)/.test(service),
  );
  check(
    "1c. MUTATION: a version that only checked the TYPE (not the allowlist write) would be caught",
    /if \(patch\.removeLeadMagnetAsset\)/.test(service) && /write\.leadMagnetAsset/.test(service),
  );
  check("1d. the PATCH route forwards removeLeadMagnetAsset from the request body", /body\.removeLeadMagnetAsset === true/.test(route) && /patch\.removeLeadMagnetAsset = true/.test(route));
}

// ── Deliberately scoped: detach the reference, not the underlying asset ──
{
  check(
    "2a. removal does not also delete the underlying funnelAssets doc or file",
    !/removeLeadMagnetAsset[\s\S]{0,400}deleteFunnelAsset/.test(service),
  );
}

// ── The UI actually has a control now, wired to a real round trip ────────
{
  check("3a. a remove handler exists", /async function removeLeadMagnet\(/.test(builder));
  check("3b. it PATCHes with removeLeadMagnetAsset: true", /removeLeadMagnetAsset:\s*true/.test(builder));
  check("3c. a button is rendered next to the attached-filename indicator, not just the plain span from before", /aria-label=\{`Remove \$\{leadMagnetName\}`\}/.test(builder));
  check("3d. the button is disabled while the request is in flight (no double-submit)", /disabled=\{removingLeadMagnet\}/.test(builder));
  check("3e. success clears local state so the UI reflects the detach immediately", /setLeadMagnetName\(null\)/.test(builder));
  check("3f. failures surface to the operator rather than failing silently", /describeError\(e, "Couldn't remove the lead magnet\."\)/.test(builder));
}

console.log(failures === 0 ? `\nverify-lead-magnet-removal: all checks passed` : `\nverify-lead-magnet-removal: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
