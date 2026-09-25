/**
 * VERIFIED BUSINESS INFORMATION.
 *
 * An operator can now state their address, hours, public name and website
 * once, and website generation reads those instead of inventing them. This
 * suite holds that boundary from both sides: the stored record is the only
 * source of factual identity, and a workspace that has stated nothing still
 * builds rather than being given plausible filler.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-business-profile.mts
 */
import fs from "node:fs";
import {
  BUSINESS_WEEKDAYS,
  blankBusinessHours,
  formatBusinessHours,
  normalizeBusinessProfile,
  publicBusinessAddress,
} from "../src/lib/business-profile/profile";
import type { BusinessHours } from "../src/types";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fails++;
};
const ok = <T,>(r: { ok: boolean; value?: T }) => (r as { value: T }).value;

const FULL = {
  businessName: "Apex Home Services",
  websiteUrl: "https://apexhome.example",
  street: "1200 Main St",
  street2: "Suite 400",
  city: "Houston",
  state: "TX",
  zip: "77002",
  country: "United States",
  addressPublic: true,
  hours: (() => {
    const h = blankBusinessHours();
    for (const d of ["mon", "tue", "wed", "thu", "fri"] as const)
      h[d] = { closed: false, open: "09:00", close: "17:00" };
    h.sat = { closed: false, open: "10:00", close: "14:00" };
    h.sun = { closed: true, open: "", close: "" };
    return h;
  })(),
};

console.log("── 1. a sparse profile stays sparse ──");
ck("an absent profile normalises to null", ok(normalizeBusinessProfile(null)) === null);
ck("an empty object states nothing, so stores nothing",
  ok(normalizeBusinessProfile({})) === null);
ck("a form submitted entirely blank stores nothing",
  ok(normalizeBusinessProfile({
    businessName: "", websiteUrl: "", street: "", street2: "", city: "",
    state: "", zip: "", country: "", addressPublic: true,
    hours: blankBusinessHours(),
  })) === null);
ck("whitespace is not a statement",
  ok(normalizeBusinessProfile({ street: "   ", city: "\t" })) === null);
{
  const sparse = publicBusinessAddress(null);
  ck("no stored address yields no address, not a guess",
    sparse.street === "" && sparse.city === "" && sparse.state === "" &&
    sparse.zip === "" && sparse.country === "");
  ck("no stored hours yield no hours", formatBusinessHours(null) === "");
  ck("a week of untouched rows yields no hours",
    formatBusinessHours(blankBusinessHours()) === "");
}
ck("one real field is enough to be worth storing",
  ok(normalizeBusinessProfile({ city: "Houston" }))?.city === "Houston");

console.log("\n── 2. a complete profile persists legitimate information ──");
{
  const p = ok(normalizeBusinessProfile(FULL))!;
  ck("business name persists", p.businessName === "Apex Home Services");
  ck("website persists", p.websiteUrl === "https://apexhome.example");
  ck("street + line 2 persist", p.street === "1200 Main St" && p.street2 === "Suite 400");
  ck("city/state/zip/country persist",
    p.city === "Houston" && p.state === "TX" && p.zip === "77002" &&
    p.country === "United States");
  ck("hours persist as structure, not prose",
    p.hours !== null && p.hours.mon.open === "09:00" && p.hours.sun.closed === true);
  ck("every weekday is represented",
    BUSINESS_WEEKDAYS.every((d) => p.hours![d] !== undefined));
  ck("a second pass is stable (idempotent normalisation)",
    JSON.stringify(ok(normalizeBusinessProfile(p))) === JSON.stringify(p));
}

console.log("\n── 3. the website payload receives the saved public facts ──");
{
  const p = ok(normalizeBusinessProfile(FULL))!;
  const addr = publicBusinessAddress(p);
  ck("street line carries line 2", addr.street === "1200 Main St, Suite 400");
  ck("city/state/zip/country reach the payload",
    addr.city === "Houston" && addr.state === "TX" && addr.zip === "77002" &&
    addr.country === "United States");
  const hrs = formatBusinessHours(p.hours);
  ck("consecutive identical days collapse", hrs.startsWith("Mon-Fri 9:00 AM - 5:00 PM"), hrs);
  ck("a differing day is stated separately", hrs.includes("Sat 10:00 AM - 2:00 PM"), hrs);
  ck("a closed day says closed", hrs.includes("Sun Closed"), hrs);
  ck("midnight and noon render correctly",
    formatBusinessHours({ ...blankBusinessHours(),
      mon: { closed: false, open: "00:00", close: "12:00" } } as BusinessHours)
      === "Mon 12:00 AM - 12:00 PM");
  // A partially-filled day states nothing usable, so it states nothing.
  ck("a half-filled day is omitted rather than half-published",
    formatBusinessHours(ok(normalizeBusinessProfile({
      hours: { ...blankBusinessHours(), mon: { closed: false, open: "09:00", close: "" } },
      city: "Houston",
    }))!.hours) === "");
}

