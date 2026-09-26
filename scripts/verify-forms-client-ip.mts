// Regression coverage for the hosted-form rate-limit bypass (2026-09-26): the
// per-IP limit and contact geolocation trusted the first X-Forwarded-For entry,
// which any caller can forge. Run:
//   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-forms-client-ip.mts

import { readFileSync } from "node:fs";

const { resolveFormClientIp, resolveFormClientIpWithSource, signClientIp, ATTEST_HEADERS } = await import("../src/lib/forms/client-ip");
const { checkFormSubmitRateLimit } = await import("../src/lib/forms/rate-limit");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const h = (o: Record<string, string>) => new Headers(o);
const SECRET = "test-shared-secret-1234567890";
const NOW = 1_800_000_000_000;
const ts = Math.floor(NOW / 1000);
const att = (ip: string, t = ts, s = SECRET) => ({
  [ATTEST_HEADERS.ip]: ip,
  [ATTEST_HEADERS.ts]: String(t),
  [ATTEST_HEADERS.sig]: signClientIp(s, ip, t),
});
const prod = { nodeEnv: "production", nowMs: NOW };

check("edge IP (CF-Connecting-IP) is used", resolveFormClientIp(h({ "cf-connecting-ip": "203.0.113.5" }), { ...prod, secret: SECRET }) === "203.0.113.5");
check("forged X-Forwarded-For ignored in production", resolveFormClientIp(h({ "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "203.0.113.5" }), { ...prod, secret: SECRET }) === "203.0.113.5");
check("forged X-Forwarded-For alone -> unknown in production", resolveFormClientIp(h({ "x-forwarded-for": "1.2.3.4" }), { ...prod, secret: SECRET }) === "unknown");
check("forged X-Real-IP ignored", resolveFormClientIp(h({ "x-real-ip": "1.2.3.4" }), { ...prod, secret: SECRET }) === "unknown");
check("dev fallback uses X-Forwarded-For", resolveFormClientIp(h({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }), { nodeEnv: "development", secret: "", nowMs: NOW }) === "198.51.100.7");
check("non-IP garbage in CF header rejected", resolveFormClientIp(h({ "cf-connecting-ip": "not-an-ip; DROP" }), { ...prod, secret: SECRET }) === "unknown");

check("valid attestation: visitor IP honoured over the proxy's edge IP", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9") }), { ...prod, secret: SECRET }) === "198.51.100.9");
check("attestation with wrong secret rejected", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9", ts, "some-other-secret-abcdefghij") }), { ...prod, secret: SECRET }) === "18.0.0.1");
check("attestation with tampered IP rejected", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9"), [ATTEST_HEADERS.ip]: "198.51.100.10" }), { ...prod, secret: SECRET }) === "18.0.0.1");
check("expired attestation rejected (replay)", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9", ts - 600) }), { ...prod, secret: SECRET }) === "18.0.0.1");
check("future-dated attestation rejected", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9", ts + 600) }), { ...prod, secret: SECRET }) === "18.0.0.1");
check("unsigned attestation headers rejected", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", [ATTEST_HEADERS.ip]: "198.51.100.9", [ATTEST_HEADERS.ts]: String(ts) }), { ...prod, secret: SECRET }) === "18.0.0.1");
check("attestation ignored entirely when no secret is configured", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9") }), { ...prod, secret: "" }) === "18.0.0.1");
check("attested non-IP value rejected", resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att("evil") }), { ...prod, secret: SECRET }) === "18.0.0.1");

// The bypass this fixes: rotating a forged header used to mint a fresh bucket each request.
{
  let blocked = 0;
  for (let i = 0; i < 100; i++) {
    const ip = resolveFormClientIp(h({ "cf-connecting-ip": "203.0.113.77", "x-forwarded-for": `10.9.${i}.1` }), { ...prod, secret: SECRET });
    if (!checkFormSubmitRateLimit(ip).ok) blocked++;
  }
  check("attack: rotating forged X-Forwarded-For no longer evades the limit", blocked === 70, `${blocked} of 100 blocked (limit 30/h)`);
  let okVisitors = 0;
  for (let i = 0; i < 10; i++) {
    const ip = resolveFormClientIp(h({ "cf-connecting-ip": "18.0.0.1", ...att(`198.51.100.${100 + i}`) }), { ...prod, secret: SECRET });
    if (checkFormSubmitRateLimit(ip).ok) okVisitors++;
  }
  check("legit proxy: 10 different attested visitors behind one proxy IP all pass", okVisitors === 10);
}


// Diagnostic source reporting (contains no IP and no secret).
check("source: attested identity reports 'attested'", resolveFormClientIpWithSource(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9") }), { ...prod, secret: SECRET }).source === "attested");
check("source: plain edge request reports 'edge'", resolveFormClientIpWithSource(h({ "cf-connecting-ip": "18.0.0.1" }), { ...prod, secret: SECRET }).source === "edge");
check("source: tampered signature falls back to 'edge' (fails safe)", resolveFormClientIpWithSource(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9"), [ATTEST_HEADERS.ip]: "198.51.100.10" }), { ...prod, secret: SECRET }).source === "edge");
check("source: no usable IP reports 'unknown'", resolveFormClientIpWithSource(h({}), { ...prod, secret: SECRET }).source === "unknown");
{
  const prev = process.env.FLOW_FORM_PROXY_SECRET; process.env.FLOW_FORM_PROXY_SECRET = SECRET;
  check("env: reads the agreed FLOW_FORM_PROXY_SECRET variable", resolveFormClientIpWithSource(h({ "cf-connecting-ip": "18.0.0.1", ...att("198.51.100.9") }), prod).source === "attested");
  if (prev === undefined) delete process.env.FLOW_FORM_PROXY_SECRET; else process.env.FLOW_FORM_PROXY_SECRET = prev;
}
{
  const routeSrc = readFileSync("src/app/api/forms/[id]/submit/route.ts", "utf8");
  check("route: exposes only the source label, never the secret", /x-form-client-ip-source/.test(routeSrc) && !/FLOW_FORM_PROXY_SECRET/.test(routeSrc));
}

const route = readFileSync("src/app/api/forms/[id]/submit/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
check("route: no longer imports the spoofable helper", !/ipFromRequest/.test(route));
check("route: rate limit and geolocation use the trusted IP", /resolveFormClientIp\(request\.headers\)/.test(route) && /clientIp === "unknown"/.test(route));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
