/**
 * Ascend must never manufacture factual business identity to satisfy the
 * website builder. Facts come from the workspace; copy comes from the model.
 *
 * The Apex build published an invented street ("1234 Westheimer Rd") and an
 * invented CTA domain ("https://www.apexhomeservices.com/contact"). Neither
 * string exists in this repo, so both arrived through the tool's own
 * `business` / `cta_link` arguments with nothing checking them.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-website-fact-grounding.mts
 */
import fs from "node:fs";
import {
  formatBusinessHours,
  normalizeBusinessProfile,
  publicBusinessAddress,
} from "../src/lib/business-profile/profile";
const src = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) fails++; };

console.log("── the fabrication path is closed at the source ──");
ck("verified-facts helper exists", /function verifiedBusinessFacts/.test(src));
ck("street comes from the verified record", /business_street: verified\.street/.test(src));
ck("city/state/zip/country likewise",
  /business_city: verified\.city/.test(src) && /business_state: verified\.state/.test(src)
  && /business_zip: verified\.zip/.test(src) && /business_country: verified\.country/.test(src));
ck("phone comes from the verified record", /business_phone: verified\.phone/.test(src));
ck("email comes from the verified record", /business_email: contactEmail/.test(src) && /const contactEmail = verified\.email/.test(src));
// Hours now HAVE a verified source (Settings -> Business profile). The rule
// is unchanged: they are read, never invented. formatBusinessHours() returns
// "" for a workspace that stated none — proved in verify-business-profile.
ck("opening hours come from the verified record, never the model",
  /opening_hours: verified\.hours/.test(src)
  && !/opening_hours: (business|args)\./.test(src));
ck("model-supplied cta_link is ignored", !/\(args\.ctaLink as string\) \|\|/.test(src));
ck("CTA falls back to saved booking link or the site's own contact",
  /const ctaLink = bookingLink \|\| \(wantsContactPage \? "#contact" : ""\)/.test(src));
ck("no model business.* fact reaches the payload",
  !/business_(street|city|state|zip|country|phone|email): business\./.test(src));
ck("address gate no longer trusts a model-written street",
  !/\(!business\.street \|\| !business\.city\)/.test(src));
// The motivating values may be NAMED in comments — that is documentation.
// What must not exist is a value-matching blacklist in executable code, so the
// assertion strips comments before looking.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ck("fix is general, not an Apex blacklist (no literals in logic)",
  !/Westheimer/i.test(code) && !/apexhomeservices/i.test(code));

console.log("\n── scenario 1: sparse profile, model invents facts ──");
const drop = (raw?: string | null) => {
  const v = (raw ?? "").trim();
  return !v ? "" : /^\+?1?\d{3}555\d{4}$/.test(v.replace(/[^\d]/g, "")) ? "" : v;
};
const verified = (sub: Record<string, unknown>, ac: { email?: string | null; phone?: string | null }) => {
  const s2 = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const b = s2(sub.bookingLink);
  const r = normalizeBusinessProfile(sub.businessProfile);
  const saved = r.ok ? r.value : null;
  const a = publicBusinessAddress(saved);
  return { phone: drop(ac.phone), email: s2(ac.email).toLowerCase(),
    bookingLink: /^https?:\/\//i.test(b) ? b : "",
    hours: formatBusinessHours(saved?.hours), ...a };
};
const sparse = verified({}, {});
ck("no street invented", sparse.street === "");
ck("no city/state/zip invented", sparse.city === "" && sparse.state === "" && sparse.zip === "");
ck("no phone invented", sparse.phone === "");
ck("no email invented", sparse.email === "");
ck("no booking URL invented", sparse.bookingLink === "");
ck("no opening hours invented", sparse.hours === "");

console.log("\n── scenario 2: complete profile, real values preserved ──");
const full = verified(
  { bookingLink: "https://cal.com/apex/consult",
    businessProfile: { street: "900 Main St", city: "Houston", state: "TX", zip: "77002", country: "US" } },
  { email: "Hello@ApexHVAC.com", phone: "(713) 226-4000" },
);
ck("real street preserved", full.street === "900 Main St");
ck("real city/state/zip preserved", full.city === "Houston" && full.state === "TX" && full.zip === "77002");
ck("real phone preserved", full.phone === "(713) 226-4000");
ck("real email preserved and normalised", full.email === "hello@apexhvac.com");
ck("real booking link preserved", full.bookingLink === "https://cal.com/apex/consult");
ck("a saved-but-fictional phone is still dropped",
  verified({}, { phone: "(713) 555-0147" }).phone === "");
ck("a non-http booking value is not passed through",
  verified({ bookingLink: "tel:+17132264000" }, {}).bookingLink === "");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
