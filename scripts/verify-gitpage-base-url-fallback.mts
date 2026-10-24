/**
 * Reproduced live during QA browser certification (2026-10-24): a
 * deployment with `GITPAGE_API_URL=` present but BLANK (a realistic
 * setup — e.g. copied verbatim from .env.example's empty placeholder, not
 * just a local artifact) made every website build fail with "Failed to
 * parse URL from /api/v1/generate-site". `?? DEFAULT_BASE_URL` only falls
 * back on null/undefined; an empty string is neither, so the fallback
 * never fired and submitBuild() POSTed a bare relative path.
 *
 * Structural (env-var behavior, not file text) — imports the real function
 * and exercises it directly.
 * Run: npx tsx scripts/verify-gitpage-base-url-fallback.mts
 */
let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

const originalUrl = process.env.GITPAGE_API_URL;
try {
  const { getBaseUrl } = await import("../src/lib/gitpage/client.ts");

  process.env.GITPAGE_API_URL = "";
  check("1. an empty-string env var falls back to the real default, not an empty base URL", getBaseUrl() === "https://www.gitpage.site");

  delete process.env.GITPAGE_API_URL;
  check("2. an absent env var still falls back the same way", getBaseUrl() === "https://www.gitpage.site");

  process.env.GITPAGE_API_URL = "   ";
  check("3. a whitespace-only value is also treated as unset", getBaseUrl() === "https://www.gitpage.site");

  process.env.GITPAGE_API_URL = "https://mock.gitpage.local/";
  check("4. a real override is still honored, trailing slash stripped", getBaseUrl() === "https://mock.gitpage.local");
} finally {
  if (originalUrl === undefined) delete process.env.GITPAGE_API_URL;
  else process.env.GITPAGE_API_URL = originalUrl;
}

console.log(failures === 0 ? `\nverify-gitpage-base-url-fallback: all checks passed` : `\nverify-gitpage-base-url-fallback: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