console.log("\n── 4. a hidden address never reaches a public website ──");
{
  const p = ok(normalizeBusinessProfile({ ...FULL, addressPublic: false }))!;
  ck("the address is still stored for the operator",
    p.street === "1200 Main St" && p.city === "Houston");
  const addr = publicBusinessAddress(p);
  ck("street is withheld", addr.street === "");
  ck("city/state/zip/country are withheld",
    addr.city === "" && addr.state === "" && addr.zip === "" && addr.country === "");
  ck("hours are unaffected — only the address is private",
    formatBusinessHours(p.hours) !== "");
  ck("a service-area business still has a usable profile",
    p.businessName === "Apex Home Services" && p.websiteUrl !== null);
}

console.log("\n── 5. malformed and fictional values stay rejected ──");
{
  const bad = normalizeBusinessProfile({ websiteUrl: "apexhome.example" });
  ck("a bare domain is refused, not silently prefixed", bad.ok === false);
  ck("javascript: is refused",
    normalizeBusinessProfile({ websiteUrl: "javascript:alert(1)" }).ok === false);
  ck("a non-object body is refused", normalizeBusinessProfile("Houston").ok === false);
  ck("an https URL is accepted",
    ok(normalizeBusinessProfile({ websiteUrl: "https://a.example" }))?.websiteUrl
      === "https://a.example");
  ck("a nonsense time is dropped rather than stored",
    ok(normalizeBusinessProfile({
      city: "Houston",
      hours: { ...blankBusinessHours(), mon: { closed: false, open: "9am", close: "25:00" } },
    }))!.hours === null);
  // The 555 guard lives on the phone field, which is still AccountContact's.
  const srcProfile = fs.readFileSync("src/lib/business-profile/profile.ts", "utf8");
  ck("the fictional-phone rule is shared, not re-derived",
    /isFictionalPhone/.test(srcProfile));
}

console.log("\n── 6. model and tool arguments cannot override stored facts ──");
{
  const src = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
  ck("the resolver reads the saved profile", /normalizeBusinessProfile\(sub\.businessProfile\)/.test(src));
  ck("the address is read only through the privacy-aware helper",
    /publicBusinessAddress\(saved\)/.test(src));
  ck("no raw address field is read off the record in the resolver",
    !/saved[?.]*\.(street|city|state|zip|country)\b/.test(src));
  ck("hours come from the saved structure", /formatBusinessHours\(saved\?\.hours\)/.test(src));
  ck("the payload takes hours from the verified bundle", /opening_hours: verified\.hours/.test(src));
  ck("the saved business name outranks the model's",
    /business_name:\s*\n\s*verified\.businessName \|\|\s*\n\s*business\.name/.test(src));
  ck("no model business.* fact reaches the payload",
    !/business_(street|city|state|zip|country|phone|email): business\./.test(src));
  ck("model-supplied cta_link is still ignored", !/\(args\.ctaLink as string\) \|\|/.test(src));
  // A generator writing a fact is the failure this whole pass exists to stop.
  const routes = fs.readFileSync("src/app/api/agency/sub-accounts/[id]/route.ts", "utf8");
  ck("the save route is the only writer, and it validates",
    /normalizeBusinessProfile\(body\.businessProfile\)/.test(routes));
  ck("the save route is admin-gated", /requireSubAccountAdmin\(request, subAccountId\)/.test(routes));
  const writers = ["src/lib/ai-suite/capabilities.ts", "src/lib/server/websites-service.ts"]
    .filter((f) => fs.existsSync(f))
    .filter((f) => /businessProfile\s*[:=]\s*(?!null)/.test(
      fs.readFileSync(f, "utf8").replace(/normalizeBusinessProfile\([^)]*\)/g, "")));
  ck("no generation path writes a business profile", writers.length === 0, writers.join(", "));
}

console.log("\n── 7. existing workspaces keep working without migration ──");
{
  // The field is optional on the doc, so every workspace created before it
  // existed reads as "nothing stated" rather than failing.
  const types = fs.readFileSync("src/types/tenancy.ts", "utf8");
  ck("the doc field is optional", /businessProfile\?: BusinessProfile \| null;/.test(types));
  ck("a doc with no profile resolves cleanly",
    ok(normalizeBusinessProfile(undefined)) === null);
  const legacyAddr = publicBusinessAddress(undefined);
  ck("a legacy workspace yields empty facts, not a throw",
    legacyAddr.street === "" && legacyAddr.country === "");
  ck("a legacy workspace yields no hours", formatBusinessHours(undefined) === "");
  // A partially-shaped record written by an older client must not crash.
  ck("an unknown extra key is ignored, not rejected",
    ok(normalizeBusinessProfile({ city: "Houston", favouriteColour: "teal" }))?.city === "Houston");
  ck("a missing addressPublic defaults to showing the address",
    ok(normalizeBusinessProfile({ street: "1200 Main St" }))?.addressPublic === true);
  ck("an explicitly private address stays private",
    ok(normalizeBusinessProfile({ street: "1200 Main St", addressPublic: false }))?.addressPublic === false);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
