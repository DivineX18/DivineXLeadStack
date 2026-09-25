/**
 * A fictional phone number must never reach a published business website.
 *
 * The Apex human test published "(713) 555-0147" to a live site. The funnel
 * path had guarded its CTA number since the 10-funnel certification; the
 * website path never did.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-website-phone-guard.mts
 */
import fs from "node:fs";
const src = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) fails++; };

ck("shared guard exists", /function dropFictionalPhone/.test(src));
ck("website build uses it", /business_phone: dropFictionalPhone\(business\.phone\)/.test(src));
ck("funnel CTA guard still present", /ctaPhoneNumber = \/\^\\\+\?1\?\\d\{3\}555\\d\{4\}\$\/.test\(/.test(src));

// Behaviour of the regex the guard uses, applied to the real failing value.
const drop = (raw: string) => {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return /^\+?1?\d{3}555\d{4}$/.test(v.replace(/[^\d]/g, "")) ? "" : v;
};
ck("the exact published number is dropped", drop("(713) 555-0147") === "", `got "${drop("(713) 555-0147")}"`);
ck("+1 E.164 fictional dropped", drop("+17135550147") === "");
ck("dotted fictional dropped", drop("713.555.0147") === "");
ck("a real number survives", drop("(713) 226-4000") === "(713) 226-4000");
ck("a real number with +1 survives", drop("+17132264000") === "+17132264000");
ck("empty stays empty", drop("") === "" && drop(undefined as never) === "");
ck("non-NANP international survives", drop("+44 20 7946 0958") === "+44 20 7946 0958");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
