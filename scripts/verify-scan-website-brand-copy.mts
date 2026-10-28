/**
 * Bitrupt QA — BUG-014 (partial: the "no way to review/confirm captured
 * business facts outside onboarding" complaint).
 *
 * Investigation found this was ALREADY solved in product: the Home page
 * (src/app/app/home/page.tsx) has a persistent "Brand & assets" card with a
 * "Review brand" link to /brand -> /app/brand -> redirects to
 * /app/intelligence/brand, a real page reading the SAME canonical business
 * profile (divinexProfiles/{subAccountId}) that scan_business_website
 * writes to via ascend.discover(). It shows business name, colors, fonts,
 * and assets with approval status, persistently -- not just during
 * onboarding.
 *
 * The actual gap was narrower: scan_business_website's own chat response
 * told the user to "review and confirm them in onboarding" without
 * mentioning this page exists, so a user who scanned via chat had no way
 * to discover it. Fix is copy-only -- point at the real, always-reachable
 * page by its actual on-screen name ("Brand & assets" / "Review brand").
 *
 * Run: npx tsx scripts/verify-scan-website-brand-copy.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const capabilities = read("src/lib/ai-suite/capabilities.ts");

check(
  "1. the old, misleading 'review and confirm them in onboarding to lock them in' copy is gone",
  !capabilities.includes("review and confirm them in onboarding to lock them in"),
);
check(
  "2. the new copy names the real, persistent page by its actual on-screen label",
  /"Brand & assets" on Home/.test(capabilities) && /Review brand/.test(capabilities),
);
check(
  "3. it still mentions onboarding as where corrections happen (that part was accurate)",
  /confirm or correct them from there via onboarding/.test(capabilities),
);

// Confirm the page + link this copy now points at are both real, not invented.
const home = read("src/app/app/home/page.tsx");
check("4. Home really has a 'Brand & assets' card with a 'Review brand' link", /Brand & assets/.test(home) && /Review brand/.test(home) && /href="\/brand"/.test(home));

const legacyBrand = read("src/app/app/brand/page.tsx");
check("5. /app/brand really redirects to the Intelligence brand page (not a dead link)", /redirect\("\/app\/intelligence\/brand"\)/.test(legacyBrand));

const intelligenceBrand = read("src/app/app/intelligence/brand/page.tsx");
check(
  "6. that page really renders the same facts scan_business_website captures (name/colors/fonts/assets)",
  /business\.name/.test(intelligenceBrand) && /palette/.test(intelligenceBrand) && /fonts/.test(intelligenceBrand) && /assets/.test(intelligenceBrand),
);

console.log(
  failures === 0
    ? `\nverify-scan-website-brand-copy: all checks passed`
    : `\nverify-scan-website-brand-copy: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
