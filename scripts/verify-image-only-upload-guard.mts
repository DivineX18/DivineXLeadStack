/**
 * Bitrupt QA BUG-017 — the Visual Requirements Panel's image slot (its
 * input declares accept="image/jpeg,image/png,image/webp") accepted a
 * dragged-in PDF anyway and attached it as if it were a photo, producing a
 * broken canvas render. Root cause: the accept attribute is only a file-
 * picker hint (drag-and-drop and an explicit "All Files" choice both bypass
 * it in every browser), and the real gate — checkUploadable() — used the
 * SAME broad allow-list the main "Upload image, PDF or audio" lead-magnet
 * button legitimately needs, with no way for a narrower call site to
 * restrict it.
 *
 * Direct-execution against the real validator — a fake File() is enough,
 * no I/O, same class as every other verify-*.mts here.
 *
 * Run: npx tsx scripts/verify-image-only-upload-guard.mts
 */
import { readFileSync } from "node:fs";
import { checkUploadable } from "../src/lib/funnels/upload-client";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

function fakeFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

// ── 1. The exact real-world reproduction: a PDF restricted to image-only ──
{
  const IMAGE_ONLY = ["image/jpeg", "image/png", "image/webp"] as const;
  const pdf = fakeFile("brochure.pdf", "application/pdf");
  const rejected = checkUploadable(pdf, IMAGE_ONLY);
  check("1a. a PDF is rejected when the call site restricts to images only", !!rejected);
  check("1b. the rejection message doesn't claim PDFs are allowed here (only names what the file itself is)", !!rejected && !/and PDFs/i.test(rejected));
}

// ── 2. The SAME validator, unrestricted (the lead-magnet button's own
// default), must still legitimately accept a PDF — no regression ─────────
{
  const pdf = fakeFile("guide.pdf", "application/pdf");
  check("2a. a PDF is still accepted with no allowedTypes override (lead-magnet button, unchanged)", checkUploadable(pdf) === null);
}

// ── 3. Real images pass the restricted check too ───────────────────────────
{
  const IMAGE_ONLY = ["image/jpeg", "image/png", "image/webp"] as const;
  check("3a. a real JPEG passes the image-only check", checkUploadable(fakeFile("photo.jpg", "image/jpeg"), IMAGE_ONLY) === null);
  check("3b. a real PNG passes the image-only check", checkUploadable(fakeFile("photo.png", "image/png"), IMAGE_ONLY) === null);
}

// ── 4. The actual call site wires the restriction through — structural,
// since the browser-level accept= attribute alone was already proven
// insufficient (that's the whole bug) ──────────────────────────────────────
{
  const src = readFileSync(new URL("../src/components/funnels/visual-requirements-panel.tsx", import.meta.url), "utf8");
  check("4a. the panel imports/defines an image-only type list", /IMAGE_ONLY_TYPES/.test(src));
  check("4b. onFileChosen's upload call actually passes it through", /uploadFunnelAsset\(subAccountId, funnelId, file, IMAGE_ONLY_TYPES\)/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-image-only-upload-guard: all checks passed`
    : `\nverify-image-only-upload-guard: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
