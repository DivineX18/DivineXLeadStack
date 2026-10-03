/**
 * NO HOSTING HOSTNAME IN A CUSTOMER'S INBOX.
 *
 * A real lead-magnet email arrived reading
 * `https://flow-growth-scan-staging.onrender.com/api/funnel-asset/…`.
 * Two independent faults: the host was where the app runs rather than the
 * brand's domain, and the whole URL was frozen into the stored email body at
 * UPLOAD time, so changing configuration later fixed nothing.
 */
import { readFileSync } from "node:fs";

let pass = 0; const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { failures.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const BRAND = (await import("../src/config/landing")).CUSTOM_BRAND.primaryDomain;

console.log("\n1. The base a customer is shown");
const mod = "../src/lib/email/public-link";
const reload = async (appUrl: string | undefined) => {
  if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = appUrl;
  // Fresh module each time: publicLinkBase reads the env when called, but the
  // cache-bust keeps this honest if that ever changes.
  return await import(`${mod}?v=${Math.random()}`) as typeof import("../src/lib/email/public-link");
};

for (const host of [
  "https://flow-growth-scan-staging.onrender.com",
  "https://ascend-crm-x2j3.onrender.com",
  "https://something.vercel.app",
  "https://x.fly.dev",
]) {
  const { publicLinkBase } = await reload(host);
  const got = publicLinkBase();
  check(`${new URL(host).hostname} is never shown to a lead`, got === `https://${BRAND}`, got);
}

const real = await reload("https://crm.divinex.io");
check("a real configured domain is used as-is", real.publicLinkBase() === "https://crm.divinex.io", real.publicLinkBase());
const custom = await reload("https://app.acmeplumbing.com");
check("a buyer's own domain is respected, not overridden by our brand",
  custom.publicLinkBase() === "https://app.acmeplumbing.com", custom.publicLinkBase());

console.log("\n2. A frozen link is repaired on its way out");
const { withPublicAssetHost } = await reload("https://flow-growth-scan-staging.onrender.com");
const baked =
  "Here is your guide.\n\n" +
  "[button: Download your copy](https://flow-growth-scan-staging.onrender.com/api/funnel-asset/YLnMh23ly81AMrdlQThL)\n\n" +
  "{{unsubscribeLink}}";
const fixed = withPublicAssetHost(baked);
check("the hosting host is replaced with the brand domain",
  fixed.includes(`https://${BRAND}/api/funnel-asset/YLnMh23ly81AMrdlQThL`), fixed.slice(0, 120));
check("no onrender.com survives anywhere in the body", !/onrender\.com/i.test(fixed));
check("the asset id is preserved exactly", fixed.includes("YLnMh23ly81AMrdlQThL"));
check("the operator's own words are untouched", fixed.startsWith("Here is your guide."));
check("the unsubscribe token is left alone", fixed.includes("{{unsubscribeLink}}"));

// A bare pasted URL from an older body must be repaired too, not just buttons.
const bareOld = "Download your copy here: https://old-deploy.onrender.com/api/funnel-asset/abc123\n\n{{unsubscribeLink}}";
check("an older bare-URL body is repaired as well",
  withPublicAssetHost(bareOld).includes(`https://${BRAND}/api/funnel-asset/abc123`));

// Links that are not ours must not be rewritten.
const foreign = "Read more at https://wikipedia.org/api/funnel-asset-ish and https://partner.com/docs";
check("a link that is not an asset link is left alone",
  withPublicAssetHost(foreign) === foreign);

console.log("\n3. The download is a button, not a pasted URL");
const { withDeliveryLink } = await import("../src/lib/funnels/cta-integrity");
const { parseButtonLine, renderBodyHtml, renderBodyText } = await import("../src/lib/email/body");
const url = `https://${BRAND}/api/funnel-asset/XYZ789`;
const out = withDeliveryLink("Thanks for signing up.\n\n{{unsubscribeLink}}", url);
const btnLine = out.split("\n").find((l) => parseButtonLine(l));
check("the delivery line parses as a real button", !!btnLine, out.replace(/\n/g, " | ").slice(0, 110));
check("it points at the uploaded asset", !!btnLine && parseButtonLine(btnLine)!.href === url);
check("it sits above the unsubscribe footer",
  out.indexOf("[button") < out.indexOf("{{unsubscribeLink}}"));
const html = renderBodyHtml(out.replace("{{unsubscribeLink}}", "https://x.test/u/1"));
check("it renders as button markup, not as literal text",
  /<a[^>]+href="[^"]*\/api\/funnel-asset\/XYZ789"/.test(html) && !html.includes("[button:"), html.slice(0, 80));
// A plain-text reader must still get the URL, or the button loses them the file.
const plain = renderBodyText(out.replace("{{unsubscribeLink}}", "https://x.test/u/1"));
check("plain-text readers still receive the actual URL",
  plain.includes(url) && !plain.includes("[button:"), plain.replace(/\n/g, " | ").slice(0, 110));

console.log("\n3b. Emails written before the fix are upgraded on the way out");
const { withDeliveryButton } = await import("../src/lib/funnels/cta-integrity");
const legacy = "Thanks!\n\nDownload your copy here: https://flow-growth-scan-staging.onrender.com/api/funnel-asset/OLD42\n\n{{unsubscribeLink}}";
const upgraded = withDeliveryButton(withPublicAssetHost(legacy));
const upLine = upgraded.split("\n").find((l) => parseButtonLine(l));
check("a pasted legacy link becomes a button", !!upLine, upgraded.replace(/\n/g, " | ").slice(0, 120));
check("and carries the brand domain, not the hosting one",
  !!upLine && parseButtonLine(upLine)!.href === `https://${BRAND}/api/funnel-asset/OLD42`, upLine ?? "");
check("the operator's own text survives the upgrade", upgraded.startsWith("Thanks!"));
check("a body that is already a button is left exactly alone",
  withDeliveryButton(out) === out);
// The real risk is a second pass wrapping a button in another button.
check("running the upgrade twice changes nothing the second time",
  withDeliveryButton(upgraded) === upgraded &&
  (upgraded.match(/\[button/g) ?? []).length === 1,
  String((withDeliveryButton(upgraded).match(/\[button/g) ?? []).length));
check("a body with no delivery link is untouched",
  withDeliveryButton("Hello\n\n{{unsubscribeLink}}") === "Hello\n\n{{unsubscribeLink}}");

console.log("\n4. Replacing the file leaves exactly one link");
const twice = withDeliveryLink(out, `https://${BRAND}/api/funnel-asset/NEW111`);
check("the old link is gone", !twice.includes("XYZ789"), twice);
check("exactly one download link remains",
  (twice.match(/\/api\/funnel-asset\//g) ?? []).length === 1, String((twice.match(/\/api\/funnel-asset\//g) ?? []).length));

console.log("\n5. The host is resolved at SEND time, not at upload time");
const engine = readFileSync("src/lib/workflows/engine.ts", "utf8");
check("the send step re-points asset links before rendering",
  /const body = withDeliveryButton\(withPublicAssetHost\(cfg\.body \?\? ""\)\)/.test(engine) &&
  engine.indexOf("withPublicAssetHost(cfg.body") < engine.indexOf("const text = renderBodyText"));
check("the upgrade to a button also happens at send time",
  /withDeliveryButton\(withPublicAssetHost\(cfg\.body \?\? ""\)\)/.test(engine));
check("both the text and the html path use the corrected body",
  /renderBodyText\(\s*resolveMergeTags\(body,/.test(engine) && /resolveMergeTags\(\s*body,\s*mergeSubject\(ctx, UNSUB_TOKEN\)/.test(engine));

console.log("\n6. The publish gate still recognises the delivery link");
const { deliveryGapsFor } = await import("../src/lib/funnels/cta-integrity") as unknown as { deliveryGapsFor?: unknown };
void deliveryGapsFor;
const cta = readFileSync("src/lib/funnels/cta-integrity.ts", "utf8");
check("the gate matches the relative path, which the button contains",
  /b\.includes\(ctx\.leadMagnetAssetUrl as string\)/.test(cta));
check("the delivery pattern accepts the button form",
  /\\\[button\(\?: secondary\)\?: \[\^\\\]\]\*\\\]/.test(cta.replace(/\n/g, "")) || /button\(\?: secondary\)\?/.test(cta));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
console.log(failures.length ? "EMAIL LINK HOST: FAILED" : "EMAIL LINK HOST: ALL PASS");
process.exit(failures.length ? 1 : 0);
