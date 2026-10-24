/**
 * QA BUG-002 — "Zeno can't scan/read the workspace's own website" — the user
 * could ask Zeno to look at their site and it had nothing to run.
 *
 * Root cause: ascend.discover() (Ascend's existing, certified Growth Scan
 * brand-discovery crawler — runBrandDiscovery() in the Ascend repo, already
 * wired into onboarding's "discover" action) was never exposed as a Zeno
 * chat capability. This verifies the fix reuses that exact call rather than
 * adding a second crawler, and is wired with the same tenancy/confirmation
 * discipline every other write capability here uses.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-scan-website-capability.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const caps = readFileSync(new URL("../src/lib/ai-suite/capabilities.ts", import.meta.url), "utf8");

const start = caps.indexOf('name: "scan_business_website"');
const end = caps.indexOf("\n  {", start);
const block = caps.slice(start, end === -1 ? start + 6000 : end);

check("1. the capability exists", start !== -1);
check("2. it calls the EXISTING ascend.discover() — no new crawler/fetch logic of its own", /ascend\.discover\(/.test(block) && !/fetch\(/.test(block) && !/new URL\(/.test(block));
check("3. it is NOT readonly — a real profile write deserves the standard confirm card", !/readonly:\s*true/.test(block));
check("4. requires admin, matching create_website/create_asset's write gating", /requiredRole:\s*"subAccountAdmin"/.test(block));
check("5. resolves the business profile via the SAME authorized resolver onboarding uses, not a client-supplied id", /resolveAuthorizedBusinessProfileId\(subAccountId\)/.test(block));
check("6. unlinked workspaces fail with a clear, actionable message rather than throwing raw", /isn't linked to a DivineX business profile yet/.test(block));
check("7. a missing website URL (no_website_url) asks the user rather than silently failing", /no_website_url/.test(block) && /What's the URL/.test(block));
check("8. website_url is optional — omitting it lets Ascend fall back to the saved site (matches runBrandDiscovery's own fallback)", /additionalProperties:\s*false/.test(block) && !/required:\s*\["website_url"\]/.test(block));
check("9. distinguished from research_website_reference in its own description (own site vs. competitor/reference)", /not a competitor\/reference site/.test(block));
check("10. registered for agency-delegated use against a named client workspace", /"scan_business_website",\n\s*"create_website"/.test(caps));

console.log(failures === 0 ? `\nverify-scan-website-capability: all checks passed` : `\nverify-scan-website-capability: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
