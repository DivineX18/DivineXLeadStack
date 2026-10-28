/**
 * Bitrupt QA BUG-022 — an operator pasted their own business's plain
 * homepage (https://hunterpest.com) into the VSL "Paste a YouTube or Vimeo
 * link" field. normalizeVideoUrl's documented fallback ("anything else is
 * returned unchanged... fails visibly rather than being silently mangled")
 * only ever showed a soft note — "Using this link as-is. It must be
 * embeddable." — which the operator published past. A real visitor's
 * browser then tried to iframe the live business site and failed
 * (confirmed live: a document-type network request to hunterpest.com
 * appeared mid-navigation during this session's own BUG-028 reproduction
 * attempts, 200 but clearly not a video embed).
 *
 * Fix: a bare domain root (no path, no query) is never a real embed URL
 * from any video provider — it's exactly what pasting a homepage produces
 * — so VideoField now refuses to save it, instead of accepting it with a
 * note nobody reads before publishing. Real third-party embed providers
 * this normalizer doesn't special-case (Wistia, Loom, etc.) always carry a
 * path/id and must NOT be caught by this guard.
 *
 * Direct-execution + structural, same class as every other verify-*.mts
 * here — normalizeVideoUrl has no I/O, so this runs it for real.
 *
 * Run: npx tsx scripts/verify-video-url-plain-website-guard.mts
 */
import { readFileSync } from "node:fs";
import { normalizeVideoUrl } from "../src/lib/funnels/video-url";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

// ── 1. The exact real-world reproduction ───────────────────────────────────
check("1a. a bare business-homepage domain is flagged", normalizeVideoUrl("https://hunterpest.com")?.looksLikePlainWebsite === true);
check("1b. same with a trailing slash", normalizeVideoUrl("https://hunterpest.com/")?.looksLikePlainWebsite === true);
check("1c. same without an explicit scheme (as a visitor would type it)", normalizeVideoUrl("hunterpest.com")?.looksLikePlainWebsite === true);

// ── 2. Real video URLs this normalizer doesn't special-case must NEVER be
// caught — the whole point is to let "anything embeddable" through ─────────
check("2a. a Wistia-style embed URL (has a path) is NOT flagged", normalizeVideoUrl("https://fast.wistia.net/embed/iframe/abc123xyz")?.looksLikePlainWebsite === false);
check("2b. a Loom share link (has a path) is NOT flagged", normalizeVideoUrl("https://www.loom.com/share/abc123xyz")?.looksLikePlainWebsite === false);
check("2c. a bare domain with just a query string is NOT flagged (ambiguous, so not blocked)", normalizeVideoUrl("https://example.com?v=abc")?.looksLikePlainWebsite === false);

// ── 3. Recognized providers are unaffected — the flag only ever applies to
// the unrecognized "other" fallback branch ─────────────────────────────────
check("3a. a real YouTube URL is never flagged", normalizeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.looksLikePlainWebsite === false);
check("3b. a real Vimeo URL is never flagged", normalizeVideoUrl("https://vimeo.com/123456789")?.looksLikePlainWebsite === false);

// ── 4. The field actually refuses to save a flagged URL and shows an error,
// not a neutral confirmation (structural — the fix is in the component, not
// just the pure normalizer) ─────────────────────────────────────────────────
{
  const src = readFileSync(new URL("../src/components/funnels/media-field.tsx", import.meta.url), "utf8");
  check("4a. commit() checks looksLikePlainWebsite before accepting", /result\.looksLikePlainWebsite/.test(src));
  check("4b. the flagged case clears the field rather than saving a URL that will fail for every visitor", /looksLikePlainWebsite\) \{\s*onChange\(""\)/.test(src));
  check("4c. the warning is styled as an error, not the same neutral note style as a normal confirmation", /noteIsError.*text-destructive/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-video-url-plain-website-guard: all checks passed`
    : `\nverify-video-url-plain-website-guard: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
