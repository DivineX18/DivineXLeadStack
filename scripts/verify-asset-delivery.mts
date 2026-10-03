/**
 * THE RECIPIENT'S JOURNEY, FOR EVERY KIND OF DELIVERABLE.
 *
 * A customer promises a resource on a page. Someone gives their email. This
 * walks what that person actually receives and actually opens, for a
 * document, a video and an audio file: the email body the workflow would
 * send, the HTML and plain-text renderings of it, and the branded route the
 * button leads to, opened in a browser with no session.
 *
 * It asserts the thing the whole pass exists for: no hosting hostname, no
 * storage provider, no infrastructure anywhere a recipient can see.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
// Pretend we are the Render deployment whose hostname reached a real inbox.
const DEPLOY_HOST = "https://flow-growth-scan-staging.onrender.com";
process.env.NEXT_PUBLIC_APP_URL = DEPLOY_HOST;

const BASE = process.env.DELIVERY_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = "U5SBAHsB0nZ7ce552H9h";

const { getAdminDb } = await import("../src/lib/firebase/admin");
const { storeFunnelAsset, storeExternalAsset } = await import("../src/lib/funnels/assets");
const { withPublicAssetHost, publicLinkBase } = await import("../src/lib/email/public-link");
const { withDeliveryLink, withDeliveryButton } = await import("../src/lib/funnels/cta-integrity");
const { renderBodyHtml, renderBodyText, parseButtonLine } = await import("../src/lib/email/body");
const { defaultCtaLabel, deliveryPathFor } = await import("../src/lib/funnels/delivery");
const { chromium } = await import("/Users/boss/DivineXLeadStack/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs");

const db = getAdminDb();
let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};
const BRAND = publicLinkBase();
const INFRA = /onrender\.com|vercel\.app|netlify\.app|fly\.dev|firebasestorage|googleapis\.com|storage\.cloud|\.appspot\.com/i;

const RUN = Date.now().toString(36).slice(-6);
const SA = `tmp-deliv-${RUN}`;
const OTHER_SA = `tmp-deliv-${RUN}-b`;
for (const sa of [SA, OTHER_SA]) {
  await db.doc(`subAccounts/${sa}`).set({ name: `Delivery ${sa}`, agencyId: AG, funnelsEnabledByAgency: true, createdAt: new Date(), updatedAt: new Date() });
}
console.log(`workspace ${SA}\nbranded base ${BRAND}\ndeployment host ${DEPLOY_HOST}\n`);

// A real one-page PDF, so the bytes and the content type are genuine.
const PDF = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8" +
  "PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdl" +
  "L1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAx" +
  "IDAgUj4+", "base64");

const pdfAsset = await storeFunnelAsset({
  subAccountId: SA, agencyId: AG, funnelId: `f-${RUN}`, createdByUid: OWNER,
  contentType: "application/pdf", filename: "Healthy Eating Guide.pdf", bytes: PDF,
});
const videoAsset = await storeExternalAsset({
  subAccountId: SA, agencyId: AG, funnelId: `f-${RUN}`, createdByUid: OWNER,
  kind: "video", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", title: "Welcome Training",
});
const audioAsset = await storeExternalAsset({
  subAccountId: SA, agencyId: AG, funnelId: `f-${RUN}`, createdByUid: OWNER,
  kind: "audio", url: "https://cdn.example.com/welcome.mp3", title: "Day One Audio",
});

const br = await chromium.launch();

type Case = { kind: "pdf" | "video" | "audio"; assetId: string; cta: string; label: string };
const cases: Case[] = [
  { kind: "pdf",   assetId: pdfAsset.assetId,   cta: "Download your copy", label: "Healthy Eating Guide.pdf" },
  { kind: "video", assetId: videoAsset.assetId, cta: "Watch video",        label: "Welcome Training" },
  { kind: "audio", assetId: audioAsset.assetId, cta: "Listen now",         label: "Day One Audio" },
];

for (const c of cases) {
  console.log(`\n=== ${c.kind.toUpperCase()}: ${c.label} ===`);

  // 1. The email the workflow would hold, written the way the wiring writes it.
  const path = deliveryPathFor(c.assetId, c.kind);
  const written = withDeliveryLink(
    "Thanks for signing up.\n\n{{unsubscribeLink}}",
    `${DEPLOY_HOST}${path}`,            // as a deployment would bake it
    defaultCtaLabel(c.kind),
  );
  check(`${c.kind}: the CTA defaults to "${c.cta}"`, written.includes(`[button: ${c.cta}]`), written.replace(/\n/g, " | ").slice(0, 110));

  // 2. What a send composes, which is where the host is corrected.
  const sent = withDeliveryButton(withPublicAssetHost(written));
  const line = sent.split("\n").find((l) => parseButtonLine(l));
  const btn = line ? parseButtonLine(line) : null;
  check(`${c.kind}: it is a real button, not pasted markdown`, !!btn, line ?? "(none)");
  check(`${c.kind}: it points at the branded domain`, !!btn && btn.href.startsWith(BRAND), btn?.href ?? "");
  // The link in the mail must go where the deliverable is meant to be
  // experienced. Relying on the download route's redirect would still work
  // for the recipient but puts a hop, and the wrong URL, in the message.
  const expected = c.kind === "pdf" ? `/api/funnel-asset/${c.assetId}` : `/d/${c.assetId}`;
  check(`${c.kind}: the link in the mail is the ${c.kind === "pdf" ? "download" : "player"} route itself`,
    !!btn && btn.href === `${BRAND}${expected}`, btn?.href ?? "");
  check(`${c.kind}: no infrastructure hostname anywhere in the body`, !INFRA.test(sent), sent.slice(0, 90));

  // 3. HTML and plain text, both of which a recipient may see.
  const html = renderBodyHtml(sent.replace("{{unsubscribeLink}}", "https://x.test/u/1"));
  const text = renderBodyText(sent.replace("{{unsubscribeLink}}", "https://x.test/u/1"));
  check(`${c.kind}: HTML renders a styled anchor`, /<a[^>]+href="[^"]*(api\/funnel-asset|\/d)\//.test(html) && !html.includes("[button:"));
  check(`${c.kind}: plain text carries the label and a usable URL`,
    text.includes(c.cta) && text.includes(`${BRAND}${path}`) && !text.includes("[button:"),
    (text.split("\n").find((l) => l.includes("/")) ?? "").slice(0, 100));
  check(`${c.kind}: no infrastructure hostname in HTML or plain text`, !INFRA.test(html) && !INFRA.test(text));

  // 4. The recipient follows it, logged out.
  const url = `${BASE}${path}`;
  if (c.kind === "pdf") {
    const res = await fetch(url);
    check(`${c.kind}: the branded route returns the file`, res.status === 200, `HTTP ${res.status}`);
    check(`${c.kind}: with the right content type`, res.headers.get("content-type") === "application/pdf", String(res.headers.get("content-type")));
    const disp = res.headers.get("content-disposition") ?? "";
    check(`${c.kind}: and keeps a useful filename`, disp.includes("Healthy Eating Guide.pdf"), disp);
    const body = Buffer.from(await res.arrayBuffer());
    check(`${c.kind}: the bytes are the document that was uploaded`, body.equals(PDF), `${body.length}B vs ${PDF.length}B`);
  } else {
    const pg = await br.newPage();
    await pg.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    const heading = ((await pg.locator("h1").first().textContent().catch(() => "")) ?? "").trim();
    check(`${c.kind}: the branded player opens with no session`, heading.length > 0, heading);
    check(`${c.kind}: it names the resource`, heading.includes(c.label), heading);
    const player = c.kind === "video"
      ? await pg.locator("iframe, video").count()
      : await pg.locator("audio").count();
    check(`${c.kind}: it renders something playable`, player > 0, `${player} element(s)`);
    const visible = await pg.locator("body").innerText().catch(() => "");
    check(`${c.kind}: the provider is never shown in the visible page`, !INFRA.test(visible) && !visible.includes("youtube.com") && !visible.includes("cdn.example.com"), visible.replace(/\s+/g, " ").slice(0, 90));
    await pg.close();
  }
}

console.log("\n=== the awkward cases ===");
// A deleted or wrong id must not look like a server fault.
const gone = await fetch(`${BASE}/api/funnel-asset/aaaaaaaaaaaaaaaaaaaa`);
check("a missing download 404s rather than erroring", gone.status === 404, `HTTP ${gone.status}`);
const pgGone = await br.newPage();
await pgGone.goto(`${BASE}/d/aaaaaaaaaaaaaaaaaaaa`, { waitUntil: "networkidle", timeout: 60000 });
const goneText = await pgGone.locator("body").innerText().catch(() => "");
check("a missing player link explains itself to the recipient", /isn't available|isn’t available/i.test(goneText), goneText.replace(/\s+/g, " ").slice(0, 80));
check("and leaks nothing while doing it", !INFRA.test(goneText));
await pgGone.close();

// A media asset reached through the download route must not hand back the provider.
const viaDownload = await fetch(`${BASE}/api/funnel-asset/${videoAsset.assetId}`, { redirect: "manual" });
check("a video requested from the download route is sent to the player",
  viaDownload.status === 302 && (viaDownload.headers.get("location") ?? "").includes(`/d/${videoAsset.assetId}`),
  `HTTP ${viaDownload.status} -> ${viaDownload.headers.get("location")}`);
const raw = await viaDownload.text();
check("and the provider URL is not in that response", !raw.includes("youtube.com"), raw.slice(0, 80));

// The player must only ever PLAY. Refusing a document works today partly
// because a document has no external URL, so this asserts the kind check
// itself: an asset that carries a URL but is not media is still refused.
// Without that, anything later given a URL would become readable here.
const tamperedId = `${pdfAsset.assetId}`.slice(0, 20);
const tampered = db.collection("funnelAssets").doc();
await tampered.set({
  id: tampered.id, subAccountId: SA, agencyId: AG, funnelId: `f-${RUN}`,
  kind: "pdf", contentType: "application/pdf", filename: "Private.pdf",
  externalUrl: "https://cdn.example.com/private.pdf", sizeBytes: 0, chunkCount: 0,
  createdByUid: OWNER, createdAt: new Date(),
});
void tamperedId;
const pgTamper = await br.newPage();
await pgTamper.goto(`${BASE}/d/${tampered.id}`, { waitUntil: "networkidle", timeout: 60000 });
const tamperText = await pgTamper.locator("body").innerText().catch(() => "");
check("a non-media asset carrying a URL is still refused by the player",
  /isn't available|isn’t available/i.test(tamperText), tamperText.replace(/\s+/g, " ").slice(0, 80));
check("and its URL never reaches the page", !tamperText.includes("cdn.example.com"));
await pgTamper.close();
await db.recursiveDelete(tampered);

// The player must only ever play. It must not become a way to read documents.
const pgPdf = await br.newPage();
await pgPdf.goto(`${BASE}/d/${pdfAsset.assetId}`, { waitUntil: "networkidle", timeout: 60000 });
const pdfViaPlayer = await pgPdf.locator("body").innerText().catch(() => "");
check("a document cannot be opened through the player route",
  /isn't available|isn’t available/i.test(pdfViaPlayer), pdfViaPlayer.replace(/\s+/g, " ").slice(0, 80));
await pgPdf.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
await br.close();
for (const sa of [SA, OTHER_SA]) await db.recursiveDelete(db.doc(`subAccounts/${sa}`));
for (const a of [pdfAsset.assetId, videoAsset.assetId, audioAsset.assetId]) {
  await db.recursiveDelete(db.doc(`funnelAssets/${a}`));
}
console.log(failures.length ? "ASSET DELIVERY: FAILED" : "ASSET DELIVERY: ALL PASS");
process.exit(failures.length ? 1 : 0);
