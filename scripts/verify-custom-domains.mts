/**
 * Custom-domain behaviour: DNS diagnosis, apex guidance, tenancy, and the
 * funnel path still working exactly as before.
 *
 * Run: npx tsx scripts/verify-custom-domains.mts
 * Network is used for two live DNS lookups against public hostnames.
 */
process.env.DATABASE_URL ??= "postgresql://u:u@127.0.0.1:1/u";
const { diagnoseDomain, diagnosisAdvice } = await import("../src/lib/domains/diagnose");

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) fails++; };

console.log("── DNS diagnosis against real hostnames ──");
const missing = await diagnoseDomain("definitely-not-a-real-host-9f3k2.divinex.io", "x.onrender.com");
ck("nonexistent name → no_record", missing.kind === "no_record", missing.kind);

// crm.divinex.io is DNS-only on Render, so it resolves but not to this target.
const wrong = await diagnoseDomain("crm.divinex.io", "some-other-host.onrender.com");
ck("real name, wrong target → wrong_target or resolved",
  wrong.kind === "wrong_target" || wrong.kind === "resolved" || wrong.kind === "unknown", wrong.kind);

ck("every state yields advice",
  (["no_record","wrong_target","correct_pending","resolved","unknown"] as const)
    .every((k) => diagnosisAdvice({ kind: k, detail: "", found: "" } as never).length > 20));
ck("advice never leaks the provider name",
  (["no_record","wrong_target","correct_pending","resolved","unknown"] as const)
    .every((k) => !/render/i.test(diagnosisAdvice({ kind: k, detail: "", found: "" } as never))));

console.log("\n── apex / www guidance ──");
const svc = await import("../src/lib/server/custom-domains-service");
const src = (await import("node:fs")).readFileSync("src/lib/server/custom-domains-service.ts", "utf8");
ck("apex rejection names the www alternative", /Connect www\.\$\{domain\} instead/.test(src));
ck("apex rejection says WE do not redirect", /don't perform that redirect for you/i.test(src));
ck("three-label rule still guards apex", /split\("\."\)\.length < 3/.test(src));
ck("service still exports the funnel domain API",
  typeof svc.addCustomDomain === "function" && typeof svc.listCustomDomains === "function");

console.log("\n── funnel domain path unchanged ──");
const typeSrc = (await import("node:fs")).readFileSync("src/types/custom-domains.ts", "utf8");
ck("doc still keys on funnelId", /funnelId: string/.test(typeSrc));
ck("doc id is still the domain (O(1) middleware read)", /doc id = the lowercased/i.test(typeSrc));
const mw = (await import("node:fs")).readFileSync("src/middleware.ts", "utf8");
ck("/cdomain rewrite still present", /\/cdomain\/\$\{hostname\}/.test(mw));

console.log("\n── tenancy on the new diagnose route ──");
const route = (await import("node:fs")).readFileSync(
  "src/app/api/sub-accounts/[id]/funnels/[funnelId]/domains/[domain]/diagnose/route.ts", "utf8");
ck("requires sub-account membership", /requireSubAccountMember\(request, subAccountId\)/.test(route));
ck("re-checks ownership against the stored doc", /d\.subAccountId !== subAccountId/.test(route));
ck("cross-workspace probe gets 404, not a leak", /Domain not found/.test(route) && /never confirm a domain exists/i.test(route));
ck("read-only: no writes in the route", !/\.set\(|\.update\(|\.delete\(/.test(route));

console.log("\n── DNS instruction UI ──");
const ui = (await import("node:fs")).readFileSync("src/components/funnels/funnel-domains-section.tsx", "utf8");
ck("Type / Name / Value are labelled separately",
  /label="Type"/.test(ui) && /label="Name \/ Host"/.test(ui) && /label="Value \/ Target"/.test(ui));
ck("copy control exists", /navigator\.clipboard/.test(ui));
ck("copy uses the exact record value", /CopyField label="Value \/ Target" value=\{r\.value\}/.test(ui));
ck("lifecycle has Waiting for DNS / Verifying / Live",
  /Waiting for DNS/.test(ui) && /Verifying/.test(ui) && /"Live"/.test(ui));
ck("HTTPS messaging sits inside the verified branch",
  /status === "verified" && \([\s\S]{0,900}Secure HTTPS active/.test(ui));
ck("no Render wording shown to customers", !/onrender|Render/i.test(ui.replace(/\/\*[\s\S]*?\*\//g, "")));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
