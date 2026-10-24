/**
 * QA BUG-010 — "No way to export a generated Asset Studio deliverable (Lead
 * Magnet Full Draft, etc.) as a usable file; the only action was Copy to
 * clipboard, which can't become a funnel's lead-magnet delivery asset."
 *
 * Audited first (per the task's own "reuse before building" instruction):
 * Quotes already ships a @react-pdf/renderer pipeline
 * (lib/quotes/pdf-render.tsx + pdf-document.tsx). This reuses that same
 * library and renderToStream -> Readable.toWeb bridge rather than adding a
 * second PDF engine or a document-AI service — confirmed below.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-asset-pdf-export.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const quotesRender = read("src/lib/quotes/pdf-render.tsx");
const assetRender = read("src/lib/divinex/asset-pdf-render.tsx");
const assetDoc = read("src/lib/divinex/asset-pdf-document.tsx");
const route = read("src/app/api/sub-accounts/[id]/divinex/assets/[assetId]/pdf/route.ts");
const section = read("src/components/shell/ascend-assets-section.tsx");

check("1a. reuses @react-pdf/renderer, the SAME library Quotes already ships — no second PDF engine", /from "@react-pdf\/renderer"/.test(assetRender) && /from "@react-pdf\/renderer"/.test(assetDoc));
check("1b. follows the same renderToStream -> Readable.toWeb bridge Quotes established", /renderToStream/.test(assetRender) && /Readable\.toWeb/.test(assetRender) && /renderToStream/.test(quotesRender) && /Readable\.toWeb/.test(quotesRender));
check("1c. route forces the nodejs runtime (react-pdf needs Node, not edge)", /export const runtime = "nodejs"/.test(route));

check("2a. the route is member-gated, not public", /requireSubAccountMember/.test(route));
check("2b. it fails closed (503) when the DivineX engine isn't configured, rather than throwing", /ascendConfigured\(\)/.test(route) && /status: 503/.test(route));
check("2c. a foreign/missing asset id 404s rather than leaking another asset", /Asset not found/.test(route));
check("2d. no cross-repo API addition — reuses the existing listAssets() call, not a new Ascend endpoint", /ascend\.listAssets\(/.test(route) && !/getAsset\(/.test(route));

check("3a. the UI exposes a real Download PDF action next to Copy", /Download PDF/.test(section));
check("3b. it hits the new per-asset pdf route with the open asset's id", /divinex\/assets\/\$\{open\.id\}\/pdf/.test(section));

check("4a. content-type + attachment disposition are set so the browser downloads a real file", /application\/pdf/.test(route) && /attachment; filename=/.test(route));

console.log(failures === 0 ? `\nverify-asset-pdf-export: all checks passed` : `\nverify-asset-pdf-export: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
