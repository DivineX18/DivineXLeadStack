/**
 * Bitrupt QA BUG-029 — a live customer received a transactional delivery
 * email containing raw, unparsed markdown as visible body text:
 * "[button: Download your guide](REPLACE-WITH-PDF-LINK)".
 *
 * Root cause, confirmed against the real production workflow doc
 * (qVKDy5wZdx8ND6udLpdu, "5 Signs Ebook -> Consult (River Oaks MedSpa)"):
 * the operator hand-typed that line as a self-reminder placeholder while
 * drafting the email, then uploaded the real PDF expecting
 * wireDeliveryIntoWorkflows() to fill the link in. It didn't: DELIVERY_URL
 * only recognized a href this exact wiring had ALREADY inserted (by design
 * — it must never touch a URL the operator wrote on purpose), so the real
 * upload appended a second, correct button instead of replacing the
 * placeholder, and the broken one shipped untouched. lib/email/body.ts's
 * own parseButtonLine already refuses to linkify a non-http(s)/mailto href
 * (falls back to literal text) — which is correct and NOT the bug here; the
 * bug is that the stale placeholder line was never recognized as
 * replaceable in the first place.
 *
 * Fix: any button-line href that can NEVER become a working link by
 * parseButtonLine's own rule is DEFINITIONALLY safe to treat as "the stale
 * line to replace" — it cannot possibly be a real, working, intentional
 * operator link, so broadening the match can never discard one.
 *
 * Structural + direct-execution, same class as every other verify-*.mts
 * here — withDeliveryLink has no I/O, so this runs it for real rather than
 * just grepping source.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-delivery-link-placeholder-fix.mts
 */
import { withDeliveryLink } from "../src/lib/funnels/cta-integrity";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

// ── 1. The exact real-world reproduction: a hand-typed placeholder gets
// replaced, not duplicated, when the real asset is uploaded ────────────────
{
  const placeholderBody =
    "Hi {{contact.firstName}},\n\nHere's your free guide.\n\n[button: Download your guide](REPLACE-WITH-PDF-LINK)\n\nEnjoy.\n\n{{unsubscribeLink}}";
  const after = withDeliveryLink(placeholderBody, "https://crm.divinex.io/api/funnel-asset/REALASSETID", "Download your copy");
  check("1a. the stale placeholder text is gone", !after.includes("REPLACE-WITH-PDF-LINK"));
  check("1b. the real asset URL is present", after.includes("REALASSETID"));
  check("1c. exactly one button line survives (replaced, not duplicated)", (after.match(/\[button/g) ?? []).length === 1);
  check("1d. the operator's surrounding copy (Enjoy.) is preserved untouched", after.includes("Enjoy."));
}

// ── 2. A real, intentional, unrelated operator button (a genuine https URL
// this wiring never produced) must survive completely untouched ───────────
{
  const operatorBody =
    "Hi there,\n\nBook a slot here:\n\n[button: Book now](https://calendly.com/mybiz/intro)\n\nSee you soon.\n\n{{unsubscribeLink}}";
  const after = withDeliveryLink(operatorBody, "https://crm.divinex.io/api/funnel-asset/REALASSETID2", "Download your copy");
  check("2a. the real operator-authored Calendly link survives verbatim", after.includes("https://calendly.com/mybiz/intro"));
  check("2b. the real delivery link is added separately, not merged into it", after.includes("REALASSETID2"));
  check("2c. both buttons coexist (two distinct CTAs, not a collision)", (after.match(/\[button/g) ?? []).length === 2);
}

// ── 3. REGRESSION GUARD: re-uploading an asset on an already-correctly-
// wired body still swaps cleanly, the original idempotent behavior ─────────
{
  const alreadyWired =
    "Hi,\n\nHere it is.\n\n[button: Download your copy](https://crm.divinex.io/api/funnel-asset/OLDASSETID)\n\n{{unsubscribeLink}}";
  const after = withDeliveryLink(alreadyWired, "https://crm.divinex.io/api/funnel-asset/NEWASSETID", "Download your copy");
  check("3a. the old asset id is gone", !after.includes("OLDASSETID"));
  check("3b. the new asset id is present", after.includes("NEWASSETID"));
  check("3c. still exactly one button (idempotent, not duplicated)", (after.match(/\[button/g) ?? []).length === 1);
}

// ── 4. MUTATION guard: a broken href must genuinely be unparseable by the
// real renderer (lib/email/body.ts), or this whole fix is solving a problem
// that was never actually visible to a recipient ───────────────────────────
{
  const { renderBodyHtml, resolveBrandColors } = await import("../src/lib/email/body");
  const html = renderBodyHtml("[button: Download your guide](REPLACE-WITH-PDF-LINK)", {
    colors: resolveBrandColors(undefined, undefined),
  });
  check(
    "4. a raw placeholder href really does render as literal escaped text (confirms this was genuinely customer-visible)",
    html.includes("[button: Download your guide](REPLACE-WITH-PDF-LINK)") && !html.includes("<a href"),
  );
}

console.log(
  failures === 0
    ? `\nverify-delivery-link-placeholder-fix: all checks passed`
    : `\nverify-delivery-link-placeholder-fix: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
