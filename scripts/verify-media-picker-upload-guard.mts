/**
 * Bitrupt QA — BUG-016, "Generic 'Failed to Upload' Error Message
 * Displayed When Exceeding Maximum File Size Limit" (Medium).
 *
 * Repro steps named "any content section containing a media or image
 * upload field" -- that's MediaField -> MediaPicker
 * (src/components/media/media-picker.tsx), the ONE upload surface every
 * section-level image field shares (hero, product image, story portrait,
 * team photo, image+text, gallery). Unlike every other upload call site in
 * this app (lib/funnels/upload-client.ts's checkUploadable(),
 * funnel-builder.tsx's handleAssetUpload, lib/products/upload-file.ts),
 * MediaPicker.upload() had NO client-side pre-flight check at all -- it
 * posted straight to the server. A file large enough gets rejected by the
 * platform in front of this app with an HTML error page well below this
 * route's own 10MB(sic)/4MB limit, so `await res.json()` throws a JSON
 * parse error with no size/type explanation -- the generic symptom
 * Bitrupt reported.
 *
 * Also found and fixed while auditing this: the server route's own
 * over-limit message hardcoded the stale string "10MB" while the real
 * constant (MAX_ASSET_BYTES) is 4MB -- a correctness bug adjacent to, but
 * distinct from, the one Bitrupt reported.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-media-picker-upload-guard.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const picker = read("src/components/media/media-picker.tsx");
const route = read("src/app/api/sub-accounts/[id]/media/route.ts");

check("1. MediaPicker imports the shared pre-flight checker, not a bespoke one", /import \{ checkUploadable \} from "@\/lib\/funnels\/upload-client"/.test(picker));
check(
  "2. upload() calls it BEFORE the network request, not after",
  /const rejected = checkUploadable\(file\);\s*if \(rejected\) \{\s*toast\.error\(rejected\);\s*return;\s*\}\s*setBusy\(true\);/.test(picker),
);
check("3. the route's over-limit message is computed from the real constant, not a stale hardcoded number", /\$\{Math\.round\(MAX_ASSET_BYTES \/ 1024 \/ 1024\)\}MB/.test(route) && !/"That file is larger than 10MB\."/.test(route));

// Direct execution: a 50MB file (Bitrupt's exact repro size) must be
// rejected locally, with a specific message naming the actual limit, not
// a generic fallback -- and it must never reach fetch() to do it.
const mod = await import("../src/lib/funnels/upload-client.ts");
const bigFile = { name: "giant.png", type: "image/png", size: 50 * 1024 * 1024 } as unknown as File;
const msg = mod.checkUploadable(bigFile);
check("4. a 50MB file is rejected locally with a specific, non-generic message", typeof msg === "string" && /MB/.test(msg) && !/^Couldn't upload|^Upload failed|^Failed to upload/i.test(msg));

console.log(
  failures === 0
    ? `\nverify-media-picker-upload-guard: all checks passed`
    : `\nverify-media-picker-upload-guard: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
