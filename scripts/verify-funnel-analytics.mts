/**
 * The acquisition funnel's events, asserted against the source that emits them.
 *
 * Two things must stay true: every stage A-J is actually wired somewhere, and
 * the payload can never carry customer data. The second is the one worth a
 * test — an event is easy to add a property to, and "email" or the scanned URL
 * would be exactly the property someone reaches for.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-analytics.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const track = read("src/lib/analytics/track.ts");
const scanner = read("src/components/growth-scan/growth-scanner.tsx");
const heroCtas = read("src/components/landing-custom/hero-ctas.tsx");
const home = read("src/app/page.tsx");
const start = read("src/app/start/page.tsx");
const signup = read("src/components/landing-custom/trial-signup-form.tsx");
const activate = read("src/app/activate/[token]/page.tsx");
const all = [scanner, heroCtas, home, start, signup, activate].join("\n");

console.log("\n── every stage is wired ──");
const stages: [string, string][] = [
  ["A homepage viewed", "ascend_home_viewed"],
  ["B scan CTA clicked", "growth_scan_cta_clicked"],
  ["C scan started", "growth_scan_started"],
  ["D scan completed", "growth_scan_completed"],
  ["E results viewed", "growth_scan_results_viewed"],
  ["F trial CTA clicked", "trial_cta_clicked"],
  ["G /start reached", "start_page_viewed"],
  ["H checkout started", "checkout_started"],
  ["I trial activated", "trial_activated"],
];
for (const [label, event] of stages) {
  check(label, all.includes(`"${event}"`), event);
}
// J (paid conversion) is a Stripe-side fact that happens after the trial ends,
// with no browser present. It is deliberately NOT faked client-side.
check("J paid conversion is declared but not faked in the browser", track.includes("paid_conversion") && !all.includes('"paid_conversion"'));

console.log("\n── the payload cannot carry customer data ──");
check("properties are allow-listed by key", /const ALLOWED: \(keyof FunnelEventProps\)\[\]/.test(track));
check("the allow-list is exactly product/source/plan/scan_status", /ALLOWED[^=]*=\s*\["product", "source", "plan", "scan_status"\]/.test(track));
check("non-string values are dropped", track.includes('typeof v === "string"'));
check("values are length-capped", track.includes(".slice(0, 60)"));
for (const banned of ["email", "websiteUrl", "website_url", "score", "overallScore", "primaryConstraint", "businessName"]) {
  check(`no "${banned}" property is ever sent`, !new RegExp(`${banned}\\s*:`).test(track), banned);
}

console.log("\n── it degrades safely when analytics is off ──");
check("server-side calls are a no-op", track.includes('typeof window === "undefined"'));
check("dataLayer is created rather than assumed", track.includes("w.dataLayer = w.dataLayer || []"));
check("every push is wrapped so it can never throw into the caller", /try \{[\s\S]*\} catch \{/.test(track));
check("no direct gtag/fbq dependency (rides the existing GTM layer only)", !/\bgtag\(|\bfbq\(/.test(track));

console.log("\n── the scan's lifecycle is reported honestly ──");
// The event must sit AFTER the guard that bails out on a rejected submit, so a
// refused scan is never counted as a started one.
check(
  "a started scan is only counted once the server accepts it",
  scanner.indexOf("growth_scan_started") > scanner.indexOf("We couldn't start that scan"),
);
check("a failed scan is reported as failed, not silently dropped", scanner.includes('scan_status: "failed"'));
check("scan_status never carries a result", !/scan_status:\s*`/.test(scanner));

console.log(
  failures === 0
    ? "\nFUNNEL ANALYTICS: ALL CHECKS PASSED\n"
    : `\nFUNNEL ANALYTICS: ${failures} FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
